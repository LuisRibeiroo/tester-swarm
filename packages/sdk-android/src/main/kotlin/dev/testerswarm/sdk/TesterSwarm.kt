package dev.testerswarm.sdk

import android.content.Context
import android.util.Log
import dev.testerswarm.sdk.internal.ApiClient
import dev.testerswarm.sdk.internal.AppInfo
import dev.testerswarm.sdk.internal.Config
import dev.testerswarm.sdk.internal.EventQueue
import dev.testerswarm.sdk.internal.HubTokenClient
import dev.testerswarm.sdk.internal.SessionTracker
import dev.testerswarm.sdk.internal.TokenStore
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

object TesterSwarm {
    private const val TAG = "TesterSwarm"
    private val initialized = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "testerswarm-sdk").apply { isDaemon = true }
    }

    @Volatile
    private var wrapperName: String? = null

    internal fun setWrapper(wrapper: String?) {
        wrapperName = wrapper
    }

    private fun resolveWrapper(): String? {
        wrapperName?.let { return it }
        return when {
            hasClass("dev.testerswarm.reactnative.TesterSwarmPackage") -> "react_native"
            hasClass("dev.testerswarm.flutter.TesterSwarmPlugin") -> "flutter"
            else -> null
        }
    }

    private fun hasClass(name: String): Boolean {
        return runCatching { Class.forName(name) != null }.getOrDefault(false)
    }

    internal fun resolveApiUrl(apiUrl: String?, metaApiUrl: String?): String {
        return apiUrl?.trim()?.takeIf { it.isNotEmpty() }
            ?: metaApiUrl?.trim()?.takeIf { it.isNotEmpty() }
            ?: Config.DEFAULT_BASE_URL
    }

    @JvmStatic
    @JvmOverloads
    fun init(context: Context, appKey: String? = null, apiUrl: String? = null) {
        runCatching {
            val appCtx = context.applicationContext
            if (!initialized.compareAndSet(false, true)) {
                return
            }
            val store = TokenStore(appCtx)
            val resolvedKey = appKey ?: AppInfo.readAppKey(appCtx)
            if (resolvedKey.isNullOrBlank()) {
                if (AppInfo.isDebuggable(appCtx)) {
                    Log.w(TAG, "Missing dev.testerswarm.APP_KEY meta-data; SDK disabled.")
                }
                return
            }

            val queue = EventQueue(appCtx)
            val resolvedApiUrl = resolveApiUrl(apiUrl, AppInfo.readApiUrl(appCtx))
            val api = ApiClient(resolvedApiUrl)
            val tracker = SessionTracker(
                context = appCtx,
                appKey = resolvedKey,
                wrapper = resolveWrapper(),
                store = store,
                queue = queue,
                api = api,
                executor = executor
            )
            tracker.attach()

            executor.execute {
                runCatching {
                    if (store.getToken().isNullOrBlank()) {
                        HubTokenClient.fetchToken(appCtx)?.let { store.saveToken(it) }
                    }
                    tracker.performHandshakeIfNeeded()
                }
            }

            if (AppInfo.isDebuggable(appCtx)) {
                Log.i(TAG, "initialized (appKey=${resolvedKey.take(12)}..., sdk=${Config.SDK_VERSION})")
                Log.i(TAG, "${status(appCtx).name} (open this app from the Tester Swarm Hub to validate)")
            }
        }
    }

    @JvmStatic
    fun status(context: Context): TesterSwarmStatus {
        return runCatching {
            val store = TokenStore(context.applicationContext)
            if (!store.isEnabled()) {
                TesterSwarmStatus.DISABLED
            } else if (store.getToken().isNullOrBlank()) {
                TesterSwarmStatus.NOT_ENROLLED
            } else {
                TesterSwarmStatus.TRACKING
            }
        }.getOrDefault(TesterSwarmStatus.DISABLED)
    }

    @JvmStatic
    fun setEnabled(context: Context, enabled: Boolean) {
        runCatching {
            TokenStore(context.applicationContext).setEnabled(enabled)
        }
    }
}
