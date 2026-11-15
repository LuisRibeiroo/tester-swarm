package dev.testerswarm.example

import dev.testerswarm.sdk.TesterSwarmStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SimulatedSdkFlowTest {
    @Test
    fun cyclesThroughClosedTestingLifecycleStatuses() {
        val flow = SimulatedSdkFlow()
        assertEquals(TesterSwarmStatus.NOT_ENROLLED, flow.currentPhase.expectedStatus)

        assertEquals(TesterSwarmStatus.TRACKING, flow.advance().expectedStatus)
        assertEquals(TesterSwarmStatus.TRACKING, flow.advance().expectedStatus)
        assertEquals(TesterSwarmStatus.DISABLED, flow.advance().expectedStatus)
        assertEquals(TesterSwarmStatus.NOT_ENROLLED, flow.advance().expectedStatus)
    }

    @Test
    fun buildsSdkHandshakePayloadMatchingContract() {
        val flow = SimulatedSdkFlow()
        val unauthenticated = buildHandshakePayload(
            appKey = "ts_pk_example_android_0001",
            packageName = "dev.testerswarm.example",
            token = null,
        )

        assertEquals("ts_pk_example_android_0001", unauthenticated["appKey"])
        assertEquals("dev.testerswarm.example", unauthenticated["packageName"])
        assertEquals(1, unauthenticated["versionCode"])
        assertTrue((unauthenticated["signingCertSha256"] as String).isNotBlank())
        assertTrue((unauthenticated["installId"] as String).isNotBlank())
        assertEquals(true, unauthenticated["debuggable"])
        assertTrue(unauthenticated.containsKey("installer"))
        assertNull(unauthenticated["installer"])
        assertTrue(unauthenticated.containsKey("token"))
        assertNull(unauthenticated["token"])

        @Suppress("UNCHECKED_CAST")
        val sdk = unauthenticated["sdk"] as Map<String, Any?>
        assertEquals("android", sdk["platform"])
        assertEquals("1.0.0", sdk["version"])
        assertTrue(sdk.containsKey("wrapper"))
        assertNull(sdk["wrapper"])

        @Suppress("UNCHECKED_CAST")
        val device = unauthenticated["device"] as Map<String, Any?>
        assertTrue((device["sdkInt"] as Int) >= 23)

        val authenticated = flow.buildHandshakePayload(
            appKey = "ts_pk_example_android_0001",
            packageName = "dev.testerswarm.example",
            token = "eyJhbGciOiJFUzI1NiJ9.payload.sig",
        )
        assertEquals("eyJhbGciOiJFUzI1NiJ9.payload.sig", authenticated["token"])
    }
}
