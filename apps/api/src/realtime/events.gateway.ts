import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtAccessPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

function room(eventId: string): string {
  return `event:${eventId}`;
}

/**
 * Gateway WebSocket com salas por evento (namespace `/events`). A conexão é
 * autenticada por JWT + verificação de membership no evento (isolamento). Clientes
 * recebem `dashboard:update` quando há novidade (venda, caixa, etc.). Ver PLAN §3/§6.10.
 */
@WebSocketGateway({ namespace: '/events', cors: { origin: true } })
export class EventsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);
      const eventId =
        (client.handshake.auth?.eventId as string | undefined) ??
        (client.handshake.query?.eventId as string | undefined);

      if (!token || !eventId) {
        throw new Error('token e eventId obrigatórios');
      }

      const payload = await this.jwt.verifyAsync<JwtAccessPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      const membership = await this.prisma.eventMembership.findUnique({
        where: { userId_eventId: { userId: payload.sub, eventId } },
      });
      if (!membership) {
        throw new Error('sem acesso ao evento');
      }

      await client.join(room(eventId));
      client.emit('connected', { eventId, role: membership.role });
    } catch (error) {
      this.logger.warn(`Conexão WS recusada: ${(error as Error).message}`);
      client.disconnect();
    }
  }

  emitToEvent(eventId: string, event: string, payload: unknown): void {
    this.server?.to(room(eventId)).emit(event, payload);
  }
}
