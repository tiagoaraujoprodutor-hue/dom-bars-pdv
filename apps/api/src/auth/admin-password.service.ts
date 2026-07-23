import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from './password.util';

/** Quem está tentando (opcional) — usado só para enriquecer a auditoria da falha. */
export interface AdminPasswordContext {
  userId?: string | null;
  companyId?: string | null;
}

interface Attempts {
  fails: number;
  firstFailAt: number;
  lockedUntil: number;
}

const MAX_FAILS = 5; // tentativas erradas antes de começar o bloqueio
const WINDOW_MS = 60_000; // janela de contagem das falhas
const BASE_LOCK_MS = 30_000; // bloqueio base ao estourar o limite
const MAX_LOCK_MS = 15 * 60_000; // teto do bloqueio (15 min)

/**
 * Verifica a senha administrativa por evento, obrigatória para ações críticas
 * (sangria, suprimento, cortesia, reembolso, cancelamento, fechamento). Ver PLAN §7.
 *
 * A senha admin é o ÚNICO portão de várias ações que movem dinheiro/mercadoria e é
 * alcançável por qualquer membro do evento (inclusive atendente). Por isso aqui há
 * defesa ANTIFRAUDE contra força-bruta: após poucas tentativas erradas o evento
 * entra em bloqueio com backoff exponencial, e toda falha é auditada (visível para
 * o gestor). Sem isso, o throttle global (milhares/min) não protegia o segredo.
 */
@Injectable()
export class AdminPasswordService {
  // Contador em memória por evento (deploy single-instance). Reinicia com o
  // processo — aceitável, pois o atacante não controla o servidor.
  private readonly attempts = new Map<string, Attempts>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async assertValid(
    eventId: string,
    adminPassword: string,
    context: AdminPasswordContext = {},
  ): Promise<void> {
    const now = Date.now();
    this.assertNotLocked(eventId, now);

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { adminPasswordHash: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    const ok = await verifyPassword(event.adminPasswordHash, adminPassword);
    if (!ok) {
      await this.registerFailure(eventId, now, context);
      throw new ForbiddenException('Senha administrativa inválida');
    }

    // Acertou: zera o histórico de falhas deste evento.
    this.attempts.delete(eventId);
  }

  private assertNotLocked(eventId: string, now: number): void {
    const entry = this.attempts.get(eventId);
    if (entry && entry.lockedUntil > now) {
      const seconds = Math.ceil((entry.lockedUntil - now) / 1000);
      throw new HttpException(
        `Muitas tentativas de senha administrativa. Aguarde ${seconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async registerFailure(
    eventId: string,
    now: number,
    context: AdminPasswordContext,
  ): Promise<void> {
    const prev = this.attempts.get(eventId);
    // Reinicia a contagem se a janela expirou (e não está bloqueado).
    const withinWindow = prev && now - prev.firstFailAt <= WINDOW_MS;
    const fails = withinWindow ? prev!.fails + 1 : 1;
    const firstFailAt = withinWindow ? prev!.firstFailAt : now;

    let lockedUntil = 0;
    if (fails >= MAX_FAILS) {
      // Backoff exponencial a partir do limite, com teto.
      const over = fails - MAX_FAILS;
      lockedUntil = now + Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** over);
    }
    this.attempts.set(eventId, { fails, firstFailAt, lockedUntil });

    // Auditoria da tentativa falha (append-only) — sinaliza força-bruta ao gestor.
    await this.audit
      .record({
        action: 'ADMIN_PASSWORD_FAIL',
        userId: context.userId ?? null,
        companyId: context.companyId ?? null,
        eventId,
        entity: 'Event',
        entityId: eventId,
        metadata: { fails, locked: lockedUntil > now },
      })
      .catch(() => undefined);
  }
}
