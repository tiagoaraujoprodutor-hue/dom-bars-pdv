import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './auth.types';
import {
  LoginDto,
  LogoutDto,
  RefreshDto,
  loginSchema,
  logoutSchema,
  refreshSchema,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  // Obs.: NÃO limitamos login por IP — num evento, 60 terminais dividem o mesmo
  // NAT e logam no início do turno; um teto por IP barraria a operação real. A
  // defesa contra força-bruta da senha admin é por evento (AdminPasswordService).
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.authService.login({
      email: dto.email,
      cpf: dto.cpf,
      password: dto.password,
      machineId: dto.machineId,
    });
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto,
  ): Promise<void> {
    await this.authService.logout(user.userId, dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        companyId: true,
        memberships: { select: { eventId: true, role: true } },
      },
    });
    return record;
  }
}
