import type { VerifiedAccessTokenClaims } from '@auth0/auth0-api-js';

// Scopes named in 401 challenges, so the client knows what to ask for when it signs the customer in.
export const SCOPES = {
  ordersRead: 'orders:read',
  ordersWrite: 'orders:write',
} as const;

// Auth0 marks an anonymous user's token with this `sub_profile`, and gives it a `sub` that starts with `anon`.
const ANONYMOUS_SUBJECT_PROFILE = 'urn:auth0:anonymous_user';
const ANONYMOUS_SUBJECT = /^anon[\w-]*@/;

/** An anonymous `sub` is a hash for a guest session, never a customer account. */
export function isAnonymousSubject(sub: unknown): boolean {
  return typeof sub === 'string' && ANONYMOUS_SUBJECT.test(sub);
}

/** A guest (anonymous user) has a verified token, but its `sub` is not an account. */
export function isGuestToken(claims: VerifiedAccessTokenClaims): boolean {
  const profile = claims.sub_profile;
  if (typeof profile === 'string' && profile.split(/\s+/).includes(ANONYMOUS_SUBJECT_PROFILE)) {
    return true;
  }
  return isAnonymousSubject(claims.sub);
}

/** The account (`claims.sub`) only when it really is one: never for a guest token. */
export function accountOf(claims: VerifiedAccessTokenClaims | undefined): string | null {
  return claims && typeof claims.sub === 'string' && !isGuestToken(claims) ? claims.sub : null;
}
