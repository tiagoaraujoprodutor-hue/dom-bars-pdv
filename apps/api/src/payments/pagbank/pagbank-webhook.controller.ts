import { Body, Controller, ForbiddenException, HttpCode, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PixChargeService } from './pix-charge.service';

/**
 * Webhook do PagBank (PÚBLICO — o PagBank chama pela internet, sem JWT).
 * Autenticidade em duas camadas: (1) nosso token na querystring (?t=) barra POST
 * forjado; (2) RE-BUSCA do pedido no PagBank (não confia no corpo). Responde 200
 * rápido — o PagBank reenvia sozinho se falhar.
 */
@Controller('payments/pagbank')
export class PagBankWebhookController {
  constructor(
    private readonly pix: PixChargeService,
    private readonly cfg: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Query('t') t: string, @Body() body: { id?: string }): Promise<{ received: boolean }> {
    if (!t || t !== this.cfg.get<string>('PAGBANK_WEBHOOK_TOKEN')) {
      throw new ForbiddenException();
    }
    if (body?.id) {
      await this.pix.confirmFromOrder(body.id);
    }
    return { received: true };
  }
}
