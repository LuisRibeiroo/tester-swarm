package dev.testerswarm.sdk.internal

import android.content.Context
import androidx.startup.Initializer
import dev.testerswarm.sdk.TesterSwarm

internal class TesterSwarmInitializer : Initializer<Unit> {
    override fun create(context: Context) {
        TesterSwarm.init(context)
    }

    override fun dependencies(): List<Class<out Initializer<*>>> = emptyList()
}
