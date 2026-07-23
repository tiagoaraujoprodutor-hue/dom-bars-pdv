import {
  SyncEngine,
  buildProductionTicket,
  buildReceipt,
  type ReceiptLine,
  type SalePayload,
} from '@dom-bars/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { OrdersScreen } from './src/screens/OrdersScreen';
import { SaleScreen } from './src/screens/SaleScreen';
import { TabsScreen } from './src/screens/TabsScreen';
import { colors } from './src/theme';

type Tab = 'sale' | 'tabs' | 'orders';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [tab, setTab] = useState<Tab>('sale');
  const [pending, setPending] = useState(0);
  const [errored, setErrored] = useState(0);
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
      setErrored(await engineRef.current.erroredCount());
      setReady(true);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [event]);

  // Verifica se o atendente já tem caixa aberto neste evento. Se estiver SEM rede,
  // assume o último estado conhecido (persistido localmente) em vez de forçar
  // "sem caixa" — assim quem já abriu o caixa não fica travado no cold-start offline.
  useEffect(() => {
    if (!event) {
      setCashOpen(null);
      return;
    }
    const key = `cashOpen:${event.id}`;
    let active = true;
    api<unknown>(`/events/${event.id}/cash-registers/current`)
      .then((r) => {
        if (!active) return;
        const open = r != null;
        setCashOpen(open);
        AsyncStorage.setItem(key, open ? '1' : '0').catch(() => undefined);
      })
      .catch(async () => {
        const saved = await AsyncStorage.getItem(key).catch(() => null);
        if (active) setCashOpen(saved === '1');
      });
    return () => {
      active = false;
    };
  }, [event]);

  // Drena a fila quando há conexão.
  useEffect(() => {
    if (!ready || !online || !engineRef.current) return;
    engineRef.current
      .flush()
      .then(() => engineRef.current?.pendingCount())
      .then((count) => setPending(count ?? 0))
      .then(() => engineRef.current?.erroredCount())
      .then((e) => setErrored(e ?? 0))
      .catch(() => undefined);
  }, [online, ready]);

  // Retentativa periódica enquanto houver itens na fila: mesmo que o sinal de
  // "online" não oscile, tenta esvaziar a fila a cada 15s (rede pode ter voltado).
  useEffect(() => {
    if (!ready || pending === 0) return;
    const id = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      engine
        .flush()
        .then(() => engine.pendingCount())
        .then((count) => setPending(count ?? 0))
        .then(() => engine.erroredCount())
        .then((e) => setErrored(e ?? 0))
        .catch(() => undefined);
    }, 15_000);
    return () => clearInterval(id);
  }, [ready, pending]);

  const onCheckout = useCallback(
    async (payload: SalePayload, receiptLines: ReceiptLine[]): Promise<{ offline: boolean }> => {
      const engine = engineRef.current;
      if (!engine) throw new Error('Sincronização não iniciada');

      // Imprime comprovante (cliente) + ficha do bar (retirada). Best-effort e
      // com TIMEOUT: se a térmica travar/ficar sem papel, a impressão é abandonada
      // em 5s e o checkout NUNCA congela (a venda já está garantida no outbox).
      const printReceipts = async (): Promise<void> => {
        const total = payload.payments.reduce((a, p) => a + Number(p.amount), 0).toFixed(2);
        const eventName = event?.name ?? 'Evento';
        const attendant = user?.name;
        const dateTime = new Date().toLocaleString('pt-BR');
        const printSafe = (job: Parameters<typeof printer.print>[0]): Promise<void> =>
          Promise.race([
            printer.print(job).catch(() => undefined),
            new Promise<void>((resolve) => setTimeout(resolve, 5000)),
          ]).then(() => undefined);
        await printSafe(
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
        );
        await printSafe(buildProductionTicket(eventName, receiptLines, { attendant, dateTime }));
      };

      // Cortesia (tem senha admin): vai DIRETO ao servidor, que valida a senha na
      // hora. Não entra na fila offline — se a senha estiver errada, o erro aparece
      // imediatamente (a chamada lança). Exige internet (garantido pela tela).
      if (payload.adminPassword) {
        if (!event) throw new Error('Evento não selecionado');
        await api(`/events/${event.id}/sales`, { method: 'POST', body: payload });
        await printReceipts();
        return { offline: false };
      }

      // Fluxo normal (offline-first): 1) persiste durável (nunca perde a venda).
      await engine.enqueue('sale', payload, payload.clientId);
      setPending(await engine.pendingCount());

      // 2) Sincroniza agora se houver rede.
      if (online) await engine.flush();
      setPending(await engine.pendingCount());
      setErrored(await engine.erroredCount());

      // 3) Imprime.
      await printReceipts();

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
        <EventPickerScreen
          onPick={setEvent}
          onLogout={() => {
            logout().catch(() => undefined);
            setUser(null);
            setEvent(null);
          }}
        />
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
            onOpened={() => {
              setCashOpen(true);
              AsyncStorage.setItem(`cashOpen:${event.id}`, '1').catch(() => undefined);
            }}
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
          <SaleScreen
            eventId={event.id}
            online={online}
            pending={pending}
            errored={errored}
            onCheckout={onCheckout}
          />
        ) : tab === 'tabs' ? (
          <TabsScreen eventId={event.id} />
        ) : (
          <OrdersScreen eventId={event.id} eventName={event.name} />
        )}
      </View>
      <View style={{ flexDirection: 'row', borderTopColor: colors.border, borderTopWidth: 1 }}>
        <NavButton label="Vender" active={tab === 'sale'} onPress={() => setTab('sale')} />
        <NavButton label="Comandas" active={tab === 'tabs'} onPress={() => setTab('tabs')} />
        <NavButton label="Pedidos" active={tab === 'orders'} onPress={() => setTab('orders')} />
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
