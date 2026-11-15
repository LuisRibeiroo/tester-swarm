package dev.testerswarm.example.rn

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import dev.testerswarm.sdk.TesterSwarm

class MainActivity : ReactActivity() {
    override fun getMainComponentName(): String = "TesterSwarmReactNativeExample"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TesterSwarm.status(this)
    }
}
