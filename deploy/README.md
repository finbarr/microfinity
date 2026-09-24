# DigitalOcean deployment

Microfinity runs as a non-root systemd service behind Caddy, with PostgreSQL 16
on the same host. Caddy renews HTTPS certificates and proxies WebSockets. Only
web ports are public; the DigitalOcean firewall restricts SSH to the deployment
administrator's IP. PostgreSQL listens on loopback and the app uses peer
authentication through its Unix socket.

## Layout

| Path | Purpose |
| --- | --- |
| `/opt/microfinity/releases/<revision>` | Built releases; root-owned, read-only to the app |
| `/opt/microfinity/current` | Active release symlink |
| `/var/lib/microfinity/data/assets` | Immutable generated images, audio and runtimes |
| `/etc/microfinity/environment` | Service configuration, including database URL |
| `/etc/microfinity/providers` | Root-readable production API credentials |
| `/var/backups/microfinity` | Daily PostgreSQL dumps and asset archives |

`bootstrap.sh` is for a **fresh Ubuntu 24.04 host only**. It is not an update
script. Supply a registered administrator SSH key during Droplet creation and
attach the cloud firewall. Daily DigitalOcean backups retain seven days of
off-host disk images. The included backup timer writes a consistent database
dump before the configured DigitalOcean backup window.

## Prepare a release

Package a reviewed Git revision with `git archive`; never upload `.env`, local
runtime data, `node_modules`, credentials, or the whole working directory.
Extract it into a new release directory and run `npm ci`, `npm run check`, and
`npm run build` there under the application account. Keep development
dependencies: TypeScript and esbuild are required for runtime game generation.
Keep `sdk`, `runtime`, `games`, `scripts`, and `server/migrations` alongside the
build for compilation and startup. Change the completed release's owner to root.

The builder uses Blaxel exclusively. Prepare and push the allowlisted toolkit with
`scripts/prepare-blaxel-image.ts`, then pin the returned versioned image in
`BLAXEL_BUILDER_IMAGE`. Configure `BL_WORKSPACE`, `BLAXEL_REGION=us-was-1`,
`BUILDER_MODEL=gpt-6-sol`, `BUILDER_REASONING_EFFORT=medium`,
`BUILDER_WORKER=external`, and matching `BUILDER_CONCURRENCY` /
`BUILDER_WORKER_SLOTS` (start at 4). Remove retired `CODE_MODEL` and
`GENERATION_CODE_OUTPUT_TOKENS` settings. Keep the whole-turn deadline at 900000 ms.

Run `bl push` with the prepared directory as the working directory. The Blaxel
`--directory` flag does not restrict its source archive to that directory. The
checkout's `.blaxelignore` is an additional allowlist, not a replacement for
building from an isolated staging folder.

An explicitly approved, dedicated Blaxel service credential belongs in the
root-owned `0600` providers file as `BL_API_KEY`; never copy personal login state.
Credential creation and installation require separate authorization. The image
and sandboxes receive no provider credentials. Run the read-only
`scripts/check-builder-configuration.ts` with the service environment before
switching releases; it verifies configuration and workspace access without printing secrets.

Install `microfinity-builder.service` alongside the web unit. This process brokers
model calls and database work while cloud VMs perform compilation and rendering.
It shares the existing asset directory, so no remote storage migration is needed.
The worker unit caps its memory at 1 GiB and starts only after its configuration
check succeeds. Verify actual room load when raising concurrent turn admission.

Install the service units and `backup.sh` (as
`/usr/local/sbin/microfinity-backup`), then run `systemctl daemon-reload`.
Point `current` at the release and start `microfinity.service`. The initial
bootstrap Caddy configuration shows a temporary preparation message while the
app is verified privately.

## Production credentials and publication

Place the production `OPENAI_API_KEY` and `TYPESAFE_API_KEY` in the ignored local
`.env.production`. Copy only those credentials over the verified SSH connection
into `/etc/microfinity/providers`, owned by root with mode `0600`. Never source
the development `.env` or put credentials in command arguments or logs. The
systemd environment-file format accepts ordinary `NAME=value` entries.

Restart the service after installing credentials. Verify real generation and
Jev decisions before claiming those integrations work. Switch the Caddyfile to
the included reverse proxy configuration only when the launch candidate is
ready. Validate it with `caddy validate --config /etc/caddy/Caddyfile`, then
reload Caddy. Keep both apex and `www` DNS records pointed to the server.

Run `node /path/to/deploy/smoke.mjs` **from the release directory** to check
health, the library, static assets, database writes, and an authenticated
WebSocket lobby. Set `BASE_URL=https://microfinity.lol` to check the public
proxy. This creates one test guest and a temporary lobby; it makes no model
calls and does not record a scored match. Also verify a game in a browser and
the current party flow before publishing a new game release.

## Updates and recovery

Run `systemctl start microfinity-backup` before switching releases. Record the
current revision, database counts and asset hashes. Stop the builder and app,
atomically replace `current`, and start the app followed by the builder. Existing matches are interrupted by a
restart; completed results persist. Do not run a second app against the same
database because startup reconciles interrupted jobs and matches.

The project migration is additive and retains historical jobs, cartridges and
scores. Verify its result on a separate database first. For rollback to the old
release, stop the new builder before restoring the symlink; retain all new tables
and data. Do not restore an old database just to roll back code.

For a code rollback, restore the previous release symlink and restart after
checking database compatibility. A code rollback should not restore an older
database or discard new scores. For data recovery, restore the selected dump
with `pg_restore` into a fresh database and extract its accompanying assets;
verify counts before configuring the app to use it. Restore testing must use a
separate disposable database, never overwrite the live database.

Useful operational checks:

```sh
systemctl status microfinity caddy postgresql
journalctl -u microfinity --since '10 min ago'
systemctl show microfinity-backup.service -p Result -p ExecMainStatus
systemctl list-timers microfinity-backup.timer
curl --fail https://microfinity.lol/api/health
```

When the administrator's public IP changes, update only this application's
DigitalOcean firewall SSH source. Preserve the other projects' firewalls.
Application generation budgets are per job, not a global spend allowance;
account-level provider budgets and public admission limits need review before
opening unrestricted paid creation to anonymous traffic.
