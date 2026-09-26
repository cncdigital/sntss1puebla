package mx.sntss1puebla.credenciales

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class TimedLyric(val atMs: Long, val text: String)

internal object RadioLyrics {
    private val timestamp = Regex("""^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?]\s*(.*)$""")

    fun fetch(id: Int): String {
        require(id > 0)
        val connection = (URL("${RadioCatalog.ORIGIN}/api/radio/lyrics/$id").openConnection() as HttpURLConnection).apply {
            connectTimeout = 5_000
            readTimeout = 7_000
            instanceFollowRedirects = false
            setRequestProperty("Accept", "application/json")
        }
        return try {
            if (connection.responseCode != HttpURLConnection.HTTP_OK) return ""
            val body = connection.inputStream.bufferedReader().use { reader ->
                val buffer = CharArray(4096)
                val result = StringBuilder()
                while (result.length <= 20_000) {
                    val size = reader.read(buffer, 0, minOf(buffer.size, 20_001 - result.length))
                    if (size < 0) break
                    result.append(buffer, 0, size)
                }
                if (result.length > 20_000) return ""
                result.toString()
            }
            JSONObject(body).optString("lyrics").take(12_000)
        } finally {
            connection.disconnect()
        }
    }

    fun parse(text: String): List<TimedLyric> = text.lineSequence().mapNotNull { line ->
        val match = timestamp.matchEntire(line.trim()) ?: return@mapNotNull null
        val minutes = match.groupValues[1].toLongOrNull() ?: return@mapNotNull null
        val seconds = match.groupValues[2].toLongOrNull() ?: return@mapNotNull null
        if (seconds > 59) return@mapNotNull null
        val fraction = match.groupValues[3]
        val milliseconds = fraction.toLongOrNull()?.times(when (fraction.length) { 1 -> 100; 2 -> 10; else -> 1 }) ?: 0
        TimedLyric((minutes * 60 + seconds) * 1_000 + milliseconds, match.groupValues[4])
    }.toList().sortedBy { it.atMs }
}
