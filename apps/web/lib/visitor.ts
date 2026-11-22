import "server-only";
import type { SessionData } from "@auth0/nextjs-auth0/types";
import { auth0 } from "./auth0";
import { nameFor } from "./display-name";

/**
 * Who is visiting, worked out from the two sessions the SDK keeps. Pages and actions call getVisitor() instead of
 * the SDK, so the rules live in one place.
 */
export type Visitor =
  | { kind: "visitor" } // not logged in, and no guest cart yet
  | { kind: "guest"; anonymousId: string } // not logged in, with an anonymous session (a guest cart)
  | { kind: "person"; name: string; session: SessionData };

export function displayName(session: SessionData): string {
  const u = session.user;
  return nameFor(u);
}

export async function getVisitor(): Promise<Visitor> {
  const session = await auth0.getSession();
  if (session) return { kind: "person", name: displayName(session), session };
  const anon = await auth0.getAnonymousSession();
  return anon ? { kind: "guest", anonymousId: anon.id } : { kind: "visitor" };
}

/** Who the Bearer token belongs to: "session" (a logged-in person), "guest" (an anonymous session) or "anonymous" (no token). */
export type Caller = "session" | "guest" | "anonymous";

/** The Bearer token for the Carts API, for whoever is visiting. */
export async function getApiAccessToken(): Promise<{ token?: string; caller: Caller }> {
  // A logged-in person: the normal session, refreshed by the SDK as needed.
  const session = await auth0.getSession();
  if (session) {
    try {
      const { token } = await auth0.getAccessToken();
      return { token, caller: "session" };
    } catch (err) {
      console.warn("[auth] getAccessToken failed:", (err as Error).message);
      return { caller: "session" };
    }
  }

  // Not logged in: a guest token lives in the anonymous session cookie.
  const anon = await auth0.getAnonymousSession();
  if (anon?.accessToken) return { token: anon.accessToken, caller: "guest" };

  return { caller: "anonymous" };
}

/**
 * The guest token for a person who isn't logged in, creating an anonymous session when there is none. The token is
 * for the Carts API (anonymousSession.audience in lib/auth0.ts) with scope cart:write: enough for a cart, not orders.
 *
 * Server Actions only: createAnonymousSession() writes the cookie, which a Server Component can't.
 */
export async function ensureGuestToken(): Promise<string> {
  const anon = await auth0.getAnonymousSession();
  // getAnonymousSession() never renews an expired token (only the GET /auth/anonymous-session route does), so an
  // expired guest gets a new anonymous session, and the API can no longer reach the old guest cart (it is keyed by
  // the old token's sub).
  if (anon?.accessToken && anon.expiresAt > Math.floor(Date.now() / 1000) + 30) {
    return anon.accessToken;
  }
  const created = await auth0.createAnonymousSession();
  return created.accessToken;
}
