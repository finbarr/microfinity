#!/usr/bin/env bash
# Run once as root on a fresh Ubuntu 24.04 DigitalOcean Droplet.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg xz-utils git postgresql ufw unattended-upgrades

# Keep Node aligned with the tested development workers; verify vendor checksum.
node_version=22.22.2
node_archive="node-v${node_version}-linux-x64.tar.xz"
node_tmp=$(mktemp -d)
cd "$node_tmp"
curl -fsSLO "https://nodejs.org/dist/v${node_version}/${node_archive}"
curl -fsSLO "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt"
awk -v name="$node_archive" '$2 == name' SHASUMS256.txt | sha256sum -c -
tar -xJf "$node_archive" -C /usr/local --strip-components=1
cd /
rm -rf "$node_tmp"

curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
chmod 644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

useradd --system --create-home --home-dir /var/lib/microfinity --shell /usr/sbin/nologin microfinity
install -d -m 755 /opt/microfinity/releases
install -d -o microfinity -g microfinity -m 750 /var/lib/microfinity/data
install -d -m 700 /etc/microfinity /var/backups/microfinity
runuser -u postgres -- createuser microfinity
runuser -u postgres -- createdb --owner=microfinity microfinity
cat > /etc/microfinity/environment <<'ENV'
NODE_ENV=production
PORT=3000
DATA_DIR=/var/lib/microfinity/data
DATABASE_URL=postgresql:///microfinity?host=/var/run/postgresql&user=microfinity
ENV
chmod 600 /etc/microfinity/environment
install -m 600 /dev/null /etc/microfinity/providers

cat > /etc/ssh/sshd_config.d/00-microfinity.conf <<'SSH'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSH
sshd -t
systemctl reload ssh
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

cat > /etc/caddy/Caddyfile <<'CADDY'
microfinity.lol {
    header Retry-After 120
    respond "Microfinity is getting ready. Check back shortly." 503
}
www.microfinity.lol {
    redir https://microfinity.lol{uri} permanent
}
CADDY
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
touch /var/lib/microfinity/bootstrap-complete
