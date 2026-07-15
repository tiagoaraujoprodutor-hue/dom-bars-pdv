import { uuid, type PaymentMethod, type ReceiptLine, type SalePayload } from '@dom-bars/shared';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
  onCheckout: (
    payload: SalePayload,
    receiptLines: ReceiptLine[],
  ) => Promise<{ offline: boolean }>;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  // Produto em edição de quantidade rápida (long-press no produto).
  const [qtyProduct, setQtyProduct] = useState<Product | null>(null);
  const [qtyValue, setQtyValue] = useState('');

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
  const lines = Object.values(cart);
  const itemCount = lines.reduce((a, l) => a + l.qty, 0);

  function bump(product: Product, delta: number): void {
    setCart((prev) => {
      const qty = (prev[product.id]?.qty ?? 0) + delta;
      const next = { ...prev };
      if (qty <= 0) delete next[product.id];
      else next[product.id] = { product, qty };
      return next;
    });
  }

  function setExactQty(product: Product, qty: number): void {
    setCart((prev) => {
      const next = { ...prev };
      if (!Number.isFinite(qty) || qty <= 0) delete next[product.id];
      else next[product.id] = { product, qty: Math.floor(qty) };
      return next;
    });
  }

  function removeLine(productId: string): void {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  function openQty(product: Product): void {
    setQtyProduct(product);
    setQtyValue(String(cart[product.id]?.qty ?? ''));
  }

  function confirmQty(): void {
    if (qtyProduct) setExactQty(qtyProduct, Number(qtyValue.replace(/\D/g, '')));
    setQtyProduct(null);
    setQtyValue('');
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
      items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
      payments: [{ method, amount: total.toFixed(2) }],
    };
    // Linhas do cupom (nome/qtd/preço) — o comprovante lista os itens para
    // retirada no bar. Montadas aqui porque o carrinho tem nome e preço.
    const receiptLines: ReceiptLine[] = lines.map((l) => ({
      name: l.product.name,
      quantity: l.qty,
      unitPrice: l.product.price,
    }));
    try {
      const res = await onCheckout(payload, receiptLines);
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
            renderItem={({ item }) => {
              const qty = cart[item.id]?.qty;
              return (
                <TouchableOpacity
                  style={styles.productTile}
                  onPress={() => bump(item, 1)}
                  onLongPress={() => openQty(item)}
                >
                  {qty ? (
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyBadgeText}>{qty}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productPrice}>R$ {Number(item.price).toFixed(2)}</Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={styles.subtitle}>Carregando produtos…</Text>}
          />

          {lines.length > 0 ? (
            <View style={[styles.card, { paddingVertical: 8 }]}>
              <ScrollView style={{ maxHeight: 150 }}>
                {lines.map((l) => (
                  <View key={l.product.id} style={styles.cartRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartName}>{l.product.name}</Text>
                      <Text style={styles.cartSub}>
                        {l.qty} × R$ {Number(l.product.price).toFixed(2)} = R${' '}
                        {(Number(l.product.price) * l.qty).toFixed(2)}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => bump(l.product, -1)}>
                      <Text style={styles.stepText}>−</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.stepQty} onPress={() => openQty(l.product)}>
                      <Text style={styles.stepText}>{l.qty}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => bump(l.product, 1)}>
                      <Text style={styles.stepText}>+</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeLine(l.product.id)}
                    >
                      <Text style={styles.removeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.productName}>Total: R$ {total.toFixed(2)}</Text>
            <Text style={styles.subtitle}>{itemCount} item(ns)</Text>
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

      {/* Quantidade rápida: digitar o número em vez de tocar várias vezes. */}
      <Modal transparent visible={qtyProduct != null} animationType="fade" onRequestClose={confirmQty}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>{qtyProduct?.name}</Text>
            <Text style={styles.subtitle}>Quantidade</Text>
            <TextInput
              style={styles.input}
              value={qtyValue}
              onChangeText={setQtyValue}
              keyboardType="number-pad"
              autoFocus
              placeholder="0"
              placeholderTextColor="#6b7794"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.secondaryButton, { flex: 1 }]}
                onPress={() => {
                  setQtyProduct(null);
                  setQtyValue('');
                }}
              >
                <Text style={styles.secondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={confirmQty}>
                <Text style={styles.buttonText}>Aplicar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
