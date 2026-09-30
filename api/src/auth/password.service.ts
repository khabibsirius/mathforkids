import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from the Node standard library.
 *
 * Why not argon2 or bcrypt: both are native modules. On a reviewer's machine
 * without build tools, `npm ci` fails at node-gyp and the whole project looks
 * broken for a reason that has nothing to do with the project. scrypt is a
 * memory-hard KDF in the standard library — no third-party crypto dependency,
 * no compile step, and defensible on its own merits. argon2id is the upgrade
 * path if this ever leaves a demo; the interface below does not change, and
 * the stored prefix makes the migration a rehash-on-next-login.
 */
@Injectable()
export class PasswordService {
  /** 2^14 blocks ~= 16 MB per hash, roughly 50 ms on modern hardware. */
  private readonly N = 16384;
  private readonly r = 8;
  private readonly p = 1;
  private readonly keylen = 64;
  private readonly maxmem = 64 * 1024 * 1024;

  async hash(plain: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scryptAsync(plain, salt, this.keylen, {
      N: this.N,
      r: this.r,
      p: this.p,
      maxmem: this.maxmem,
    });
    return [
      'scrypt',
      this.N,
      this.r,
      this.p,
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join('$');
  }

  async verify(plain: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
    const N = Number.parseInt(nRaw, 10);
    const r = Number.parseInt(rRaw, 10);
    const p = Number.parseInt(pRaw, 10);
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

    let expected: Buffer;
    let actual: Buffer;
    try {
      expected = Buffer.from(hashRaw, 'base64url');
      actual = await scryptAsync(plain, Buffer.from(saltRaw, 'base64url'), expected.length, {
        N,
        r,
        p,
        maxmem: this.maxmem,
      });
    } catch {
      return false;
    }

    // Constant time — a length check first, because timingSafeEqual throws on
    // mismatched lengths and that throw would itself be a timing signal.
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }
}
