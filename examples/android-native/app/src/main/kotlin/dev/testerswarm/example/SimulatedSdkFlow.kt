package dev.testerswarm.example

import dev.testerswarm.sdk.TesterSwarmStatus

enum class SimulationPhase(
    val summary: String,
    val expectedStatus: TesterSwarmStatus,
) {
    INITIALIZED("Auto-init androidx.startup ativo sem token do Hub", TesterSwarmStatus.NOT_ENROLLED),
    HANDSHAKE("Intent dev.testerswarm.action.OPEN + token JWT lido via ContentProvider", TesterSwarmStatus.TRACKING),
    SESSION_60S("Sessao >= 60s em foreground enviada -> +1 ponto pendente", TesterSwarmStatus.TRACKING),
    KILL_SWITCH("Campanha encerrada ou opt-out -> SDK em modo no-op", TesterSwarmStatus.DISABLED),
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
    ): Map<String, Any?> = dev.testerswarm.example.buildHandshakePayload(appKey, packageName, token)
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
