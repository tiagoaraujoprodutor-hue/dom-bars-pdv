import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../lib/api';
import { styles } from '../theme';

/**
 * Abertura do caixa do atendente. Cada atendente tem o próprio caixa (valor inicial),
 * base do fechamento individual. Sem caixa aberto, não vende.
 */
export function OpenCashScreen({
  eventId,
  eventName,
  onOpened,
}: {
  eventId: string;
  eventName: string;
  onOpened: () => void;
}) {
  const [amount, setAmount] = useState('0');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function open(): Promise<void> {
    setError('');
    setLoading(true);
    try {
      await api(`/events/${eventId}/cash-registers/open`, {
        method: 'POST',
        body: { openingAmount: amount.replace(',', '.') || '0' },
      });
      onOpened();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.title}>Abrir caixa</Text>
        <Text style={styles.subtitle}>{eventName}</Text>
        <Text style={styles.subtitle}>Informe o valor inicial (troco) do seu caixa.</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0,00"
          placeholderTextColor="#6b7794"
        />
        <TouchableOpacity style={styles.button} onPress={open} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Abrindo…' : 'Abrir caixa'}</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}
