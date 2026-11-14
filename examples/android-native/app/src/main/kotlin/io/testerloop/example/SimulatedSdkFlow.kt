package io.testerloop.example

import io.testerloop.sdk.TesterLoopStatus

enum class SimulationPhase(
    val summary: String,
    val expectedStatus: TesterLoopStatus,
) {
    INITIALIZED("Auto-init androidx.startup ativo sem token do Hub", TesterLoopStatus.NOT_ENROLLED),
    HANDSHAKE("Intent io.testerloop.action.OPEN + token JWT lido via ContentProvider", TesterLoopStatus.TRACKING),
    SESSION_60S("Sessao >= 60s em foreground enviada -> +1 ponto pendente", TesterLoopStatus.TRACKING),
    KILL_SWITCH("Campanha encerrada ou opt-out -> SDK em modo no-op", TesterLoopStatus.DISABLED),
}

class SimulatedSdkFlow {
    var index: Int = 0
        private set

    val currentPhase: SimulationPhase
        get() = SimulationPhase.entries[index]

    fun advance(): SimulationPhase {
        index = (index + 1) % SimulationPhase.entries.size
        return currentPhase
    }

    fun buildHandshakePayload(
        appKey: String,
        packageName: String,
        token: String?,
    ): Map<String, Any?> = io.testerloop.example.buildHandshakePayload(appKey, packageName, token)
}

fun buildHandshakePayload(
    appKey: String,
    packageName: String,
    token: String?,
): Map<String, Any?> = mapOf(
    "appKey" to appKey,
    "packageName" to packageName,
    "versionCode" to 1,
    "signingCertSha256" to "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF",
    "installer" to null,
    "debuggable" to true,
    "installId" to "android-native-sim-install-1",
    "sdk" to mapOf(
        "platform" to "android",
        "version" to "1.0.0",
        "wrapper" to null,
    ),
    "device" to mapOf(
        "sdkInt" to 35,
    ),
    "token" to token,
)
