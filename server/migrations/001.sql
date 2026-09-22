CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, owner_id TEXT, title TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id), manifest JSONB NOT NULL, source TEXT NOT NULL, code TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS versions_game ON versions(game_id,created_at DESC);
CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, definition JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, challenge_id TEXT, status TEXT NOT NULL, record JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, match_id TEXT NOT NULL, version_id TEXT NOT NULL REFERENCES versions(id), guest_id TEXT, score DOUBLE PRECISION NOT NULL, partition_key TEXT NOT NULL, record JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS scores_partition ON results(partition_key,score DESC);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, status TEXT NOT NULL, record JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS round_attempts (match_id TEXT NOT NULL REFERENCES matches(id), round_index INTEGER NOT NULL, version_id TEXT NOT NULL REFERENCES versions(id), status TEXT NOT NULL, reason TEXT, prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, PRIMARY KEY(match_id,round_index));
CREATE INDEX IF NOT EXISTS attempts_version ON round_attempts(version_id,status);
CREATE TABLE IF NOT EXISTS replay_plays (match_id TEXT NOT NULL REFERENCES matches(id), guest_id TEXT NOT NULL REFERENCES guests(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(match_id,guest_id));
CREATE TABLE IF NOT EXISTS cartridge_ratings (
  game_id TEXT NOT NULL REFERENCES games(id), guest_id TEXT NOT NULL REFERENCES guests(id),
  version_id TEXT NOT NULL REFERENCES versions(id), stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(game_id,guest_id)
);
CREATE INDEX IF NOT EXISTS results_rating_eligibility ON results(guest_id,version_id);
