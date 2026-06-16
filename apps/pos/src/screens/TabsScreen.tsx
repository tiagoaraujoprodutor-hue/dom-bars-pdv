import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../lib/api';
import { styles } from '../theme';

interface Tab {
  id: string;
  code: string;
  status: string;
}

/**
 * Comandas (QR). Cria uma comanda e mostra o código a ser impresso/colado no QR.
 * A leitura por câmera (expo-camera) entra como evolução; aqui o foco é o ciclo.
 */
export function TabsScreen({ eventId }: { eventId: string }) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [error, setError] = useState('');

  async function createTab(): Promise<void> {
    setError('');
    try {
      const created = await api<Tab>(`/events/${eventId}/tabs`, { method: 'POST', body: {} });
      setTab(created);
      Alert.alert('Comanda criada', `Código: ${created.code}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Comandas</Text>
      <Text style={styles.subtitle}>Abra uma comanda e use o código como QR.</Text>
      <TouchableOpacity style={styles.button} onPress={createTab}>
        <Text style={styles.buttonText}>Nova comanda</Text>
      </TouchableOpacity>
      {tab ? (
        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.productName}>Comanda {tab.code}</Text>
          <Text style={styles.subtitle}>Status: {tab.status}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
