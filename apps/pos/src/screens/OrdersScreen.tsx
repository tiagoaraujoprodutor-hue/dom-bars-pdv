import {
  buildProductionTicket,
  buildReceipt,
  type PaymentMethod,
  type ReceiptLine,
  type SalePaymentInput,
} from '@dom-bars/shared';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../lib/api';
import { printer } from '../lib/printer';
import { colors, styles } from '../theme';

interface ManagedItem {
  name: string;
  quantity: number;
  unitPrice: string;
  isCourtesy: boolean;
}
interface ManagedPayment {
  method: string;
  amount: string;
}
interface ManagedSale {
  id: string;
  createdAt: string;
  operatorName: string;
  machineId: string | null;
  total: string;
  status: string;
  reprintCount: number;
  reprintedAt: string | null;
  items: ManagedItem[];
  payments: ManagedPayment[];
}

/**
 * Aba de gestão de pedidos (só abre com a senha administrativa do evento).
 * Mostra os pedidos por atendente com hora, itens e valor; permite reimprimir a
 * ficha (registrado no sistema) e cancelar o pedido. A senha admin autoriza cada
 * ação no servidor (o admin abre a aba na máquina da atendente).
 */
export function OrdersScreen({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [pw, setPw] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [sales, setSales] = useState<ManagedSale[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  async function unlock(): Promise<void> {
    setError('');
    setLoading(true);
    try {
      const data = await api<ManagedSale[]>(`/events/${eventId}/sales/manage`, {
        method: 'POST',
        body: { adminPassword: pw },
      });
      setAdminPw(pw);
      setSales(data);
      setPw('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function reload(): Promise<void> {
    try {
      const data = await api<ManagedSale[]>(`/events/${eventId}/sales/manage`, {
        method: 'POST',
        body: { adminPassword: adminPw },
      });
      setSales(data);
    } catch {
      // mantém a lista atual em caso de falha de rede
    }
  }

  async function reprint(s: ManagedSale): Promise<void> {
    try {
      await api(`/events/${eventId}/sales/${s.id}/reprint`, {
        method: 'POST',
        body: { adminPassword: adminPw },
      });
      const lines: ReceiptLine[] = s.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      }));
      const payments: SalePaymentInput[] = s.payments.map((p) => ({
        method: p.method as PaymentMethod,
        amount: p.amount,
      }));
      const dateTime = new Date(s.createdAt).toLocaleString('pt-BR');
      await printer
        .print(
          buildReceipt({
            eventName,
            saleId: s.id,
            items: lines,
            subtotal: s.total,
            serviceFee: '0.00',
            total: s.total,
            payments,
            attendant: s.operatorName,
            dateTime,
          }),
        )
        .catch(() => undefined);
      await printer
        .print(buildProductionTicket(eventName, lines, { attendant: s.operatorName, dateTime }))
        .catch(() => undefined);
      Alert.alert('Ficha reimpressa', 'A reimpressão foi registrada no sistema.');
      void reload();
    } catch (e) {
      Alert.alert('Erro', (e as Error).message);
    }
  }

  async function confirmCancel(): Promise<void> {
    const id = cancelId;
    const r = reason.trim();
    setCancelId(null);
    setReason('');
    if (!id) return;
    try {
      await api(`/events/${eventId}/sales/${id}/cancel`, {
        method: 'POST',
        body: { adminPassword: adminPw, reason: r || 'cancelado pelo admin' },
      });
      Alert.alert('Pedido cancelado', 'Estorno registrado e estoque devolvido.');
      void reload();
    } catch (e) {
      Alert.alert('Erro', (e as Error).message);
    }
  }

  // Portão: pede a senha administrativa para abrir a aba.
  if (sales === null) {
    return (
      <View style={styles.screen}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={styles.title}>Pedidos</Text>
          <Text style={styles.subtitle}>
            Área de gestão. Digite a senha administrativa do evento para acessar.
          </Text>
          <TextInput
            style={styles.input}
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            autoFocus
            placeholder="Senha administrativa"
            placeholderTextColor="#6b7794"
          />
          <TouchableOpacity style={styles.button} onPress={unlock} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Abrindo…' : 'Abrir'}</Text>
          </TouchableOpacity>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Pedidos</Text>
      <FlatList
        data={sales}
        keyExtractor={(s) => s.id}
        renderItem={({ item: s }) => {
          const cancelada = s.status === 'CANCELADA';
          return (
            <View style={[styles.card, cancelada ? { opacity: 0.55 } : null]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: colors.muted }}>
                  {new Date(s.createdAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {s.operatorName}
                </Text>
                <Text style={{ color: colors.accent, fontWeight: '800', marginLeft: 'auto' }}>
                  R$ {Number(s.total).toFixed(2)}
                </Text>
              </View>
              {s.items.map((i, idx) => (
                <Text key={idx} style={styles.cartSub}>
                  {i.quantity}x {i.name} — R$ {(Number(i.unitPrice) * i.quantity).toFixed(2)}
                </Text>
              ))}
              <Text style={[styles.cartSub, { marginTop: 4 }]}>
                Pgto: {s.payments.map((p) => p.method).join(', ')}
                {s.reprintCount > 0 ? ` · reimpressa ${s.reprintCount}x` : ''}
                {cancelada ? ' · CANCELADA' : ''}
              </Text>
              {!cancelada ? (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, { flex: 1 }]}
                    onPress={() => reprint(s)}
                  >
                    <Text style={styles.secondaryText}>Reimprimir ficha</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryButton, { flex: 1, borderColor: colors.danger }]}
                    onPress={() => {
                      setReason('');
                      setCancelId(s.id);
                    }}
                  >
                    <Text style={[styles.secondaryText, { color: colors.danger }]}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.subtitle}>Nenhum pedido ainda.</Text>}
      />

      <Modal
        transparent
        visible={cancelId != null}
        animationType="fade"
        onRequestClose={() => setCancelId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>Cancelar pedido</Text>
            <Text style={styles.subtitle}>Informe o motivo do cancelamento.</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              autoFocus
              placeholder="Motivo (ex.: erro no pedido)"
              placeholderTextColor="#6b7794"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.secondaryButton, { flex: 1 }]}
                onPress={() => {
                  setCancelId(null);
                  setReason('');
                }}
              >
                <Text style={styles.secondaryText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={confirmCancel}>
                <Text style={styles.buttonText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
