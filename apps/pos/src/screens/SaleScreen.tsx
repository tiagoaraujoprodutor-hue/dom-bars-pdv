import { uuid, type PaymentMethod, type SalePayload } from '@dom-bars/shared';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../lib/api';
import { colors, styles } from '../theme';

interface Product {
  id: string;
  name: string;
  price: string;
  stock: number;
}

interface CartLine {
  product: Product;
  qty: number;
}

const METHODS: PaymentMethod[] = ['DINHEIRO', 'PIX', 'CREDITO', 'DEBITO'];

export function SaleScreen({
  eventId,
  online,
  pending,
  onCheckout,
}: {
  eventId: string;
  online: boolean;
  pending: number;
  onCheckout: (payload: SalePayload) => Promise<{ offline: boolean }>;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  // Carrega o catálogo do evento. Em produção pode-se cachear localmente p/ offline.
  useEffect(() => {
    api<Product[]>(`/events/${eventId}/products`)
      .then(setProducts)
      .catch((e) => setError((e as Error).message));
  }, [eventId]);

  const total = useMemo(
    () => Object.values(cart).reduce((acc, l) => acc + Number(l.product.price) * l.qty, 0),
    [cart],
  );

  function addToCart(product: Product): void {
    setCart((prev) => {
      const existing = prev[product.id];
      return { ...prev, [product.id]: { product, qty: (existing?.qty ?? 0) + 1 } };
    });
  }

  function clear(): void {
    setCart({});
    setPaying(false);
  }

  async function pay(method: PaymentMethod): Promise<void> {
    setError('');
    const payload: SalePayload = {
      clientId: uuid(),
      machineId: 'smart2-terminal',
      items: Object.values(cart).map((l) => ({ productId: l.product.id, quantity: l.qty })),
      payments: [{ method, amount: total.toFixed(2) }],
    };
    try {
      const res = await onCheckout(payload);
      clear();
      Alert.alert(
        res.offline ? 'Venda salva (offline)' : 'Venda concluída',
        res.offline
          ? 'Será sincronizada automaticamente ao reconectar.'
          : 'Pagamento registrado e comprovante impresso.',
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.statusBar}>
        <View style={[styles.dot, { backgroundColor: online ? colors.accent : colors.danger }]} />
        <Text style={{ color: colors.muted }}>
          {online ? 'Online' : 'Offline'} · fila: {pending}
        </Text>
      </View>

      {!paying ? (
        <>
          <FlatList
            data={products}
            keyExtractor={(p) => p.id}
            numColumns={2}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.productTile} onPress={() => addToCart(item)}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productPrice}>R$ {Number(item.price).toFixed(2)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.subtitle}>Carregando produtos…</Text>}
          />
          <View style={styles.card}>
            <Text style={styles.productName}>Total: R$ {total.toFixed(2)}</Text>
            <Text style={styles.subtitle}>{Object.keys(cart).length} item(ns)</Text>
            <TouchableOpacity
              style={[styles.button, { opacity: total > 0 ? 1 : 0.4 }]}
              disabled={total <= 0}
              onPress={() => setPaying(true)}
            >
              <Text style={styles.buttonText}>Cobrar</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={styles.title}>Pagamento · R$ {total.toFixed(2)}</Text>
          {METHODS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.button, { marginBottom: 10 }]}
              onPress={() => pay(m)}
            >
              <Text style={styles.buttonText}>{m}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setPaying(false)}>
            <Text style={styles.secondaryText}>Voltar</Text>
          </TouchableOpacity>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      )}
    </View>
  );
}
