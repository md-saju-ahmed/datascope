#!/bin/sh
set -eu
# Runs only during first initialization of this stack's new PostgreSQL volume.
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --command='CREATE EXTENSION IF NOT EXISTS pg_trgm;'
