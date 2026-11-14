package io.testerloop.example

import io.testerloop.sdk.TesterLoopStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    @Test
    fun buildsSdkHandshakePayloadMatchingContract() {
        val flow = SimulatedSdkFlow()
        val unauthenticated = buildHandshakePayload(
            appKey = "tl_pk_example_android_0001",
            packageName = "io.testerloop.example",
            token = null,
        )

        assertEquals("tl_pk_example_android_0001", unauthenticated["appKey"])
        assertEquals("io.testerloop.example", unauthenticated["packageName"])
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
            appKey = "tl_pk_example_android_0001",
            packageName = "io.testerloop.example",
            token = "eyJhbGciOiJFUzI1NiJ9.payload.sig",
        )
        assertEquals("eyJhbGciOiJFUzI1NiJ9.payload.sig", authenticated["token"])
    }
}
