-- Published blueprints.
--
-- The blueprint JSON and its preview live in R2; this table is the index over
-- them. Every row owns exactly two object keys, derived from the id, so there
-- is no second source of truth about where an object lives.

CREATE TABLE IF NOT EXISTS blueprints (
  id            TEXT    PRIMARY KEY,
  created_at    INTEGER NOT NULL,

  -- Copied out of the blueprint JSON at publish time and sanitized there, so a
  -- gallery card never has to parse a megabyte of document to render.
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  author_name   TEXT    NOT NULL DEFAULT '',
  game_version  TEXT,

  visibility    TEXT    NOT NULL DEFAULT 'UNLISTED'
                        CHECK (visibility IN ('UNLISTED', 'PENDING', 'LISTED')),

  -- 0 until both R2 objects are written. A publish claims its id first and only
  -- then uploads, so a crash mid-upload leaves an invisible row rather than an
  -- orphaned object nothing points at. Nothing but the publish path ever reads
  -- a row with ready = 0.
  ready         INTEGER NOT NULL DEFAULT 0,

  json_key      TEXT    NOT NULL,
  image_key     TEXT,
  image_width   INTEGER,
  image_height  INTEGER,

  size_bytes    INTEGER NOT NULL DEFAULT 0,
  node_count    INTEGER NOT NULL DEFAULT 0,
  edge_count    INTEGER NOT NULL DEFAULT 0,

  -- Set when the publisher started from another published blueprint. Not a
  -- foreign key: the original may be deleted, and that must not cascade into
  -- deleting the derivative.
  derived_from  TEXT,

  -- SHA-256 of the management token handed to the publisher once, at publish
  -- time. The token itself is never stored, so a dump of this table does not
  -- let anyone delete anything.
  token_hash    TEXT    NOT NULL,

  -- SHA-256 of (client IP + IP_PEPPER). Enough to rate-limit and to find every
  -- upload from one abuser; not enough to recover the address.
  ip_hash       TEXT
);

-- The gallery's only query: newest-first within a visibility, with id breaking
-- ties between blueprints published in the same millisecond. Column order and
-- direction match the keyset cursor exactly.
CREATE INDEX IF NOT EXISTS idx_blueprints_gallery
  ON blueprints (visibility, created_at DESC, id DESC)
  WHERE ready = 1;

-- Used by the abuse workflow: given one bad upload, find the rest.
CREATE INDEX IF NOT EXISTS idx_blueprints_ip
  ON blueprints (ip_hash, created_at DESC);
