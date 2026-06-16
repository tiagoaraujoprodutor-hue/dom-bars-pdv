import { useEffect, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../lib/api';
import { styles } from '../theme';

export interface EventItem {
  id: string;
  name: string;
  status: string;
  role: string;
}

export function EventPickerScreen({ onPick }: { onPick: (event: EventItem) => void }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<EventItem[]>('/events')
      .then(setEvents)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Selecione o evento</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => onPick(item)}>
            <Text style={styles.productName}>{item.name}</Text>
            <Text style={styles.subtitle}>
              {item.role} · {item.status}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
