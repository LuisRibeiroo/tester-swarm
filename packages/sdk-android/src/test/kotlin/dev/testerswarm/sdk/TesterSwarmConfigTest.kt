package dev.testerswarm.sdk

import android.content.Context
import dev.testerswarm.sdk.internal.ApiClient
import dev.testerswarm.sdk.internal.Config
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

class TesterSwarmConfigTest {
    @Test
    fun resolveApiUrlPrefersExplicitThenMetaThenDefault() {
        assertEquals(
            "http://10.0.2.2:54321/functions/v1",
            TesterSwarm.resolveApiUrl(
                apiUrl = "  http://10.0.2.2:54321/functions/v1 ",
                metaApiUrl = "https://meta.example.com/v1"
            )
        )
        assertEquals(
            "https://meta.example.com/v1",
            TesterSwarm.resolveApiUrl(
                apiUrl = "   ",
                metaApiUrl = " https://meta.example.com/v1 "
            )
        )
        assertEquals(
            Config.DEFAULT_BASE_URL,
            TesterSwarm.resolveApiUrl(
                apiUrl = null,
                metaApiUrl = ""
            )
        )
    }

    @Test
    fun initExposesBinaryCompatibleJvmOverloads() {
        val methods = TesterSwarm::class.java.methods.filter { it.name == "init" }
        val signatures = methods.map { it.parameterTypes.toList() }.toSet()

        assertEquals(
            setOf(
                listOf(Context::class.java),
                listOf(Context::class.java, String::class.java),
                listOf(Context::class.java, String::class.java, String::class.java)
            ),
            signatures
        )
    }

    @Test
    fun apiClientPostsJsonToOverriddenBaseUrl() {
        val capturedRequestLine = AtomicReference<String>()
        val capturedBody = AtomicReference<String>()
        val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        val worker = thread(isDaemon = true) {
            server.accept().use { socket ->
                val reader = BufferedReader(InputStreamReader(socket.getInputStream(), Charsets.UTF_8))
                capturedRequestLine.set(reader.readLine())
                var contentLength = 0
                while (true) {
                    val header = reader.readLine() ?: break
                    if (header.isEmpty()) break
                    if (header.startsWith("Content-Length:", ignoreCase = true)) {
                        contentLength = header.substringAfter(":").trim().toInt()
                    }
                }
                val buf = CharArray(contentLength)
                var read = 0
                while (read < contentLength) {
                    val n = reader.read(buf, read, contentLength - read)
                    if (n < 0) break
                    read += n
                }
                capturedBody.set(String(buf, 0, read))

                val json = """{"status":"not_enrolled","enabled":true,"flushIntervalSec":30}"""
                val bytes = json.toByteArray(Charsets.UTF_8)
                val out = socket.getOutputStream()
                val headers = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
                out.write(headers.toByteArray(Charsets.US_ASCII))
                out.write(bytes)
                out.flush()
            }
        }
        try {
            val baseUrl = "http://127.0.0.1:${server.localPort}/functions/v1"
            val client = ApiClient(baseUrl)
            val res = client.postJson("/sdk-handshake", JSONObject().put("appKey", "ts_pk_test_1234"))

            worker.join(5000)
            assertNotNull(res)
            assertEquals("not_enrolled", res!!.getString("status"))
            assertTrue(capturedRequestLine.get().startsWith("POST /functions/v1/sdk-handshake "))
            assertEquals("ts_pk_test_1234", JSONObject(capturedBody.get()).getString("appKey"))
        } finally {
            server.close()
        }
    }
}
