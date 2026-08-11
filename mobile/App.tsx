import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function App() {
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function checkHealth() {
    setLoading(true);
    setHealthResult(null);

    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      setHealthResult(JSON.stringify(data));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setHealthResult(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>WhatsApp API POC</Text>
      <Button
        title={loading ? 'Checking…' : 'Check backend health'}
        onPress={checkHealth}
        disabled={loading}
      />
      {healthResult !== null && (
        <Text style={styles.result} testID="health-result">
          {healthResult}
        </Text>
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  result: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: 'monospace',
  },
});
