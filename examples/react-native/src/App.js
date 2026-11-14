import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { TesterLoop } from '@testerloop/react-native';
import { createLoopSimulator } from './simulator';

export default function App() {
  const simulatorRef = useRef(createLoopSimulator(TesterLoop));
  const [status, setStatus] = useState('NOT_ENROLLED');
  const [enabled, setEnabled] = useState(true);
  const [phase, setPhase] = useState(simulatorRef.current.getCurrentPhase());
  const [logs, setLogs] = useState([]);

  const appendLog = (line) =>
    setLogs((prev) => [`${line}`, ...prev].slice(0, 8));

  useEffect(() => {
    TesterLoop.status().then((initial) => {
      setStatus(initial);
      appendLog(`Boot: TesterLoop.status() -> ${initial}`);
    });
  }, []);

  const handleToggle = async (next) => {
    setEnabled(next);
    const updated = await simulatorRef.current.setEnabled(next);
    setStatus(updated);
    appendLog(`TesterLoop.setEnabled(${next}) -> ${updated}`);
  };

  const handleAdvance = async () => {
    const result = await simulatorRef.current.advance();
    setPhase(result.phase);
    setEnabled(result.phase.name !== 'KILL_SWITCH');
    setStatus(result.status);
    appendLog(`[Sim] ${result.phase.name}: ${result.phase.summary}`);
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>TesterLoop React Native Example</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Bridge status (@testerloop/react-native):</Text>
          <Text style={styles.value}>{status}</Text>
          <Text style={styles.label}>Fase simulada: {phase.expectedStatus}</Text>
          <Text style={styles.muted}>{phase.summary}</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Habilitar SDK (setEnabled)</Text>
            <Switch value={enabled} onValueChange={handleToggle} />
          </View>

          <Pressable style={styles.button} onPress={handleAdvance}>
            <Text style={styles.buttonText}>Avancar simulacao 12x14</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Logs</Text>
          {logs.map((entry, idx) => (
            <Text key={idx} style={styles.logLine}>
              {entry}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0F17' },
  container: { padding: 20, gap: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#F8FAFC' },
  card: {
    backgroundColor: '#111827',
    borderColor: '#263244',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  label: { color: '#F8FAFC', fontWeight: '600' },
  value: { color: '#10B981', fontWeight: '700', fontSize: 16 },
  muted: { color: '#94A3B8' },
  button: {
    backgroundColor: '#6366F1',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
  logLine: { color: '#CBD5E1', fontFamily: 'monospace', fontSize: 12 },
});
