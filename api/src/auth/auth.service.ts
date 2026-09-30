import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppError } from '../common/errors';
import { AppConfig, CONFIG } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ChildTokenResponse, TokenPairResponse } from './auth.dto';
import { PasswordService } from './password.service';
import { JwtPayload } from './principal';

/** Rough seconds-from-now for a jwt ttl string, for the expiresIn field. */
function ttlSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 900;
  const n = Number.parseInt(m[1], 10);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly passwords: PasswordService,
  ) {}

  async register(email: string, password: string): Promise<TokenPairResponse> {
    const normalised = email.trim().toLowerCase();

    const existing = await this.prisma.parent.findUnique({ where: { email: normalised } });
    if (existing) throw new AppError('EMAIL_TAKEN', `An account already exists for ${normalised}`);

    const parent = await this.prisma.parent.create({
      data: { email: normalised, passwordHash: await this.passwords.hash(password) },
    });

    this.logger.log(`registered parent ${parent.id}`);
    return this.issuePair(parent.id, parent.email);
  }

  async login(email: string, password: string): Promise<TokenPairResponse> {
    const normalised = email.trim().toLowerCase();
    const parent = await this.prisma.parent.findUnique({ where: { email: normalised } });

    // Same error and roughly the same work whether or not the account exists,
    // so this endpoint cannot be used to enumerate registered emails.
    if (!parent) {
      await this.passwords.hash(password);
      throw new AppError('INVALID_CREDENTIALS', 'No account for that email');
    }
    if (!(await this.passwords.verify(password, parent.passwordHash))) {
      throw new AppError('INVALID_CREDENTIALS', 'Password did not match');
    }

    return this.issuePair(parent.id, parent.email);
  }

  async refresh(refreshToken: string): Promise<TokenPairResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken);
    } catch (err) {
      const name = (err as Error).name;
      throw name === 'TokenExpiredError'
        ? new AppError('TOKEN_EXPIRED', 'Refresh token has expired')
        : new AppError('TOKEN_INVALID', `Refresh token rejected (${name})`);
    }

    if (payload.typ !== 'refresh') {
      throw new AppError('TOKEN_INVALID', `Expected a refresh token, got "${payload.typ}"`);
    }

    const parent = await this.prisma.parent.findUnique({ where: { id: payload.sub } });
    if (!parent) throw new AppError('TOKEN_INVALID', 'Account no longer exists');

    return this.issuePair(parent.id, parent.email);
  }

  /**
   * Mints a child-scoped token. This is the whole of "child login": the parent
   * is already authenticated and taps a picture.
   */
  async childToken(parentId: string, childId: string): Promise<ChildTokenResponse> {
    const child = await this.prisma.child.findUnique({ where: { id: childId } });
    if (!child) throw new AppError('CHILD_NOT_FOUND', `No child ${childId}`);

    // The check that makes this not an IDOR.
    if (child.parentId !== parentId) {
      throw new AppError('FORBIDDEN_CHILD', `Child ${childId} does not belong to parent ${parentId}`);
    }

    // expiresIn is passed as seconds. jsonwebtoken's string form is typed as a
    // narrow `ms` template literal that a plain config string does not satisfy,
    // and a number is both type-safe and unambiguous.
    const childToken = await this.jwt.signAsync(
      { sub: child.id, typ: 'child', pid: parentId } satisfies JwtPayload,
      { expiresIn: ttlSeconds(this.config.childTtl) },
    );

    return {
      childToken,
      expiresIn: ttlSeconds(this.config.childTtl),
      child: { id: child.id, name: child.name, age: child.age, avatar: child.avatar },
    };
  }

  private async issuePair(parentId: string, email: string): Promise<TokenPairResponse> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ sub: parentId, typ: 'parent' } satisfies JwtPayload, {
        expiresIn: ttlSeconds(this.config.accessTtl),
      }),
      this.jwt.signAsync({ sub: parentId, typ: 'refresh' } satisfies JwtPayload, {
        expiresIn: ttlSeconds(this.config.refreshTtl),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: ttlSeconds(this.config.accessTtl),
      parent: { id: parentId, email },
    };
  }
}
