/**
 * Perfis de acesso (RBAC). A matriz de permissões está documentada em PLAN.md §7.
 */
export enum Role {
  OPERADOR = 'OPERADOR',
  SUPERVISOR = 'SUPERVISOR',
  ADMINISTRADOR = 'ADMINISTRADOR',
}

export const ROLES = Object.values(Role);
