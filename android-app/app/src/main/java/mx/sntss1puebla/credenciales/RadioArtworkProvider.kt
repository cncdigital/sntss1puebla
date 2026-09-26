package mx.sntss1puebla.credenciales

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileNotFoundException
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/** Android Auto opens local content URIs; the provider caches only public song artwork. */
class RadioArtworkProvider : ContentProvider() {
    companion object {
        const val AUTHORITY = "mx.sntss1puebla.credenciales.artwork"
        fun uri(id: Int): Uri = Uri.parse("content://$AUTHORITY/song/$id")
    }

    override fun onCreate(): Boolean = true
    override fun getType(uri: Uri): String = "image/*"
    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r" || uri.authority != AUTHORITY || uri.pathSegments.size != 2 || uri.pathSegments[0] != "song")
            throw FileNotFoundException()
        val id = uri.pathSegments[1].toIntOrNull()?.takeIf { it > 0 } ?: throw FileNotFoundException()
        val base = context?.cacheDir ?: throw FileNotFoundException()
        val cached = File(base, "radio-cover-$id.img")
        if (!cached.exists() || System.currentTimeMillis() - cached.lastModified() > 300_000) {
            val connection = (URL("${RadioCatalog.ORIGIN}/api/radio/cover/$id").openConnection() as HttpURLConnection).apply {
                connectTimeout = 4_000
                readTimeout = 5_000
                instanceFollowRedirects = false
                setRequestProperty("Accept", "image/jpeg, image/png, image/webp")
            }
            try {
                if (connection.responseCode == HttpURLConnection.HTTP_NOT_FOUND) {
                    cached.delete()
                    throw FileNotFoundException()
                }
                if (connection.responseCode != HttpURLConnection.HTTP_OK ||
                    connection.contentType?.substringBefore(';') !in setOf("image/jpeg", "image/png", "image/webp"))
                    throw FileNotFoundException()
                val bytes = connection.inputStream.use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (output.size() <= 3 * 1024 * 1024) {
                        val size = input.read(buffer)
                        if (size < 0) break
                        output.write(buffer, 0, size)
                    }
                    output.toByteArray()
                }
                if (bytes.isEmpty() || bytes.size > 3 * 1024 * 1024) throw FileNotFoundException()
                val temp = File(base, "radio-cover-$id.tmp")
                temp.writeBytes(bytes)
                if (!temp.renameTo(cached)) { temp.delete(); throw FileNotFoundException() }
            } catch (error: Exception) {
                if (!cached.exists()) throw FileNotFoundException(error.message)
            } finally { connection.disconnect() }
        }
        return ParcelFileDescriptor.open(cached, ParcelFileDescriptor.MODE_READ_ONLY)
    }
}
