import { Auth0Client } from "@auth0/nextjs-auth0/server";

/** The anonymous session cookie (the SDK's default name, set explicitly so proxy.ts can test for it cheaply). */
export const ANONYMOUS_SESSION_COOKIE = "auth0_anon";

export const auth0 = new Auth0Client({
  authorizationParameters: {
    // The Carts API's identifier, so getAccessToken() returns a token for it.
    audience: process.env.AUTH0_AUDIENCE,
    // The Carts API scopes, so the token of an agent joined to this browser carries what the customer approved
    // for it (Auth0 caps it at that); the API checks them for agents. People are not scope-checked.
    scope: "openid profile email offline_access cart:write orders:read orders:write"
  },
  // Guest carts for people: a visitor who adds to the cart gets an anonymous session, whose token the Carts API
  // accepts for the cart (not for orders). Needs a client grant from this app to the Carts API audience with
  // subject_type "anonymous_user" and scope cart:write (`npm run tenant` creates it).
  anonymousSession: {
    enabled: true,
    audience: process.env.AUTH0_AUDIENCE,
    scope: "cart:write",
    cookie: { name: ANONYMOUS_SESSION_COOKIE },
    // The SDK deletes the guest cookie on login by default, which would lose the guest cart, so keep it and let
    // proxy.ts merge the cart into the account and then end the anonymous session.
    clearAnonymousSessionOnLogin: false
  }
});
