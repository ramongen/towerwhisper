import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TokenClaims {
  /** User id. */
  sub: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

const b64 = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/**
 * A signed bearer token: base64url(claims).base64url(HMAC-SHA256). Like a JWT without the
 * header; only the user id travels, role and sector are read from the database on each use.
 */
export function signToken(claims: TokenClaims, secret: string): string {
  const body = b64(JSON.stringify(claims));
  return `${body}.${b64(createHmac('sha256', secret).update(body).digest())}`;
}

export function verifyToken(token: string, secret: string): TokenClaims | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenClaims;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
    return claims.exp * 1000 > Date.now() ? claims : null;
  } catch {
    return null;
  }
}
