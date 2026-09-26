package mx.sntss1puebla.credenciales

import android.app.PendingIntent
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.net.Uri
import android.speech.tts.TextToSpeech
import java.util.Locale
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionError
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import java.util.concurrent.Executors

/** Exposes the authorized portal library to Android Auto's driver-safe media UI. */
class RadioPlaybackService : MediaLibraryService() {
    private val catalogExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private lateinit var voicePlayer: ExoPlayer
    private var announcementStarted = false
    private var completedSongs = 0
    private var elapsedMusicMs = 0L
    private var lastSongPositionMs = 0L
    private var commercials: List<MediaItem> = emptyList()
    private var intervalMinutes = 0
    private var commercialIndex = 0
    private var facts: List<RadioCatalog.Fact> = emptyList()
    private var lastFactId: String? = null
    private var pendingFact = false
    private var pendingIntroduction = false
    private var lastMediaId: String? = null
    private val catalogRefresh = object : Runnable {
        override fun run() {
            if (player.mediaItemCount > 0) catalogExecutor.execute { runCatching { refreshCatalog() } }
            mainHandler.postDelayed(this, 60_000)
        }
    }
    private val positionRefresh = object : Runnable {
        override fun run() {
            if (::player.isInitialized && player.isPlaying && player.currentMediaItem?.mediaId?.startsWith("song:") == true)
                lastSongPositionMs = player.currentPosition
            mainHandler.postDelayed(this, 1_000)
        }
    }
    private var activeAnnouncement: String? = null
    private var networkWarningTts: TextToSpeech? = null
    private var lastNetworkWarningAt = 0L
    private val networkProbe = object : Runnable {
        override fun run() {
            if (::player.isInitialized && player.isPlaying) {
                catalogExecutor.execute {
                    if (probeConnectionIsSlow()) mainHandler.post { announceConnectionWarning() }
                }
            }
            mainHandler.postDelayed(this, 30_000)
        }
    }
    @Volatile private var songs: List<MediaItem> = emptyList()
    private lateinit var httpFactory: DefaultHttpDataSource.Factory
    private lateinit var player: ExoPlayer
    private lateinit var librarySession: MediaLibrarySession

