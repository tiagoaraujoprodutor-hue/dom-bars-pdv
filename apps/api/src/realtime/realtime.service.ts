import { Injectable, Logger } from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.service';
import { EventsGateway } from './events.gateway';

/**
 * Publica atualizações em tempo real para o evento. Uso fire-and-forget: nunca
 * deixa uma falha de WS quebrar a operação (venda/caixa). Ver guardrail de confiabilidade.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private readonly gateway: EventsGateway,
    private readonly dashboard: DashboardService,
  ) {}

  /** Recalcula o snapshot e emite `dashboard:update` para a sala do evento. */
  publishDashboard(eventId: string): void {
    void this.dashboard
      .snapshot(eventId)
      .then((snapshot) => this.gateway.emitToEvent(eventId, 'dashboard:update', snapshot))
      .catch((error: unknown) =>
        this.logger.warn(`Falha ao publicar dashboard: ${(error as Error).message}`),
      );
  }
}
