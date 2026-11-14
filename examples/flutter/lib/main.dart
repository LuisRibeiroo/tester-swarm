import 'package:material_ui/material_ui.dart';
import 'package:testerloop/testerloop.dart';

void main() {
  runApp(const TesterLoopExampleApp());
}

enum SimulationPhase {
  initialized('App aberto sem vínculo do Hub', TesterLoopStatus.notEnrolled),
  handshake(
    'Intent io.testerloop.action.OPEN + token JWT ES256 recebido',
    TesterLoopStatus.tracking,
  ),
  foregroundValidated(
    'Sessão >= 60s em foreground enviada (+1 ponto pendente)',
    TesterLoopStatus.tracking,
  ),
  campaignFinished(
    'Campanha concluída ou opt-out via setEnabled(false)',
    TesterLoopStatus.disabled,
  );

  const SimulationPhase(this.summary, this.expectedStatus);
  final String summary;
  final TesterLoopStatus expectedStatus;
}

class TesterLoopExampleApp extends StatelessWidget {
  const TesterLoopExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TesterLoop Flutter Example',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6366F1),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const TesterLoopDemoPage(),
    );
  }
}

class TesterLoopDemoPage extends StatefulWidget {
  const TesterLoopDemoPage({super.key});

  @override
  State<TesterLoopDemoPage> createState() => _TesterLoopDemoPageState();
}

class _TesterLoopDemoPageState extends State<TesterLoopDemoPage> {
  TesterLoopStatus _realStatus = TesterLoopStatus.notEnrolled;
  bool _sdkEnabled = true;
  int _phaseIndex = 0;
  final List<String> _logs = <String>[];

  @override
  void initState() {
    super.initState();
    _refreshStatus();
  }

  Future<void> _refreshStatus() async {
    final current = await TesterLoop.status();
    if (!mounted) return;
    setState(() {
      _realStatus = current;
      _logs.add('TesterLoop.status() -> ${current.name}');
    });
  }

  Future<void> _toggleEnabled(bool enabled) async {
    await TesterLoop.setEnabled(enabled);
    final current = await TesterLoop.status();
    if (!mounted) return;
    setState(() {
      _sdkEnabled = enabled;
      _realStatus = current;
      _logs.add('TesterLoop.setEnabled($enabled) -> ${current.name}');
    });
  }

  Future<void> _advanceSimulation() async {
    final nextIndex = (_phaseIndex + 1) % SimulationPhase.values.length;
    final phase = SimulationPhase.values[nextIndex];
    if (phase == SimulationPhase.campaignFinished) {
      await TesterLoop.setEnabled(false);
    } else if (!_sdkEnabled) {
      await TesterLoop.setEnabled(true);
    }
    final current = await TesterLoop.status();
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
      appBar: AppBar(title: const Text('TesterLoop Flutter Example')),
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
                    'SDK Status (package:testerloop)',
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
