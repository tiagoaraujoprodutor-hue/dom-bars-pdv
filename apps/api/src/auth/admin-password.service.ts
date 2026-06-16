import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from './password.util';

/**
 * Verifica a senha administrativa por evento, obrigatória para ações críticas
 * (sangria, suprimento, cortesia, reembolso e alterações críticas). Ver PLAN §7.
 */
@Injectable()
export class AdminPasswordService {
  constructor(private readonly prisma: PrismaService) {}

  async assertValid(eventId: string, adminPassword: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { adminPasswordHash: true },
    });

    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    const ok = await verifyPassword(event.adminPasswordHash, adminPassword);
    if (!ok) {
      throw new ForbiddenException('Senha administrativa inválida');
    }
  }
}
