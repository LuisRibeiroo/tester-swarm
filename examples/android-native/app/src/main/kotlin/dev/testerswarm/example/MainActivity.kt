package dev.testerswarm.example

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import dev.testerswarm.sdk.TesterSwarm

class MainActivity : Activity() {
    private val flow = SimulatedSdkFlow()
    private val logs = mutableListOf<String>()
    private var sdkEnabled = true

    private lateinit var statusView: TextView
    private lateinit var logView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (20 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad, pad, pad)
        }

        val title = TextView(this).apply {
            text = "Tester Swarm Android Native Example"
            textSize = 20f
        }
        statusView = TextView(this)
        logView = TextView(this)

        val simulateBtn = Button(this).apply {
            text = "Simular proximo passo (12x14)"
            setOnClickListener {
                val phase = flow.advance()
                if (phase == SimulationPhase.KILL_SWITCH) {
                    sdkEnabled = false
                    TesterSwarm.setEnabled(this@MainActivity, false)
                } else if (!sdkEnabled) {
                    sdkEnabled = true
                    TesterSwarm.setEnabled(this@MainActivity, true)
                }
                render("Simulacao -> ${phase.name}: ${phase.summary}")
            }
        }

        val toggleBtn = Button(this).apply {
            text = "Alternar TesterSwarm.setEnabled()"
            setOnClickListener {
                sdkEnabled = !sdkEnabled
                TesterSwarm.setEnabled(this@MainActivity, sdkEnabled)
                render("TesterSwarm.setEnabled($sdkEnabled)")
            }
        }

        root.addView(title)
        root.addView(statusView)
        root.addView(simulateBtn)
        root.addView(toggleBtn)
        root.addView(logView)

        setContentView(ScrollView(this).apply { addView(root) })
        render("Boot com androidx.startup (zero codigo manual)")
    }

    private fun render(event: String) {
        val realStatus = TesterSwarm.status(this)
        val phase = flow.currentPhase
        logs.add(0, "$event [real=${realStatus.name}]")
        statusView.text = buildString {
            appendLine("SDK real: ${realStatus.name}")
            appendLine("Fase simulada: ${phase.expectedStatus.name}")
            appendLine(phase.summary)
        }
        logView.text = logs.take(8).joinToString("\n")
    }
}
