import { uuid, type PaymentMethod, type ReceiptLine, type SalePayload } from '@dom-bars/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { getDeviceId } from '../lib/device';
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
  errored = 0,
  onCheckout,
}: {
  eventId: string;
  online: boolean;
  pending: number;
  errored?: number;
  onCheckout: (
    payload: SalePayload,
    receiptLines: ReceiptLine[],
  ) => Promise<{ offline: boolean }>;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [paying, setPaying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  // Guarda síncrono contra toque-duplo (o state é assíncrono demais p/ isso).
  const processingRef = useRef(false);
  // clientId ESTÁVEL por carrinho: reusado em retentativas (só muda após a venda
  // concluir). Evita duplicar venda/cortesia se o operador tocar de novo depois de
  // uma falha percebida (a chamada pode ter chegado ao servidor mesmo assim).
  const clientIdRef = useRef(uuid());
  // machineId único do aparelho (rastreio por terminal).
  const deviceIdRef = useRef('');
  useEffect(() => {
    getDeviceId()
      .then((id) => {
        deviceIdRef.current = id;
      })
      .catch(() => undefined);
  }, []);
  // Produto em edição de quantidade rápida (long-press no produto).
  const [qtyProduct, setQtyProduct] = useState<Product | null>(null);
  const [qtyValue, setQtyValue] = useState('');
  // Cortesia: modal da senha administrativa.
  const [courtesyOpen, setCourtesyOpen] = useState(false);
  const [adminPw, setAdminPw] = useState('');

  // Carrega o catálogo do evento e o guarda localmente. Se estiver SEM rede no
  // cold-start, usa o catálogo salvo (o operador continua vendendo offline).
  useEffect(() => {
    const cacheKey = `catalog:${eventId}`;
    let active = true;
    (async () => {
      try {
        const fresh = await api<Product[]>(`/events/${eventId}/products`);
        if (!active) return;
        setProducts(fresh);
        AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch(() => undefined);
      } catch (e) {
        const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
        if (!active) return;
        if (cached) {
          setProducts(JSON.parse(cached) as Product[]);
        } else {
          setError((e as Error).message);
        }
      }
    })();
    return () => {
      active = false;
    };
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

  async function pay(method: PaymentMethod, adminPassword?: string): Promise<void> {
    // Guarda contra toque-duplo: se já estiver processando, ignora.
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setError('');
    const payload: SalePayload = {
      clientId: clientIdRef.current,
      machineId: deviceIdRef.current || undefined,
      items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
      payments: [{ method, amount: total.toFixed(2) }],
      ...(adminPassword ? { adminPassword } : {}),
    };
    // Linhas do cupom (nome/qtd/preço) — o comprovante lista os itens para
    // retirada no bar. Montadas aqui porque o carrinho tem nome e preço.
    const receiptLines: ReceiptLine[] = lines.map((l) => ({
      name: l.product.name,
      quantity: l.qty,
      unitPrice: l.product.price,
    }));
    const isCourtesy = method === 'CORTESIA';
    try {
      const res = await onCheckout(payload, receiptLines);
      clientIdRef.current = uuid(); // próxima venda ganha um id novo
      clear();
      Alert.alert(
        isCourtesy ? 'Cortesia registrada' : res.offline ? 'Venda salva (offline)' : 'Venda concluída',
        isCourtesy
          ? 'Brinde autorizado e registrado. Comprovante impresso.'
          : res.offline
            ? 'Será sincronizada automaticamente ao reconectar.'
            : 'Pagamento registrado e comprovante impresso.',
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  // Cortesia: pede a senha administrativa do evento antes de registrar o brinde.
  function askCourtesyPassword(): void {
    if (!online) {
      setError('Cortesia precisa de internet (a senha é validada no servidor).');
      return;
    }
    setAdminPw('');
    setCourtesyOpen(true);
  }

  async function confirmCourtesy(): Promise<void> {
    const pw = adminPw.trim();
    setCourtesyOpen(false);
    setAdminPw('');
    if (pw) await pay('CORTESIA', pw);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.statusBar}>
        <View style={[styles.dot, { backgroundColor: online ? colors.accent : colors.danger }]} />
        <Text style={{ color: colors.muted }}>
          {online ? 'Online' : 'Offline'} · fila: {pending}
        </Text>
        {errored > 0 ? (
          <Text style={{ color: colors.danger, marginLeft: 8, fontWeight: '700' }}>
            ⚠ {errored} com erro
          </Text>
        ) : null}
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
              style={[styles.button, { marginBottom: 10, opacity: processing ? 0.4 : 1 }]}
              disabled={processing}
              onPress={() => pay(m)}
            >
              <Text style={styles.buttonText}>{processing ? 'Processando…' : m}</Text>
            </TouchableOpacity>
          ))}
          {/* Cortesia (brinde) — pede a senha administrativa do evento. */}
          <TouchableOpacity
            style={[styles.courtesyButton, { opacity: processing ? 0.4 : 1 }]}
            disabled={processing}
            onPress={askCourtesyPassword}
          >
            <Text style={styles.courtesyText}>🎁 CORTESIA (brinde)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { marginTop: 10 }]}
            onPress={() => setPaying(false)}
          >
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

      {/* Cortesia: senha administrativa do evento. */}
      <Modal transparent visible={courtesyOpen} animationType="fade" onRequestClose={() => setCourtesyOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>Cortesia (brinde)</Text>
            <Text style={styles.subtitle}>
              Total R$ {total.toFixed(2)} · digite a senha administrativa do evento para autorizar.
            </Text>
            <TextInput
              style={styles.input}
              value={adminPw}
              onChangeText={setAdminPw}
              secureTextEntry
              autoFocus
              placeholder="Senha administrativa"
              placeholderTextColor="#6b7794"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.secondaryButton, { flex: 1 }]}
                onPress={() => {
                  setCourtesyOpen(false);
                  setAdminPw('');
                }}
              >
                <Text style={styles.secondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={confirmCourtesy}>
                <Text style={styles.buttonText}>Autorizar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