    private val callback = object : MediaLibrarySession.Callback {
        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofItem(RadioCatalog.rootItem(), params))

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            if (parentId == RadioCatalog.ROOT_ID)
                return Futures.immediateFuture(LibraryResult.ofItemList(listOf(RadioCatalog.songsFolder()), params))
            if (parentId != RadioCatalog.SONGS_ID || page < 0 || pageSize <= 0)
                return Futures.immediateFuture(LibraryResult.ofError(SessionError.ERROR_BAD_VALUE))
            val result = SettableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
            catalogExecutor.execute {
                try {
                    refreshCatalog()
                    val from = (page.toLong() * pageSize).coerceAtMost(songs.size.toLong()).toInt()
                    val to = (from.toLong() + pageSize).coerceAtMost(songs.size.toLong()).toInt()
                    result.set(LibraryResult.ofItemList(songs.subList(from, to), params))
                } catch (_: Exception) {
                    result.set(LibraryResult.ofItemList(emptyList(), params))
                }
            }
            return result
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String,
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val item = when (mediaId) {
                RadioCatalog.ROOT_ID -> RadioCatalog.rootItem()
                RadioCatalog.SONGS_ID -> RadioCatalog.songsFolder()
                else -> songs.firstOrNull { it.mediaId == mediaId }
            }
            return Futures.immediateFuture(if (item != null) LibraryResult.ofItem(item, null)
                else LibraryResult.ofError(SessionError.ERROR_BAD_VALUE))
        }

        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: List<MediaItem>,
        ): ListenableFuture<List<MediaItem>> = Futures.immediateFuture(
            mediaItems.mapNotNull { candidate -> songs.firstOrNull { it.mediaId == candidate.mediaId } },
        )

        @androidx.annotation.OptIn(UnstableApi::class)
        override fun onSetMediaItems(
            mediaSession: MediaSession,
            browser: MediaSession.ControllerInfo,
            mediaItems: List<MediaItem>,
            startIndex: Int,
            startPositionMs: Long,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val selected = mediaItems.getOrNull(startIndex)
            val index = songs.indexOfFirst { it.mediaId == selected?.mediaId }
            val queue = if (mediaItems.size == 1 && index >= 0) songs
                else mediaItems.mapNotNull { candidate -> songs.firstOrNull { it.mediaId == candidate.mediaId } }
            val position = if (queue === songs) index else startIndex.coerceIn(0, (queue.size - 1).coerceAtLeast(0))
            return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(queue, position, startPositionMs))
        }
    }

    override fun onCreate() {
        super.onCreate()
        httpFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(false)
            .setUserAgent("SNTSS1Puebla-Radio-Android/1.0")
        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(this).setDataSourceFactory(httpFactory))
            .build().apply {
                setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(), true)
                setHandleAudioBecomingNoisy(true)
                setWakeMode(C.WAKE_MODE_NETWORK)
                repeatMode = Player.REPEAT_MODE_ALL
            }
        voicePlayer = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(this).setDataSourceFactory(httpFactory))
            .build().apply {
                setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                    .build(), false)
            }
        voicePlayer.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (activeAnnouncement == null) return
                if (state == Player.STATE_READY && !announcementStarted) {
                    if (!player.isPlaying) finishAnnouncement()
                    else {
                        announcementStarted = true
                        player.volume = 0.18f
                    }
                } else if (state == Player.STATE_ENDED) finishAnnouncement()
            }
            override fun onPlayerError(error: PlaybackException) = finishAnnouncement()
        })
        player.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                val index = player.currentMediaItemIndex
                if (player.currentMediaItem?.mediaId?.startsWith("commercial:") == true && index >= 0) {
                    player.removeMediaItem(index)
                    if (player.mediaItemCount > 0) {
                        player.prepare()
                        player.play()
                    }
                }
            }
            override fun onMediaItemTransition(item: MediaItem?, reason: Int) {
                finishAnnouncement()
                val previous = lastMediaId
                lastMediaId = item?.mediaId
                if (item?.mediaId?.startsWith("song:") == true && reason != Player.MEDIA_ITEM_TRANSITION_REASON_AUTO && previous != item.mediaId) {
                    pendingIntroduction = true
                    mainHandler.post { if (player.currentMediaItem?.mediaId == item.mediaId) announceIfDue(item) }
                }
                if (reason != Player.MEDIA_ITEM_TRANSITION_REASON_AUTO || item == null) return
                if (previous?.startsWith("commercial:") == true) {
                    // The inserted commercial has finished; remove it from the music queue.
                    val priorIndex = player.currentMediaItemIndex - 1
                    if (priorIndex >= 0) mainHandler.post { if (priorIndex < player.mediaItemCount && player.getMediaItemAt(priorIndex).mediaId == previous) player.removeMediaItem(priorIndex) }
                    if (item.mediaId.startsWith("song:")) announceIfDue(item)
                    return
                }
                if (previous?.startsWith("song:") != true || !item.mediaId.startsWith("song:")) return
                if (songs.size > 1 && previous == songs.last().mediaId && item.mediaId == songs.first().mediaId) {
                    val next = songs.shuffled().toMutableList()
                    if (next.first().mediaId == previous) next.add(0, next.removeAt(1))
                    songs = listOf(item) + next.filter { it.mediaId != item.mediaId }
                    player.replaceMediaItems(player.currentMediaItemIndex + 1, player.mediaItemCount, songs.drop(1))
                }
                elapsedMusicMs += lastSongPositionMs.coerceAtLeast(0)
                lastSongPositionMs = 0
                completedSongs += 1
                pendingIntroduction = true
                pendingFact = completedSongs % 5 == 0
                if (intervalMinutes >= 5 && commercials.isNotEmpty() && elapsedMusicMs >= intervalMinutes * 60_000L) {
                    val commercial = commercials[commercialIndex % commercials.size]
                    commercialIndex += 1
                    elapsedMusicMs = 0
                    val nextIndex = player.currentMediaItemIndex
                    player.addMediaItem(nextIndex, commercial)
                    player.seekTo(nextIndex, 0)
                    return
                }
                announceIfDue(item)
            }
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (!isPlaying) finishAnnouncement()
                if (isPlaying) player.currentMediaItem?.takeIf { it.mediaId.startsWith("song:") }?.let { announceIfDue(it) }
            }
        })
        mainHandler.post(positionRefresh)
        mainHandler.postDelayed(catalogRefresh, 60_000)
        val openApp = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        librarySession = MediaLibrarySession.Builder(this, player, callback)
            .setSessionActivity(openApp)
            .build()
    }

    private fun probeConnectionIsSlow(): Boolean {
        val started = System.nanoTime()
        val connection = runCatching {
            (URL("${RadioCatalog.ORIGIN}/api/radio/catalog?probe=${System.currentTimeMillis()}").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 2_500
                readTimeout = 2_500
                setRequestProperty("Accept", "application/json")
                inputStream.use { stream ->
                    val buffer = ByteArray(512)
                    stream.read(buffer)
                }
            }
        }.getOrNull() ?: return true
        connection.disconnect()
        return (System.nanoTime() - started) / 1_000_000 > 2_500
    }

    private fun announceConnectionWarning() {
        val now = System.currentTimeMillis()
        if (now - lastNetworkWarningAt < 120_000 || !::player.isInitialized || !player.isPlaying) return
        val tts = networkWarningTts ?: return
        lastNetworkWarningAt = now
        tts.speak(
            "La conexión a internet parece lenta o inestable. La reproducción podría verse afectada por esta causa.",
            TextToSpeech.QUEUE_FLUSH,
            null,
            "radio-network-warning",
        )
    }

    private fun announceIfDue(item: MediaItem) {
        if (!player.playWhenReady || (!pendingIntroduction && !pendingFact)) return
        val trackId = item.mediaId.removePrefix("song:").toIntOrNull() ?: return
        pendingIntroduction = false
        val factDue = pendingFact
        pendingFact = false
        val fact = if (factDue) facts.filter { it.id != lastFactId }.randomOrNull() ?: facts.randomOrNull() else null
        lastFactId = fact?.id ?: lastFactId
        val style = completedSongs % 12
        val url = Uri.parse("https://sntss1puebla.com/api/radio/voice").buildUpon()
            .appendQueryParameter("trackId", trackId.toString())
            .appendQueryParameter("style", style.toString())
            .apply { if (fact != null) appendQueryParameter("factId", fact.id) }
            .build()
        val id = "radio-voice-${System.currentTimeMillis()}"
        activeAnnouncement = id
        announcementStarted = false
        voicePlayer.stop()
        voicePlayer.setMediaItem(MediaItem.fromUri(url))
        voicePlayer.prepare()
        voicePlayer.play()
        // A late request must never interrupt the next song or a user's pause.
        mainHandler.postDelayed({ if (activeAnnouncement == id && !announcementStarted) finishAnnouncement() }, 12_000)
    }

    private fun refreshCatalog() {
        val program = RadioCatalog.loadProgram()
        if (program.songs.isEmpty() && songs.isNotEmpty()) return
        val previousFirst = getSharedPreferences("radio", MODE_PRIVATE).getString("first", null)
        val existing = songs.map { it.mediaId }.toSet()
        val ordered = if (existing.isEmpty()) program.songs.shuffled().let { shuffled ->
            if (shuffled.size > 1 && shuffled.first().mediaId == previousFirst)
                shuffled.toMutableList().apply { add(0, removeAt(1)) } else shuffled
        } else songs.mapNotNull { prior -> program.songs.find { it.mediaId == prior.mediaId } } +
            program.songs.filter { it.mediaId !in existing }.shuffled()
        songs = ordered
        if (existing.isEmpty()) ordered.firstOrNull()?.let { getSharedPreferences("radio", MODE_PRIVATE).edit().putString("first", it.mediaId).apply() }
        mainHandler.post {
            commercials = program.commercials
            intervalMinutes = program.intervalMinutes
            facts = program.facts
            if (player.mediaItemCount > 0 && player.currentMediaItem?.mediaId?.startsWith("song:") == true) {
                val current = player.currentMediaItem ?: return@post
                val currentIndex = player.currentMediaItemIndex
                val tail = ordered.dropWhile { it.mediaId != current.mediaId }.drop(1) + ordered.takeWhile { it.mediaId != current.mediaId }
                player.replaceMediaItems(currentIndex + 1, player.mediaItemCount, tail)
            }
        }
    }

    private fun finishAnnouncement() {
        if (activeAnnouncement == null) return
        activeAnnouncement = null
        announcementStarted = false
        player.volume = 1f
        voicePlayer.stop()
        voicePlayer.clearMediaItems()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession = librarySession

    override fun onTaskRemoved(rootIntent: Intent?) {
        if ((!player.playWhenReady && activeAnnouncement == null) || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(catalogRefresh)
        mainHandler.removeCallbacks(positionRefresh)
        librarySession.release()
        finishAnnouncement()
        voicePlayer.release()
        player.release()
        catalogExecutor.shutdownNow()
        super.onDestroy()
    }
}
