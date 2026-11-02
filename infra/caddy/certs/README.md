Put a Cloudflare Origin Certificate here as `origin.pem` + `origin.key` (never commit them),
then set `CADDY_TLS=/etc/caddy/certs/origin.pem /etc/caddy/certs/origin.key` in `.env`.
See docs/deploy-gcp.md → Cloudflare.
