# Vendored SDK builds

The apps install these Auth0 SDK builds from this folder with `file:` dependencies, because their Poppy support is not in a published release. Each tarball has its own prerelease version, so it can never be mistaken for, or replaced by, a published release of the same number. The version ends in the short commit it was built from.

`apps/web` installs `@auth0/nextjs-auth0` from npm, pinned to the exact beta version that ships its Poppy support, so it has no tarball here. Each SDK below moves to npm the same way once its Poppy support is released.

| Tarball | Package and version | Source | Commit | Used by |
|---|---|---|---|---|
| `auth0-auth0-api-js-1.7.0-poppy.d3d9202.tgz` | `@auth0/auth0-api-js@1.7.0-poppy.d3d9202` | [auth0/auth0-auth-js#342](https://github.com/auth0/auth0-auth-js/pull/342), `packages/auth0-api-js` | `d3d92029b64039385abac27863d72a159694b02c` | `apps/carts-api` |
| `auth0-auth0-express-1.0.0-poppy.a83bb24.tgz` | `@auth0/auth0-express@1.0.0-poppy.a83bb24` | [auth0/auth0-express#75](https://github.com/auth0/auth0-express/pull/75), `packages/auth0-express` | `a83bb24afbf5991b6794ce8fd6029652a237d8da` | `apps/web-express` |
| `auth0-auth0-server-js-1.17.0-poppy.ad054e2.tgz` | `@auth0/auth0-server-js@1.17.0-poppy.ad054e2` | [auth0/auth0-auth-js#343](https://github.com/auth0/auth0-auth-js/pull/343), `packages/auth0-server-js` | `ad054e260e920d7352ca46e83bf88d63ed23193a` | `apps/web-express`, through `@auth0/auth0-express` |

`@auth0/auth0-server-js` is built from `ad054e2`, the same commit auth0-express#75 now pins. `apps/web-express/package.json` overrides the express package's `@auth0/auth0-server-js` dependency with this tarball.

## Rebuilding one

From a clone of the source repository at the commit above:

```sh
npm ci
npm run build --workspace <package dir>
cd <package dir>
npm pkg set version=<version>-poppy.<short commit>
npm pack --pack-destination <this folder>
```

For `@auth0/auth0-express`, also set `dependencies.@auth0/auth0-server-js` to the server-js tarball's exact version before packing (the PR pins a `file:` path that only works inside its own repository).

Then point the app's `file:` dependency at the new name and run `npm install` in that app, so its lockfile records the new integrity hash.
