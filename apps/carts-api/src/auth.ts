import { getToken, toHttpErrorResponse } from '@auth0/auth0-api-js';
import type { RequestHandler } from 'express';
import { apiClient } from './auth0.js';

// Verifies the request's access token and puts its claims in `res.locals.claims`. A person's own token and the
// anonymous token of their guest session (a guest cart) both pass; routes that need an account check for one.
export const authenticate: RequestHandler = async (req, res, next) => {
  if (req.headers.authorization === undefined) {
    // No credentials: 401 with a challenge and no `error`, so the client knows to sign in (RFC 6750 section 3).
    res.status(401).set('WWW-Authenticate', 'Bearer realm="api"').json({ error: 'unauthorized', error_description: 'Send an access token.' });
    return;
  }
  try {
    res.locals.claims = await apiClient.verifyAccessToken({ accessToken: getToken(req.headers) });
    next();
  } catch (error) {
    // An SDK error becomes its status, `WWW-Authenticate` challenge and body: 401 invalid_token for a bad or expired
    // token, 400 for a malformed Authorization header.
    const failure = toHttpErrorResponse(error);
    if (!failure) return next(error);
    res.status(failure.status).set(failure.headers);
    if (failure.body) res.json(failure.body);
    else res.end();
  }
};
