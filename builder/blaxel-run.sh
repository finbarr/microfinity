#!/bin/sh
set -eu

# The management API stays outside this namespace. The agent has loopback and
# its bounded Unix model socket, but cannot reach that API or external networks.
exec setpriv --reuid=10001 --regid=10001 --clear-groups --no-new-privs \
  bwrap --unshare-all --die-with-parent --new-session \
  --ro-bind / / --proc /proc --dev /dev \
  --tmpfs /tmp --tmpfs /run --tmpfs /bl --tmpfs /root --tmpfs /control \
  --bind /work /work --bind /scratch /scratch \
  --cap-drop ALL --clearenv \
  --setenv PATH /usr/local/bin:/usr/bin:/bin \
  --setenv HOME /scratch/home --setenv CODEX_HOME /scratch/codex \
  --setenv TMPDIR /scratch --setenv BUILDER_MODEL "${BUILDER_MODEL:-gpt-6-sol}" \
  --setenv BUILDER_REASONING_EFFORT "${BUILDER_REASONING_EFFORT:-medium}" \
  --chdir /kit "$@"
