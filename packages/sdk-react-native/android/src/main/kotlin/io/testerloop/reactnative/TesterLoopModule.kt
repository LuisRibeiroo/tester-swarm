package io.testerloop.reactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import io.testerloop.sdk.TesterLoop

class TesterLoopModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TesterLoop"

    @ReactMethod
    fun status(promise: Promise) {
        val value = runCatching {
            TesterLoop.status(reactApplicationContext).name
        }.getOrDefault("DISABLED")
        promise.resolve(value)
    }

    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        runCatching {
            TesterLoop.setEnabled(reactApplicationContext, enabled)
        }
        promise.resolve(null)
    }
}
