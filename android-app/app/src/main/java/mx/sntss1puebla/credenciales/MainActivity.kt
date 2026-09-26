package mx.sntss1puebla.credenciales

import android.Manifest
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.Color
import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.graphics.drawable.ColorDrawable
import android.graphics.Typeface
import android.app.Dialog
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.text.style.RelativeSizeSpan
import android.widget.ImageView
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.Button
import android.widget.SeekBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.session.MediaBrowser
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.Executors

/** Phone player. Android Auto renders the same MediaLibrarySession using its own safe controls. */
class MainActivity : ComponentActivity() {
    private lateinit var browserFuture: ListenableFuture<MediaBrowser>
    private var browser: MediaBrowser? = null
    private var playWhenConnected = false
    private lateinit var title: TextView
    private lateinit var artist: TextView
    private lateinit var status: TextView
    private lateinit var playButton: Button
    private lateinit var previousButton: Button
    private lateinit var nextButton: Button
    private lateinit var seek: SeekBar
    private lateinit var progress: TextView
    private lateinit var lyricsView: TextView
    private lateinit var lyricsScroll: ScrollView
    private lateinit var cover: ImageView
    private lateinit var ghost: TextView
    private var fullScreen: Dialog? = null
    private var coverBitmap: Bitmap? = null
    private var currentGhost = ""
    private val lyricExecutor = Executors.newSingleThreadExecutor()
    private var currentLyricSongId = -1
    private var timedLyrics: List<TimedLyric> = emptyList()
    private var shownLyricLine = -1
    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            renderProgress()
            handler.postDelayed(this, 750)
        }
    }
    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = render()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        title = findViewById(R.id.song_title)
        artist = findViewById(R.id.song_artist)
        status = findViewById(R.id.radio_status)
        playButton = findViewById(R.id.play_native_radio)
        previousButton = findViewById(R.id.previous_song)
        nextButton = findViewById(R.id.next_song)
        seek = findViewById(R.id.song_seek)
        progress = findViewById(R.id.song_progress)
        lyricsView = findViewById(R.id.song_lyrics)
        lyricsScroll = findViewById(R.id.lyrics_scroll)
        cover = findViewById(R.id.song_cover)
        ghost = findViewById(R.id.ghost_lyric)
        findViewById<Button>(R.id.maximize_radio).setOnClickListener { showFullScreen() }
        playButton.setOnClickListener {
            val player = browser
            if (player == null || player.mediaItemCount == 0) startRadio()
            else if (player.isPlaying) player.pause() else player.play()
        }
        previousButton.setOnClickListener { browser?.seekToPreviousMediaItem() }
        nextButton.setOnClickListener { browser?.seekToNextMediaItem() }
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar, value: Int, fromUser: Boolean) {
                if (fromUser) progress.text = formatTime(value.toLong())
            }
            override fun onStartTrackingTouch(bar: SeekBar) = Unit
            override fun onStopTrackingTouch(bar: SeekBar) { browser?.seekTo(bar.progress.toLong()) }
        })
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 20)
        val token = SessionToken(this, ComponentName(this, RadioPlaybackService::class.java))
        browserFuture = MediaBrowser.Builder(this, token).buildAsync()
        browserFuture.addListener({
            browser = runCatching { browserFuture.get() }.getOrNull()
            browser?.addListener(listener)
            render()
            if (playWhenConnected) {
                playWhenConnected = false
                startRadio()
            }
        }, ContextCompat.getMainExecutor(this))
        handler.post(tick)
    }

    private fun startRadio() {
        val controller = browser ?: run {
            playWhenConnected = true
            status.setText(R.string.radio_connecting)
            return
        }
        status.setText(R.string.radio_connecting)
        playButton.isEnabled = false
        val songsFuture = controller.getChildren(RadioCatalog.SONGS_ID, 0, 500, null)
        songsFuture.addListener({
            playButton.isEnabled = true
            val songs = runCatching { songsFuture.get().value }.getOrNull()
            if (songs.isNullOrEmpty()) {
                status.setText(R.string.radio_sign_in)
                return@addListener
            }
            controller.setMediaItems(songs)
            controller.prepare()
            controller.play()
            render()
        }, ContextCompat.getMainExecutor(this))
    }

    private fun render() {
        val player = browser
        val item = player?.currentMediaItem
        title.text = item?.mediaMetadata?.title ?: getString(R.string.radio_title)
        artist.text = item?.mediaMetadata?.artist ?: getString(R.string.radio_subtitle)
        playButton.text = getString(if (player?.isPlaying == true) R.string.radio_paused else R.string.play_radio_car)
        previousButton.isEnabled = player?.hasPreviousMediaItem() == true
        nextButton.isEnabled = player?.hasNextMediaItem() == true
        if (item != null) status.setText(R.string.radio_ready)
        val songId = item?.mediaId?.removePrefix("song:")?.toIntOrNull() ?: -1
        if (songId != currentLyricSongId) {
            currentLyricSongId = songId
            coverBitmap = null
            currentGhost = ""
            cover.setImageResource(R.drawable.ic_radio)
            ghost.visibility = View.GONE
            timedLyrics = emptyList()
            shownLyricLine = -1
            lyricsView.setText(R.string.song_lyrics_empty)
            if (songId > 0 && item?.mediaMetadata?.artworkUri?.scheme == "content") lyricExecutor.execute {
                val uri = RadioArtworkProvider.uri(songId)
                val bytes = runCatching { contentResolver.openInputStream(uri)?.use { stream ->
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (output.size() < 3 * 1024 * 1024) {
                        val count = stream.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray()
                } }.getOrNull()
                val bitmap = bytes?.let {
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(it, 0, it.size, bounds)
                    if (bounds.outWidth > 0 && bounds.outHeight > 0) {
                        val options = BitmapFactory.Options().apply {
                            inSampleSize = (maxOf(bounds.outWidth, bounds.outHeight) / 512).coerceAtLeast(1)
                        }
                        BitmapFactory.decodeByteArray(it, 0, it.size, options)
                    } else null
                }
                runOnUiThread {
                    if (!isDestroyed && currentLyricSongId == songId && bitmap != null) {
                        coverBitmap = bitmap
                        cover.setImageBitmap(bitmap)
                        fullScreen?.findViewById<ImageView>(R.id.full_cover)?.setImageBitmap(bitmap)
                    }
                }
            }
            if (songId > 0) lyricExecutor.execute {
                val raw = runCatching { RadioLyrics.fetch(songId) }.getOrDefault("")
                val parsed = RadioLyrics.parse(raw)
                runOnUiThread {
                    if (currentLyricSongId != songId || isDestroyed) return@runOnUiThread
                    timedLyrics = parsed
                    lyricsView.text = if (parsed.isNotEmpty()) parsed.joinToString("\n") { it.text.ifBlank { "♪" } }
                        else raw.replace(Regex("(?m)^\\[\\d{1,2}:\\d{2}[^]]*]\\s*"), "").ifBlank { getString(R.string.song_lyrics_empty) }
                    if (parsed.isEmpty()) {
                        currentGhost = lyricsView.text.toString().lineSequence().firstOrNull { it.isNotBlank() }?.take(140).orEmpty()
                        updateFullScreen()
                    }
                    lyricsScroll.scrollTo(0, 0)
                    renderLyricProgress()
                }
            }
        }
        renderProgress()
        updateFullScreen()
    }

    private fun renderProgress() {
        val player = browser
        val duration = player?.duration?.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
        seek.max = duration.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        if (!seek.isPressed) seek.progress = (player?.currentPosition ?: 0L).coerceIn(0L, duration).toInt()
        progress.text = "${formatTime(player?.currentPosition ?: 0L)} / ${formatTime(duration)}"
        renderLyricProgress()
    }

    private fun renderLyricProgress() {
        if (timedLyrics.isEmpty()) return
        val position = browser?.currentPosition ?: return
        val current = timedLyrics.indexOfLast { it.atMs <= position }
        if (current == shownLyricLine || current < 0) return
        shownLyricLine = current
        val offsets = timedLyrics.map { it.text.ifBlank { "♪" } }
        val full = offsets.joinToString("\n")
        val begin = offsets.take(current).sumOf { it.length + 1 }
        val end = begin + offsets[current].length
        val styled = SpannableString(full)
        styled.setSpan(ForegroundColorSpan(Color.rgb(242, 179, 33)), begin, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        styled.setSpan(StyleSpan(Typeface.BOLD), begin, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        styled.setSpan(RelativeSizeSpan(1.3f), begin, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        lyricsView.text = styled
        ghost.text = offsets[current]
        currentGhost = offsets[current]
        ghost.visibility = View.VISIBLE
        updateFullScreen()
        lyricsView.post {
            val line = lyricsView.layout?.getLineForOffset(begin) ?: return@post
            lyricsScroll.smoothScrollTo(0, (lyricsView.layout.getLineTop(line) - lyricsScroll.height / 3).coerceAtLeast(0))
        }
    }

    private fun formatTime(milliseconds: Long): String {
        val seconds = milliseconds.coerceAtLeast(0) / 1_000
        return "%d:%02d".format(seconds / 60, seconds % 60)
    }

    private fun showFullScreen() {
        if (fullScreen?.isShowing == true) return
        val dialog = Dialog(this, android.R.style.Theme_Material_NoActionBar)
        dialog.setContentView(R.layout.dialog_radio_fullscreen)
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.BLACK))
        dialog.window?.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Android 15+ can draw a full-screen dialog behind the gesture/navigation bar.
        // Keep artwork edge-to-edge while reserving the system insets for the controls.
        dialog.window?.let { WindowCompat.setDecorFitsSystemWindows(it, false) }
        val fullRoot = dialog.findViewById<FrameLayout>(R.id.full_root)
        ViewCompat.setOnApplyWindowInsetsListener(fullRoot) { view, insets ->
            val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            insets
        }
        dialog.setOnDismissListener { if (fullScreen === dialog) fullScreen = null }
        dialog.findViewById<Button>(R.id.full_close).setOnClickListener { dialog.dismiss() }
        dialog.findViewById<Button>(R.id.full_previous).setOnClickListener { browser?.seekToPreviousMediaItem() }
        dialog.findViewById<Button>(R.id.full_next).setOnClickListener { browser?.seekToNextMediaItem() }
        dialog.findViewById<Button>(R.id.full_play).setOnClickListener {
            val player = browser
            if (player == null || player.mediaItemCount == 0) startRadio()
            else if (player.isPlaying) player.pause() else player.play()
        }
        fullScreen = dialog
        dialog.show()
        dialog.window?.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT)
        ViewCompat.requestApplyInsets(fullRoot)
        updateFullScreen()
    }

    private fun updateFullScreen() {
        val dialog = fullScreen?.takeIf { it.isShowing } ?: return
        val image = dialog.findViewById<ImageView>(R.id.full_cover)
        if (coverBitmap != null) image.setImageBitmap(coverBitmap)
        else image.setImageResource(R.drawable.ic_radio)
        dialog.findViewById<TextView>(R.id.full_lyric).text = currentGhost.ifBlank { getString(R.string.song_lyrics_empty) }
        dialog.findViewById<TextView>(R.id.full_title).text = title.text
        dialog.findViewById<TextView>(R.id.full_artist).text = artist.text
        dialog.findViewById<Button>(R.id.full_play).text = playButton.text
    }

    override fun onDestroy() {
        fullScreen?.dismiss()
        handler.removeCallbacks(tick)
        browser?.removeListener(listener)
        lyricExecutor.shutdownNow()
        MediaBrowser.releaseFuture(browserFuture)
        super.onDestroy()
    }
}
