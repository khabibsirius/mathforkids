import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppError } from '../common/errors';
import { AUTH_KINDS, JwtPayload, Principal, PrincipalKind } from './principal';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { principal?: Principal }>();

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('TOKEN_INVALID', 'Missing bearer token');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7).trim());
    } catch (err) {
      const name = (err as Error).name;
      throw name === 'TokenExpiredError'
        ? new AppError('TOKEN_EXPIRED', 'Token has expired')
        : new AppError('TOKEN_INVALID', `Token rejected (${name})`);
    }

    // A refresh token is only ever accepted by POST /auth/refresh, which reads
    // it from the body. Presenting one as a bearer token must not authorise
    // anything.
    if (payload.typ !== 'parent' && payload.typ !== 'child') {
      throw new AppError('TOKEN_INVALID', `Token type "${payload.typ}" cannot authorise a request`);
    }

    req.principal = {
      kind: payload.typ,
      id: payload.sub,
      ...(payload.pid ? { parentId: payload.pid } : {}),
    };

    const allowed = this.reflector.getAllAndOverride<PrincipalKind[] | undefined>(AUTH_KINDS, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (allowed && allowed.length > 0 && !allowed.includes(req.principal.kind)) {
      throw new AppError(
        'FORBIDDEN_CHILD',
        `This route needs a ${allowed.join(' or ')} token, got ${req.principal.kind}`,
      );
    }

    return true;
  }
}
