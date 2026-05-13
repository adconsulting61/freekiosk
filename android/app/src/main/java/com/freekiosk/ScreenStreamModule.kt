package com.freekiosk

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class ScreenStreamModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val REQUEST_CODE = 9201
        var instance: ScreenStreamModule? = null
    }

    private var pendingPromise: Promise? = null
    private var pendingRelayUrl: String? = null
    private var pendingDeviceId: String? = null
    private var pendingQuality: Int = 40
    private var pendingFps: Int = 2

    init {
        reactContext.addActivityEventListener(this)
        instance = this
    }

    override fun getName(): String = "ScreenStreamModule"

    @ReactMethod
    fun startStreaming(relayUrl: String, deviceId: String, quality: Int, fps: Int, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }

        // Stop any existing stream first
        stopStreamingService()

        pendingPromise = promise
        pendingRelayUrl = relayUrl
        pendingDeviceId = deviceId
        pendingQuality = quality
        pendingFps = fps

        val mgr = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        activity.startActivityForResult(mgr.createScreenCaptureIntent(), REQUEST_CODE)
    }

    @ReactMethod
    fun stopStreaming(promise: Promise) {
        stopStreamingService()
        promise.resolve(true)
    }

    @ReactMethod
    fun isStreaming(promise: Promise) {
        promise.resolve(ScreenStreamService.isRunning)
    }

    private fun stopStreamingService() {
        val intent = Intent(reactContext, ScreenStreamService::class.java)
        reactContext.stopService(intent)
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE) return

        if (resultCode == Activity.RESULT_OK && data != null) {
            val intent = Intent(reactContext, ScreenStreamService::class.java).apply {
                putExtra(ScreenStreamService.EXTRA_RESULT_CODE, resultCode)
                putExtra(ScreenStreamService.EXTRA_DATA, data)
                putExtra(ScreenStreamService.EXTRA_RELAY_URL, pendingRelayUrl)
                putExtra(ScreenStreamService.EXTRA_DEVICE_ID, pendingDeviceId)
                putExtra(ScreenStreamService.EXTRA_QUALITY, pendingQuality)
                putExtra(ScreenStreamService.EXTRA_FPS, pendingFps)
            }
            ContextCompat.startForegroundService(reactContext, intent)
            pendingPromise?.resolve(true)
        } else {
            pendingPromise?.reject("PERMISSION_DENIED", "Screen capture permission denied by user")
        }
        pendingPromise = null
    }

    override fun onNewIntent(intent: Intent?) {}

    fun emitEvent(event: String, data: Any?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, data)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
