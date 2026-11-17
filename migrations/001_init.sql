-- 001 · Bảng người chơi, thiết bị, lượt chơi (docs/04 · mục 14)

CREATE TABLE players (
  id            bigserial PRIMARY KEY,
  full_name     text        NOT NULL,
  email         text        NOT NULL,
  phone         text        NOT NULL,
  search_text   text        NOT NULL,
  consented_at  timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT players_email_key UNIQUE (email),
  CONSTRAINT players_email_lower CHECK (email = lower(email)),
  CONSTRAINT players_phone_format CHECK (phone ~ '^0[35789][0-9]{8}$')
);
CREATE INDEX players_created_at_idx ON players (created_at);

CREATE TABLE player_devices (
  token_hash    bytea       PRIMARY KEY,
  player_id     bigint      NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX player_devices_player_id_idx ON player_devices (player_id);

CREATE TABLE rounds (
  id           bigserial   PRIMARY KEY,
  player_id    bigint      NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  round_id     uuid        NOT NULL,
  score        integer     NOT NULL CHECK (score >= 0),
  hits         integer     NOT NULL CHECK (hits >= 0),
  bombs_hit    integer     NOT NULL CHECK (bombs_hit >= 0),
  missed       integer     NOT NULL CHECK (missed >= 0),
  ended_at     timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rounds_player_round_key UNIQUE (player_id, round_id)
);
CREATE INDEX rounds_player_id_idx ON rounds (player_id);
