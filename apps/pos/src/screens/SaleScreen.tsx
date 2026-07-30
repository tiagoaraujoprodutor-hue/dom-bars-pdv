import {
  uuid,
  type PaymentMethod,
  type ReceiptLine,
  type SalePayload,
  type SalePaymentInput,
} from '@dom-bars/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
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
  // Pagamento dividido: parte em uma forma, parte em outra (crédito + pix, etc.).
  const [splitMode, setSplitMode] = useState(false);
  const [parts, setParts] = useState<SalePaymentInput[]>([]);
  const [partValue, setPartValue] = useState('');
  // PIX online (PagBank): 'manual' = confirmação do operador (hoje); 'pagbank' = QR.
  const [pixProvider, setPixProvider] = useState<'manual' | 'pagbank'>('manual');
  const [pixCharge, setPixCharge] = useState<{
    paymentId: string;
    qrText: string;
    qrImageUrl?: string | null;
  } | null>(null);
  const pixPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Descobre como cobrar PIX (QR do PagBank ou manual). Falha → mantém 'manual'
  // (comportamento de hoje), então nada muda enquanto o PagBank não estiver ligado.
  useEffect(() => {
    api<{ pixProvider: 'manual' | 'pagbank' }>(`/events/${eventId}/payments/config`)
      .then((r) => setPixProvider(r.pixProvider))
      .catch(() => setPixProvider('manual'));
  }, [eventId]);

  // Para o polling do PIX ao desmontar.
  useEffect(() => () => stopPixPolling(), []);

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
    setSplitMode(false);
    setParts([]);
    setPartValue('');
  }

  // Fecha a venda com UMA OU MAIS formas de pagamento (dividido). O servidor exige
  // que a soma feche com o total; a montagem das partes é validada aqui também.
  async function submit(payments: SalePaymentInput[], adminPassword?: string): Promise<void> {
    // Guarda contra toque-duplo: se já estiver processando, ignora.
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setError('');
    const payload: SalePayload = {
      clientId: clientIdRef.current,
      machineId: deviceIdRef.current || undefined,
      items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
      payments,
      ...(adminPassword ? { adminPassword } : {}),
    };
    // Linhas do cupom (nome/qtd/preço) — o comprovante lista os itens para
    // retirada no bar. Montadas aqui porque o carrinho tem nome e preço.
    const receiptLines: ReceiptLine[] = lines.map((l) => ({
      name: l.product.name,
      quantity: l.qty,
      unitPrice: l.product.price,
    }));
    const isCourtesy = payments.some((p) => p.method === 'CORTESIA');
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

  /** Pagamento em forma única (fluxo rápido de sempre) — total inteiro numa forma. */
  function pay(method: PaymentMethod, adminPassword?: string): Promise<void> {
    return submit([{ method, amount: total.toFixed(2) }], adminPassword);
  }

  // ── PIX online (PagBank) ──
  // Toque numa forma: PIX com PagBank ligado abre o QR; o resto segue normal.
  function onPickMethod(method: PaymentMethod): void {
    if (method === 'PIX' && pixProvider === 'pagbank') {
      if (!online) {
        setError('PIX precisa de internet (cobrança pelo PagBank).');
        return;
      }
      void startPixQr();
      return;
    }
    void pay(method);
  }

  async function startPixQr(): Promise<void> {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setError('');
    try {
      const charge = await api<{ paymentId: string; qrText: string; qrImageUrl?: string | null }>(
        `/events/${eventId}/payments/pix`,
        { method: 'POST', body: { amount: total.toFixed(2), clientId: clientIdRef.current } },
      );
      setPixCharge(charge);
      startPixPolling(charge.paymentId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  function startPixPolling(paymentId: string): void {
    stopPixPolling();
    pixPollRef.current = setInterval(() => {
      api<{ status: string }>(`/events/${eventId}/payments/${paymentId}/status`)
        .then((r) => {
          if (r.status === 'APROVADO') {
            stopPixPolling();
            void finishPix(paymentId);
          } else if (r.status === 'RECUSADO' || r.status === 'CANCELADO') {
            stopPixPolling();
            setPixCharge(null);
            setError('PIX não aprovado. Tente novamente.');
          }
        })
        .catch(() => undefined);
    }, 3000);
  }

  function stopPixPolling(): void {
    if (pixPollRef.current) {
      clearInterval(pixPollRef.current);
      pixPollRef.current = null;
    }
  }

  // PIX aprovado → fecha a venda amarrando o pagamento pré-aprovado (paymentId).
  async function finishPix(paymentId: string): Promise<void> {
    setPixCharge(null);
    await submit([{ method: 'PIX', amount: total.toFixed(2), paymentId }]);
  }

  function cancelPix(): void {
    stopPixPolling();
    setPixCharge(null);
    // A cobrança fica pendente no PagBank e expira sozinha; a venda não é fechada.
  }

  // ── Pagamento dividido ──
  // Contas em centavos para não ter erro de ponto flutuante ao fechar o total.
  const totalCents = Math.round(total * 100);
  const paidCents = parts.reduce((a, p) => a + Math.round(Number(p.amount) * 100), 0);
  const remainingCents = totalCents - paidCents;

  function parseAmount(v: string): number {
    const n = Number(v.replace(',', '.').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function openSplit(): void {
    setParts([]);
    setError('');
    setPartValue(total.toFixed(2));
    setSplitMode(true);
  }

  function closeSplit(): void {
    setSplitMode(false);
    setParts([]);
    setPartValue('');
    setError('');
  }

  function addPart(method: PaymentMethod): void {
    const remCents = totalCents - paidCents;
    if (remCents <= 0) {
      setError('Pagamento já está completo.');
      return;
    }
    const amt = parseAmount(partValue);
    if (amt <= 0) {
      setError('Informe o valor desta parte.');
      return;
    }
    // Nunca deixa passar do total — a última parte fecha exatamente o que falta.
    const amtCents = Math.min(Math.round(amt * 100), remCents);
    setError('');
    setParts((prev) => [...prev, { method, amount: (amtCents / 100).toFixed(2) }]);
    const newRem = remCents - amtCents;
    setPartValue(newRem > 0 ? (newRem / 100).toFixed(2) : '');
  }

  function removePart(index: number): void {
    setParts((prev) => prev.filter((_, i) => i !== index));
    setError('');
  }

  function finalizeSplit(): void {
    if (remainingCents !== 0) {
      setError(`Falta R$ ${(remainingCents / 100).toFixed(2)} para fechar o total.`);
      return;
    }
    void submit(parts);
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
          {!splitMode ? (
            <>
              <Text style={styles.title}>Pagamento · R$ {total.toFixed(2)}</Text>
              {METHODS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.button, { marginBottom: 10, opacity: processing ? 0.4 : 1 }]}
                  disabled={processing}
                  onPress={() => onPickMethod(m)}
                >
                  <Text style={styles.buttonText}>
                    {processing ? 'Processando…' : m === 'PIX' && pixProvider === 'pagbank' ? 'PIX (QR)' : m}
                  </Text>
                </TouchableOpacity>
              ))}
              {/* Pagamento dividido: parte numa forma, parte em outra. */}
              <TouchableOpacity
                style={[styles.secondaryButton, { marginBottom: 10, opacity: processing ? 0.4 : 1 }]}
                disabled={processing}
                onPress={openSplit}
              >
                <Text style={styles.secondaryText}>➗ Dividir pagamento</Text>
              </TouchableOpacity>
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
            </>
          ) : (
            <>
              <Text style={styles.title}>Dividir pagamento</Text>
              <Text style={styles.subtitle}>
                Total R$ {total.toFixed(2)} ·{' '}
                {remainingCents > 0
                  ? `falta R$ ${(remainingCents / 100).toFixed(2)}`
                  : 'total coberto ✓'}
              </Text>
              <TextInput
                style={styles.input}
                value={partValue}
                onChangeText={setPartValue}
                keyboardType="numeric"
                placeholder="Valor desta parte"
                placeholderTextColor="#6b7794"
                editable={remainingCents > 0 && !processing}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {/* Com PagBank ligado, PIX no dividido sai da lista (PIX vai pelo QR
                    inteiro; dividir com PIX-QR fica p/ uma etapa futura). */}
                {METHODS.filter((m) => !(m === 'PIX' && pixProvider === 'pagbank')).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.button,
                      {
                        flexGrow: 1,
                        flexBasis: '45%',
                        marginBottom: 0,
                        opacity: remainingCents <= 0 || processing ? 0.4 : 1,
                      },
                    ]}
                    disabled={remainingCents <= 0 || processing}
                    onPress={() => addPart(m)}
                  >
                    <Text style={styles.buttonText}>+ {m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {parts.length > 0 ? (
                <View style={[styles.card, { paddingVertical: 8, marginTop: 10 }]}>
                  {parts.map((p, i) => (
                    <View key={`${p.method}-${i}`} style={styles.cartRow}>
                      <Text style={[styles.cartName, { flex: 1 }]}>{p.method}</Text>
                      <Text style={[styles.cartSub, { marginRight: 8 }]}>
                        R$ {Number(p.amount).toFixed(2)}
                      </Text>
                      <TouchableOpacity style={styles.removeBtn} onPress={() => removePart(i)}>
                        <Text style={styles.removeText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.button,
                  { marginTop: 12, opacity: remainingCents === 0 && !processing ? 1 : 0.4 },
                ]}
                disabled={remainingCents !== 0 || processing}
                onPress={finalizeSplit}
              >
                <Text style={styles.buttonText}>
                  {processing ? 'Processando…' : 'Finalizar pagamento'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, { marginTop: 10 }]}
                disabled={processing}
                onPress={closeSplit}
              >
                <Text style={styles.secondaryText}>Voltar</Text>
              </TouchableOpacity>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          )}
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

      {/* PIX (PagBank): mostra o QR para o cliente escanear e aguarda a confirmação. */}
      <Modal transparent visible={pixCharge != null} animationType="fade" onRequestClose={cancelPix}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>PIX · R$ {total.toFixed(2)}</Text>
            <Text style={styles.subtitle}>O cliente escaneia o QR abaixo para pagar.</Text>
            {pixCharge?.qrImageUrl ? (
              <Image
                source={{ uri: pixCharge.qrImageUrl }}
                style={{
                  width: 220,
                  height: 220,
                  alignSelf: 'center',
                  backgroundColor: '#fff',
                  borderRadius: 8,
                }}
              />
            ) : null}
            <Text
              selectable
              numberOfLines={2}
              style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}
            >
              {pixCharge?.qrText}
            </Text>
            <Text style={{ color: colors.accent, textAlign: 'center', marginTop: 10, fontWeight: '700' }}>
              Aguardando pagamento…
            </Text>
            <TouchableOpacity style={[styles.secondaryButton, { marginTop: 12 }]} onPress={cancelPix}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </TouchableOpacity>
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
