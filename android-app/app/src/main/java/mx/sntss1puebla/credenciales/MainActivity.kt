package mx.sntss1puebla.credenciales

import android.Manifest
import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var controllerFuture: ListenableFuture<MediaController>
    private var controller: MediaController? = null
    private var playWhenConnected = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWebPermission: PermissionRequest? = null
    private var radioVolumeBeforeDevi = 1f

    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val selected = WebChromeClient.FileChooserParams.parseResult(
            result.resultCode,
            result.data,
        )
        fileCallback?.onReceiveValue(selected)
        fileCallback = null
    }

    private val cameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        pendingWebPermission?.let { request ->
            if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
            else request.deny()
        }
        pendingWebPermission = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.app_web_view)
        progress = findViewById(R.id.loading_indicator)
        connectMediaController()
        configureWebView()

        if (savedInstanceState == null) webView.loadUrl(APP_URL)
        else webView.restoreState(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 20)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = true
            setSupportMultipleWindows(false)
        }
        webView.addJavascriptInterface(NativeRadioBridge(), "NativeRadio")
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                progress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView, url: String?) {
                progress.visibility = View.GONE
                if (Uri.parse(url ?: "").host == APP_HOST) injectRadioBridge(view)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                routeUrl(request.url)
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                return runCatching {
                    filePicker.launch(fileChooserParams.createIntent())
                    true
                }.getOrElse {
                    fileCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                if (request.origin.host != APP_HOST ||
                    !request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                ) {
                    request.deny()
                    return
                }
                runOnUiThread {
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.CAMERA,
                        ) == PackageManager.PERMISSION_GRANTED
                    ) request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    else {
                        pendingWebPermission?.deny()
                        pendingWebPermission = request
                        cameraPermission.launch(Manifest.permission.CAMERA)
                    }
                }
            }
        }
        webView.setDownloadListener { url, _, _, _, _ -> openExternal(Uri.parse(url)) }
    }

    private fun routeUrl(uri: Uri): Boolean {
        if (uri.host == RADIO_PAGE_HOST) {
            playRadio()
            return true
        }
        if (uri.scheme == "https" && uri.host == APP_HOST) return false
        openExternal(uri)
        return true
    }

    private fun injectRadioBridge(view: WebView) {
        view.evaluateJavascript(
            """
            (() => {
              if (window.__sntssNativeRadioReady) return;
              window.__sntssNativeRadioReady = true;
              document.addEventListener('click', (event) => {
                const link = event.target?.closest?.('a[href*="sntss1puebla.radio12345.com"]');
                if (!link || !window.NativeRadio) return;
                event.preventDefault();
                event.stopPropagation();
                window.NativeRadio.play();
              }, true);
              window.addEventListener('sntss:devi-voice-start', () => window.NativeRadio?.duckForDevi?.());
              window.addEventListener('sntss:devi-voice-end', () => window.NativeRadio?.restoreAfterDevi?.());
            })();
            """.trimIndent(),
            null,
        )
    }

    private fun connectMediaController() {
        val token = SessionToken(this, ComponentName(this, RadioPlaybackService::class.java))
        controllerFuture = MediaController.Builder(this, token).buildAsync()
        controllerFuture.addListener({
            controller = runCatching { controllerFuture.get() }.getOrNull()
            if (playWhenConnected) {
                playWhenConnected = false
                playRadio()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun playRadio() {
        val activeController = controller
        if (activeController == null) {
            playWhenConnected = true
            Toast.makeText(this, R.string.radio_connecting, Toast.LENGTH_SHORT).show()
            return
        }
        activeController.setMediaItem(MediaItem.fromUri(RadioPlaybackService.RADIO_STREAM_URL))
        activeController.prepare()
        activeController.play()
        Toast.makeText(this, R.string.radio_connecting, Toast.LENGTH_SHORT).show()
    }

    private fun openExternal(uri: Uri) {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        MediaController.releaseFuture(controllerFuture)
        webView.removeJavascriptInterface("NativeRadio")
        webView.destroy()
        super.onDestroy()
    }

    private fun duckRadioForDevi() {
        controller?.let {
            radioVolumeBeforeDevi = it.volume.coerceIn(0f, 1f)
            it.volume = (radioVolumeBeforeDevi * 0.18f).coerceAtLeast(0.04f)
        }
    }

    private fun restoreRadioAfterDevi() {
        controller?.let { active ->
            val target = radioVolumeBeforeDevi.coerceIn(0f, 1f)
            val start = active.volume
            val steps = 8
            val handler = android.os.Handler(mainLooper)
            for (step in 1..steps) {
                handler.postDelayed({
                    if (::webView.isInitialized) {
                        active.volume = start + ((target - start) * step / steps)
                    }
                }, step * 55L)
            }
        }
    }

    inner class NativeRadioBridge {
        @JavascriptInterface
        fun play() = runOnUiThread { playRadio() }

        @JavascriptInterface
        fun duckForDevi() = runOnUiThread { duckRadioForDevi() }

        @JavascriptInterface
        fun restoreAfterDevi() = runOnUiThread { restoreRadioAfterDevi() }
    }

    companion object {
        private const val APP_URL =
            "https://credencialessntss1puebla.guardiandelallama.chatgpt.site"
        private const val APP_HOST = "credencialessntss1puebla.guardiandelallama.chatgpt.site"
        private const val RADIO_PAGE_HOST = "sntss1puebla.radio12345.com"
    }
}
