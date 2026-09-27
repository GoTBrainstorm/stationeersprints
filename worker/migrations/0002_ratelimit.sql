-- Publish rate limiting.
--
-- Separate from `blueprints` because a quota must survive deletion: counting
-- rows in `blueprints` would let an abuser publish, delete, and publish again
-- indefinitely. These events are append-only and swept by age.

CREATE TABLE IF NOT EXISTS publish_events (
  ip_hash    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_publish_events
  ON publish_events (ip_hash, created_at DESC);
