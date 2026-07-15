import {
  SyncEngine,
  buildProductionTicket,
  buildReceipt,
  type ReceiptLine,
  type SalePayload,
} from '@dom-bars/shared';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import { loadUser, logout, type AuthUser } from './src/lib/auth';
import { useOnline } from './src/lib/network';
import { printer } from './src/lib/printer';
import { createSaleSender } from './src/lib/sale-sender';
import { SqliteOutboxStore } from './src/lib/sqlite-outbox';
import { api } from './src/lib/api';
import { EventPickerScreen, type EventItem } from './src/screens/EventPickerScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OpenCashScreen } from './src/screens/OpenCashScreen';
import { SaleScreen } from './src/screens/SaleScreen';
import { TabsScreen } from './src/screens/TabsScreen';
import { colors } from './src/theme';

type Tab = 'sale' | 'tabs';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [tab, setTab] = useState<Tab>('sale');
  const [pending, setPending] = useState(0);
  const [ready, setReady] = useState(false);
  const [cashOpen, setCashOpen] = useState<boolean | null>(null);

  const online = useOnline();
  const engineRef = useRef<SyncEngine | null>(null);

  // Auto-login com sessão persistida.
  useEffect(() => {
    loadUser().then(setUser).catch(() => undefined);
  }, []);

  // Inicializa o outbox durável + motor de sync ao escolher o evento.
  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    (async () => {
      const store = new SqliteOutboxStore();
      await store.init();
      if (cancelled) return;
      engineRef.current = new SyncEngine(store, createSaleSender(event.id));
      setPending(await engineRef.current.pendingCount());
      setReady(true);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [event]);

  // Verifica se o atendente já tem caixa aberto neste evento.
  useEffect(() => {
    if (!event) {
      setCashOpen(null);
      return;
    }
    api<unknown>(`/events/${event.id}/cash-registers/current`)
      .then((r) => setCashOpen(r != null))
      .catch(() => setCashOpen(false));
  }, [event]);

  // Drena a fila quando há conexão.
  useEffect(() => {
    if (!ready || !online || !engineRef.current) return;
    engineRef.current
      .flush()
      .then(() => engineRef.current?.pendingCount())
      .then((count) => setPending(count ?? 0))
      .catch(() => undefined);
  }, [online, ready]);

  const onCheckout = useCallback(
    async (payload: SalePayload, receiptLines: ReceiptLine[]): Promise<{ offline: boolean }> => {
      const engine = engineRef.current;
      if (!engine) throw new Error('Sincronização não iniciada');

      // 1) Persiste de forma durável (nunca perde a venda).
      await engine.enqueue('sale', payload, payload.clientId);
      setPending(await engine.pendingCount());

      // 2) Tenta sincronizar agora se houver rede.
      if (online) await engine.flush();
      const remaining = await engine.pendingCount();
      setPending(remaining);

      // 3) Imprime (best-effort, não bloqueia a venda):
      //    a) Comprovante com os itens (o cliente retira os produtos no bar).
      //    b) Ficha do bar (só o que preparar/entregar, sem valores).
      const total = payload.payments.reduce((a, p) => a + Number(p.amount), 0).toFixed(2);
      const eventName = event?.name ?? 'Evento';
      const attendant = user?.name;
      const dateTime = new Date().toLocaleString('pt-BR');
      await printer
        .print(
          buildReceipt({
            eventName,
            saleId: payload.clientId,
            items: receiptLines,
            subtotal: total,
            serviceFee: '0.00',
            total,
            payments: payload.payments,
            attendant,
            dateTime,
          }),
        )
        .catch(() => undefined);
      await printer
        .print(buildProductionTicket(eventName, receiptLines, { attendant, dateTime }))
        .catch(() => undefined);

      return { offline: !online };
    },
    [online, event, user],
  );

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        <LoginScreen onLogin={setUser} />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        <EventPickerScreen onPick={setEvent} />
      </SafeAreaView>
    );
  }

  // Sem caixa aberto do atendente → tela de abertura (ou aguardando verificação).
  if (cashOpen !== true) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        {cashOpen === false ? (
          <OpenCashScreen
            eventId={event.id}
            eventName={event.name}
            onOpened={() => setCashOpen(true)}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        {tab === 'sale' ? (
          <SaleScreen eventId={event.id} online={online} pending={pending} onCheckout={onCheckout} />
        ) : (
          <TabsScreen eventId={event.id} />
        )}
      </View>
      <View style={{ flexDirection: 'row', borderTopColor: colors.border, borderTopWidth: 1 }}>
        <NavButton label="Vender" active={tab === 'sale'} onPress={() => setTab('sale')} />
        <NavButton label="Comandas" active={tab === 'tabs'} onPress={() => setTab('tabs')} />
        <NavButton
          label="Sair"
          active={false}
          onPress={() => {
            logout().catch(() => undefined);
            setUser(null);
            setEvent(null);
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function NavButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={{ flex: 1, padding: 16, alignItems: 'center', backgroundColor: colors.panel }}
      onPress={onPress}
    >
      <Text style={{ color: active ? colors.accent : colors.muted, fontWeight: '700' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
