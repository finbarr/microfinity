#!/usr/bin/env bash
# Root-only, consistent PostgreSQL dump plus immutable assets. DigitalOcean
# backups retain this directory off-host. Never copy a live PGlite directory.
set -euo pipefail
umask 077
backup_root=/var/backups/microfinity
stamp=$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup_root"
runuser -u postgres -- pg_dump --format=custom microfinity > "$backup_root/$stamp.dump.tmp"
mv "$backup_root/$stamp.dump.tmp" "$backup_root/$stamp.dump"
tar -czf "$backup_root/$stamp.assets.tar.gz.tmp" -C /var/lib/microfinity/data assets
mv "$backup_root/$stamp.assets.tar.gz.tmp" "$backup_root/$stamp.assets.tar.gz"
readlink -f /opt/microfinity/current > "$backup_root/$stamp.release.txt"
find "$backup_root" -type f -mtime +7 -delete
