import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuid } from '@dom-bars/shared';

const KEY = 'deviceId';
let cached: string | null = null;

/**
 * Identificador ESTÁVEL e ÚNICO por terminal. Gerado uma vez no primeiro uso e
 * guardado localmente. Vai como `machineId` em cada venda/login — dá rastreio por
 * aparelho (qual terminal fez cada venda), essencial para conciliar e detectar
 * fraude. Antes todos os aparelhos mandavam o mesmo valor fixo ("smart2-terminal").
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id = await AsyncStorage.getItem(KEY).catch(() => null);
  if (!id) {
    id = `smart2-${uuid()}`;
    await AsyncStorage.setItem(KEY, id).catch(() => undefined);
  }
  cached = id;
  return id;
}
