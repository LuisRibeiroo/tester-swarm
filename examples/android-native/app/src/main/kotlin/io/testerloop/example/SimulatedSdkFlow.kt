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
}
