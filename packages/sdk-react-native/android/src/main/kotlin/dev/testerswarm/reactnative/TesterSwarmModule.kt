package dev.testerswarm.reactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import dev.testerswarm.sdk.TesterSwarm

class TesterSwarmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TesterSwarm"

    @ReactMethod
    fun status(promise: Promise) {
        val value = runCatching {
            TesterSwarm.status(reactApplicationContext).name
        }.getOrDefault("DISABLED")
        promise.resolve(value)
    }

    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        runCatching {
            TesterSwarm.setEnabled(reactApplicationContext, enabled)
        }
        promise.resolve(null)
    }
}
