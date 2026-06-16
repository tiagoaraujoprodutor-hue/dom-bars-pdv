import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, EventScope } from '../auth.types';

/** Retorna o escopo de evento resolvido pelo EventScopeGuard. */
export const EventScopeParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): EventScope | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.eventScope;
  },
);
