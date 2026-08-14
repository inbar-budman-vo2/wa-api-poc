import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

type SendMode = 'mock' | 'live';

interface HealthResponse {
  ok: boolean;
  sendMode?: SendMode;
}

interface SendSuccessResponse {
  ok: true;
  messageId: string;
  mock: boolean;
}

interface SendErrorResponse {
  ok: false;
  error: string;
}

export default function App() {
  const [sendMode, setSendMode] = useState<SendMode | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const response = await fetch(`${API_URL}/health`);
        const data = (await response.json()) as HealthResponse;

        if (!response.ok || !data.ok) {
          throw new Error('Backend health check failed.');
        }

        if (!cancelled) {
          setSendMode(data.sendMode ?? 'mock');
          setHealthError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          setHealthError(message);
          setSendMode(null);
        }
      }
    }

    void loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSend() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const data = (await response.json()) as
        | SendSuccessResponse
        | SendErrorResponse;

      if (!response.ok || !data.ok) {
        const errorMessage =
          'error' in data ? data.error : 'Send request failed.';
        setResult(`Error: ${errorMessage}`);
        return;
      }

      const mockLabel = data.mock ? ' (mock)' : '';
      setResult(`Sent${mockLabel}: ${data.messageId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setResult(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  const badgeLabel =
    sendMode === null ? (healthError ? 'OFFLINE' : '…') : sendMode.toUpperCase();
  const badgeStyle =
    sendMode === 'live'
      ? styles.badgeLive
      : sendMode === 'mock'
        ? styles.badgeMock
        : styles.badgeUnknown;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>WhatsApp API POC</Text>
        <View style={[styles.badge, badgeStyle]}>
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </View>
      </View>

      {healthError !== null && (
        <Text style={styles.healthError} testID="health-error">
          Backend unreachable: {healthError}
        </Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="+85291234567"
        placeholderTextColor="#999"
        keyboardType="phone-pad"
        autoComplete="tel"
        value={phone}
        onChangeText={setPhone}
        editable={!loading}
        testID="phone-input"
      />

      <Button
        title={loading ? 'Sending…' : 'Send'}
        onPress={handleSend}
        disabled={loading || phone.trim().length === 0}
      />

      {loading && <ActivityIndicator style={styles.spinner} />}

      {result !== null && (
        <Text style={styles.result} testID="send-result">
          {result}
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
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    flexShrink: 1,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 12,
  },
  badgeMock: {
    backgroundColor: '#fef3c7',
  },
  badgeLive: {
    backgroundColor: '#fee2e2',
  },
  badgeUnknown: {
    backgroundColor: '#e5e7eb',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  healthError: {
    color: '#b45309',
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  spinner: {
    marginTop: 4,
  },
  result: {
    fontSize: 16,
    fontFamily: 'monospace',
  },
});
