import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth.types';

/**
 * Aplica a matriz RBAC (PLAN §7) usando o papel resolvido pelo EventScopeGuard.
 * Deve ser usado SEMPRE depois de JwtAuthGuard + EventScopeGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.eventScope?.role;

    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Perfil sem permissão para esta ação');
    }

    return true;
  }
}
