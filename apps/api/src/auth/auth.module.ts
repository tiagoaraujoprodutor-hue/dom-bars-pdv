import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminPasswordService } from './admin-password.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EventScopeGuard } from './guards/event-scope.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AdminPasswordService,
    EventScopeGuard,
    RolesGuard,
  ],
  exports: [AuthService, AdminPasswordService, EventScopeGuard, RolesGuard],
})
export class AuthModule {}
