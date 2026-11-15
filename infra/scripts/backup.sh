#!/bin/sh
set -eu
umask 077
temporary=$(mktemp /backups/.datascope-XXXXXX)
trap 'rm -f "$temporary"' EXIT HUP INT TERM
pg_dump --format=custom --no-owner --no-acl --file="$temporary"
pg_restore --list "$temporary" >/dev/null
target="/backups/datascope-$(date -u +%Y%m%dT%H%M%SZ)-${temporary##*-}.dump"
mv "$temporary" "$target"
sha256sum "$target" >"$target.sha256"
echo "Backup complete: ${target##*/}"
