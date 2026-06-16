import { io, Socket } from 'socket.io-client';
import { API_URL, getToken } from './api';

/** Conecta à sala WebSocket do evento (namespace /events). */
export function connectEvent(eventId: string): Socket {
  return io(`${API_URL}/events`, {
    auth: { token: getToken(), eventId },
    transports: ['websocket'],
    reconnection: true,
  });
}
