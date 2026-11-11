# Security model

What the portal trusts, what it refuses, and what it does not protect.

## Boundary

1. The controller listens on `127.0.0.1:18801`, the dashboard on
   `127.0.0.1:18800`. Nothing binds `0.0.0.0`.
2. Every controller route but `/healthz` needs `Authorization: Bearer
   <token>`. The token is 32 random bytes, new on every controller start, in
   `.build/run/token/controller.token` (dir 0700, file 0600), removed on stop.
3. The controller refuses any request with an `Origin` header (a browser
   never calls it) and any `Host` other than its own three names (DNS
   rebinding).
4. `vlix-ui` mounts only the token directory, read-only. Its server adds the
   token; the browser never receives it (`scripts/boundary.sh` greps for it).
5. The dashboard answers only to its own `Host` names and forwards three
   calls: `GET labs`, `POST refresh`, `POST labs/<id>/up|down`. A POST needs
   the dashboard's own `Origin` and `application/json`.
6. A lab id is a key in the registry, never part of a path. Before each
   operation the lab is discovered again from its files.
7. The controller runs exactly `make -C <dir> up|down RUNTIME=podman`, with no
   shell, stdin closed, one at a time, 30 minutes at most. The child gets the
   user's environment minus `VLIX_*` and make's own flags.
8. Make output is redacted (Vault tokens, JWTs, private key blocks, licence
   and secret values, long hex and base64), kept in memory (200 lines), and
   never written to disk. The controller log holds events, not output.
9. Podman is only asked `ps`, filtered by each lab's anchored prefix, and the
   answer is bucketed again by `startsWith`.
10. Responses carry a CSP with a per-response nonce, `nosniff`,
    `no-referrer` and `frame-ancestors 'none'`.

## Limits (decisions, not to-dos)

- Any process running as this Mac user can read the token file and run a
  lab's `make up` or `make down`. That user can run `make` directly anyway.
- Any container on the Podman machine can reach the controller port; without
  the token it gets 401.
- Redaction is pattern-based. A secret in a shape it does not know reaches
  the browser of the person who started the lab, on loopback.
- The portal trusts each lab's Makefile; it runs what that file says `up`
  and `down` do.
- Both parts speak plain HTTP on 127.0.0.1, with no TLS and no HSTS: nothing
  leaves the machine, and browsers treat loopback as a secure context. The
  dashboard has no login: any browser tab on this Mac is you. What stops a
  web page from using it is the `Host` allowlist (DNS rebinding), the
  same-origin check on every POST, and the CSP.
