import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export type PrincipalKind = 'parent' | 'child';

/**
 * Who is making this request.
 *
 * A parent principal can administer profiles. A child principal can play and
 * read its own progress, and nothing else. Both are minted from the same
 * parent login — a five-year-old never types a password.
 */
export interface Principal {
  kind: PrincipalKind;
  /** parentId for a parent principal, childId for a child principal. */
  id: string;
  /** Present on a child principal: the parent the profile belongs to. */
  parentId?: string;
}

export interface JwtPayload {
  sub: string;
  typ: PrincipalKind | 'refresh';
  pid?: string;
}

export const AUTH_KINDS = 'auth:kinds';

/**
 * Restricts a route to the given principal kinds. With no argument, any valid
 * token is accepted and the service decides — used by /progress, which both a
 * parent and the child themselves may read.
 */
export const Auth = (...kinds: PrincipalKind[]) => SetMetadata(AUTH_KINDS, kinds);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest<{ principal: Principal }>();
    return req.principal;
  },
);
