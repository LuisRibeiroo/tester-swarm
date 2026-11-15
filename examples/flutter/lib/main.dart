import 'package:material_ui/material_ui.dart';
import 'package:testerswarm/testerswarm.dart';

void main() {
  runApp(const TesterSwarmExampleApp());
}

enum SimulationPhase {
  initialized('App aberto sem vínculo do Hub', TesterSwarmStatus.notEnrolled),
  handshake(
    'Intent dev.testerswarm.action.OPEN + token JWT ES256 recebido',
    TesterSwarmStatus.tracking,
  ),
  foregroundValidated(
    'Sessão >= 60s em foreground enviada (+1 ponto pendente)',
    TesterSwarmStatus.tracking,
  ),
  campaignFinished(
    'Campanha concluída ou opt-out via setEnabled(false)',
    TesterSwarmStatus.disabled,
  );

  const SimulationPhase(this.summary, this.expectedStatus);
  final String summary;
  final TesterSwarmStatus expectedStatus;
}

class TesterSwarmExampleApp extends StatelessWidget {
  const TesterSwarmExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Tester Swarm Flutter Example',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6366F1),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const TesterSwarmDemoPage(),
    );
  }
}

class TesterSwarmDemoPage extends StatefulWidget {
  const TesterSwarmDemoPage({super.key});

  @override
  State<TesterSwarmDemoPage> createState() => _TesterSwarmDemoPageState();
}

class _TesterSwarmDemoPageState extends State<TesterSwarmDemoPage> {
  TesterSwarmStatus _realStatus = TesterSwarmStatus.notEnrolled;
  bool _sdkEnabled = true;
  int _phaseIndex = 0;
  final List<String> _logs = <String>[];

  @override
  void initState() {
    super.initState();
    _refreshStatus();
  }

  Future<void> _refreshStatus() async {
    final current = await TesterSwarm.status();
    if (!mounted) return;
    setState(() {
      _realStatus = current;
      _logs.add('TesterSwarm.status() -> ${current.name}');
    });
  }

  Future<void> _toggleEnabled(bool enabled) async {
    await TesterSwarm.setEnabled(enabled);
    final current = await TesterSwarm.status();
    if (!mounted) return;
    setState(() {
      _sdkEnabled = enabled;
      _realStatus = current;
      _logs.add('TesterSwarm.setEnabled($enabled) -> ${current.name}');
    });
  }

  Future<void> _advanceSimulation() async {
    final nextIndex = (_phaseIndex + 1) % SimulationPhase.values.length;
    final phase = SimulationPhase.values[nextIndex];
    if (phase == SimulationPhase.campaignFinished) {
      await TesterSwarm.setEnabled(false);
    } else if (!_sdkEnabled) {
      await TesterSwarm.setEnabled(true);
    }
    final current = await TesterSwarm.status();
    if (!mounted) return;
    setState(() {
      _phaseIndex = nextIndex;
      _sdkEnabled = phase != SimulationPhase.campaignFinished;
      _realStatus = current;
      _logs.add('[Sim] ${phase.name}: ${phase.summary} (bridge=${current.name})');
    });
  }

  @override
  Widget build(BuildContext context) {
    final phase = SimulationPhase.values[_phaseIndex];

    return Scaffold(
      appBar: AppBar(title: const Text('Tester Swarm Flutter Example')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'SDK Status (package:testerswarm)',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 8),
                  Text('Bridge status: ${_realStatus.name}'),
                  Text('Fase simulada: ${phase.expectedStatus.name}'),
                  Text(phase.summary),
                  const SizedBox(height: 12),
                  SwitchListTile(
                    key: const Key('sdk_opt_out_switch'),
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Habilitar rastreamento (setEnabled)'),
                    value: _sdkEnabled,
                    onChanged: _toggleEnabled,
                  ),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton(
                        key: const Key('simulate_step_btn'),
                        onPressed: _advanceSimulation,
                        child: const Text('Avançar simulação'),
                      ),
                      OutlinedButton(
                        key: const Key('refresh_status_btn'),
                        onPressed: _refreshStatus,
                        child: const Text('Ler status real'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Logs da simulação',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  for (final entry in _logs.reversed.take(8))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        entry,
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
