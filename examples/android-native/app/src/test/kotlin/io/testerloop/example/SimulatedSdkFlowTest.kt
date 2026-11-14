package io.testerloop.example

import io.testerloop.sdk.TesterLoopStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class SimulatedSdkFlowTest {
    @Test
    fun cyclesThroughClosedTestingLifecycleStatuses() {
        val flow = SimulatedSdkFlow()
        assertEquals(TesterLoopStatus.NOT_ENROLLED, flow.currentPhase.expectedStatus)

        assertEquals(TesterLoopStatus.TRACKING, flow.advance().expectedStatus)
        assertEquals(TesterLoopStatus.TRACKING, flow.advance().expectedStatus)
        assertEquals(TesterLoopStatus.DISABLED, flow.advance().expectedStatus)
        assertEquals(TesterLoopStatus.NOT_ENROLLED, flow.advance().expectedStatus)
    }
}
