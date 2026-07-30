import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EventScope } from '../../auth/auth.types';
import { EventScopeParam } from '../../auth/decorators/event-role.decorator';
import { EventScopeGuard } from '../../auth/guards/event-scope.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { PixChargeService } from './pix-charge.service';
import { CreatePixDto, createPixSchema } from './pix.dto';

/**
 * Cobrança PIX online (PagBank). Escopo por evento no SERVIDOR — o eventId vem do
 * path e é validado pelo EventScopeGuard (não confia no corpo). Só membros do evento.
 */
@ApiTags('Pagamentos')
@ApiBearerAuth()
@Controller('events/:eventId/payments')
@UseGuards(JwtAuthGuard, EventScopeGuard, RolesGuard)
export class PixController {
  constructor(private readonly pix: PixChargeService) {}

  /** Fase 1: cria a cobrança e devolve o QR para o terminal exibir. */
  @Post('pix')
  createPix(
    @EventScopeParam() scope: EventScope,
    @Body(new ZodValidationPipe(createPixSchema)) dto: CreatePixDto,
  ) {
    return this.pix.createCharge({
      eventId: scope.eventId,
      amount: dto.amount,
      clientId: dto.clientId,
    });
  }

  /** Poll de status (a tela consulta a cada poucos segundos; fallback do webhook). */
  @Get(':paymentId/status')
  status(@EventScopeParam() scope: EventScope, @Param('paymentId') paymentId: string) {
    return this.pix.status(scope.eventId, paymentId);
  }
}
