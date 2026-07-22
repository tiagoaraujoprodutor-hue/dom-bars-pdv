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

  /**
   * Janela mínima entre recálculos do dashboard por evento (ms). Recalcular o
   * snapshot a cada venda não escala: numa rajada (60+ máquinas vendendo ao mesmo
   * tempo) seriam centenas de agregações pesadas competindo por conexão, o que
   * afoga o banco e trava a operação. Coalescemos para no máx. 1 por janela, com
   * borda de subida imediata + borda de descida (garante o estado final).
   */
  private readonly WINDOW_MS = 1000;
  private readonly cooling = new Set<string>();
  private readonly pending = new Set<string>();

  constructor(
    private readonly gateway: EventsGateway,
    private readonly dashboard: DashboardService,
  ) {}

  /** Agenda a publicação do dashboard (com throttle por evento). */
  publishDashboard(eventId: string): void {
    if (this.cooling.has(eventId)) {
      this.pending.add(eventId); // recalcula ao fim da janela com o estado final
      return;
    }
    this.run(eventId);
  }

  private run(eventId: string): void {
    this.cooling.add(eventId);
    this.pending.delete(eventId);
    void this.dashboard
      .snapshot(eventId)
      .then((snapshot) => this.gateway.emitToEvent(eventId, 'dashboard:update', snapshot))
      .catch((error: unknown) =>
        this.logger.warn(`Falha ao publicar dashboard: ${(error as Error).message}`),
      )
      .finally(() => {
        setTimeout(() => {
          this.cooling.delete(eventId);
          if (this.pending.has(eventId)) this.run(eventId);
        }, this.WINDOW_MS).unref?.();
      });
  }
}
