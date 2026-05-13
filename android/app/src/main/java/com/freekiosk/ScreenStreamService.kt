package com.freekiosk

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import okhttp3.*
import okio.ByteString
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

class ScreenStreamService : Service() {

    companion object {
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_DATA = "data"
        const val EXTRA_RELAY_URL = "relayUrl"
        const val EXTRA_DEVICE_ID = "deviceId"
        const val EXTRA_QUALITY = "quality"
        const val EXTRA_FPS = "fps"

        const val CHANNEL_ID = "ScreenStream"
        const val NOTIFICATION_ID = 5001

        @Volatile
        var isRunning: Boolean = false
    }

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var webSocket: WebSocket? = null
    private var okHttpClient: OkHttpClient? = null
    private val handler = Handler(Looper.getMainLooper())
    private var captureRunnable: Runnable? = null

    private var relayUrl: String = ""
    private var deviceId: String = ""
    private var quality: Int = 40
    private var frameIntervalMs: Long = 500 // 2 fps default

    private var displayWidth: Int = 0
    private var displayHeight: Int = 0
    private var displayDpi: Int = 0

    private var reconnectAttempts: Int = 0
    private val maxReconnectAttempts = 10

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Connecting…"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        relayUrl = intent.getStringExtra(EXTRA_RELAY_URL) ?: run { stopSelf(); return START_NOT_STICKY }
        deviceId = intent.getStringExtra(EXTRA_DEVICE_ID) ?: run { stopSelf(); return START_NOT_STICKY }
        quality = intent.getIntExtra(EXTRA_QUALITY, 40).coerceIn(10, 90)
        val fps = intent.getIntExtra(EXTRA_FPS, 2).coerceIn(1, 10)
        frameIntervalMs = (1000 / fps).toLong()

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val data: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_DATA)
        }

        if (data == null) { stopSelf(); return START_NOT_STICKY }

        val metrics = DisplayMetrics()
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            displayWidth = bounds.width() / 2
            displayHeight = bounds.height() / 2
            displayDpi = resources.displayMetrics.densityDpi
        } else {
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getMetrics(metrics)
            displayWidth = metrics.widthPixels / 2
            displayHeight = metrics.heightPixels / 2
            displayDpi = metrics.densityDpi
        }

        val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            mediaProjection = mgr.getMediaProjection(resultCode, data)
            mediaProjection?.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    cleanupCapture()
                    stopSelf()
                }
            }, handler)
        } else {
            mediaProjection = mgr.getMediaProjection(resultCode, data)
        }

        setupImageReader()
        connectWebSocket()

        return START_NOT_STICKY
    }

    private fun setupImageReader() {
        imageReader?.close()
        imageReader = ImageReader.newInstance(displayWidth, displayHeight, PixelFormat.RGBA_8888, 2)
        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "FreeKioskStream",
            displayWidth, displayHeight, displayDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface, null, null
        )
    }

    private fun connectWebSocket() {
        okHttpClient?.dispatcher?.executorService?.shutdown()
        okHttpClient = OkHttpClient.Builder()
            .pingInterval(20, TimeUnit.SECONDS)
            .connectTimeout(10, TimeUnit.SECONDS)
            .build()

        val wsUrl = buildString {
            append(relayUrl.trimEnd('/'))
            append("/ws?role=tablet&deviceId=")
            append(deviceId)
        }

        val request = Request.Builder().url(wsUrl).build()
        okHttpClient?.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                webSocket = ws
                reconnectAttempts = 0
                updateNotification("Streaming…")
                ScreenStreamModule.instance?.emitEvent("screenStreamStatus", "connected")
                startCapturing()
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                webSocket = null
                stopCapturing()
                updateNotification("Reconnecting…")
                ScreenStreamModule.instance?.emitEvent("screenStreamStatus", "disconnected")
                scheduleReconnect()
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                webSocket = null
                stopCapturing()
                updateNotification("Disconnected")
                ScreenStreamModule.instance?.emitEvent("screenStreamStatus", "disconnected")
            }
        })
    }

    private fun scheduleReconnect() {
        if (reconnectAttempts >= maxReconnectAttempts) {
            stopSelf()
            return
        }
        reconnectAttempts++
        val delay = (reconnectAttempts * 3000L).coerceAtMost(30000L)
        handler.postDelayed({ connectWebSocket() }, delay)
    }

    private fun startCapturing() {
        stopCapturing()
        captureRunnable = object : Runnable {
            override fun run() {
                captureAndSendFrame()
                if (webSocket != null) {
                    handler.postDelayed(this, frameIntervalMs)
                }
            }
        }
        handler.post(captureRunnable!!)
    }

    private fun stopCapturing() {
        captureRunnable?.let { handler.removeCallbacks(it) }
        captureRunnable = null
    }

    private fun captureAndSendFrame() {
        val ws = webSocket ?: return
        val reader = imageReader ?: return

        val image = reader.acquireLatestImage() ?: return
        try {
            val planes = image.planes
            val buffer = planes[0].buffer
            val pixelStride = planes[0].pixelStride
            val rowStride = planes[0].rowStride
            val rowPadding = rowStride - pixelStride * image.width

            val bitmapWidth = image.width + rowPadding / pixelStride
            val full = Bitmap.createBitmap(bitmapWidth, image.height, Bitmap.Config.ARGB_8888)
            full.copyPixelsFromBuffer(buffer)

            val cropped = if (bitmapWidth != image.width) {
                Bitmap.createBitmap(full, 0, 0, image.width, image.height).also { full.recycle() }
            } else {
                full
            }

            val baos = ByteArrayOutputStream()
            cropped.compress(Bitmap.CompressFormat.JPEG, quality, baos)
            cropped.recycle()

            ws.send(ByteString.of(*baos.toByteArray()))
        } catch (_: Exception) {
        } finally {
            image.close()
        }
    }

    private fun cleanupCapture() {
        stopCapturing()
        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.close()
        imageReader = null
        mediaProjection?.stop()
        mediaProjection = null
    }

    override fun onDestroy() {
        isRunning = false
        cleanupCapture()
        webSocket?.close(1000, "Service stopped")
        webSocket = null
        okHttpClient?.dispatcher?.executorService?.shutdown()
        okHttpClient = null
        handler.removeCallbacksAndMessages(null)
        ScreenStreamModule.instance?.emitEvent("screenStreamStatus", "stopped")
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Screen Stream",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Remote monitoring stream"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Remote Monitoring")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

    private fun updateNotification(text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(text))
    }
}
