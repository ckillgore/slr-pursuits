-- Entity Comments with @Mentions
-- Supports: pursuits, land comps (extensible to other entities)

CREATE TABLE entity_comments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type text NOT NULL CHECK (entity_type IN ('pursuit', 'land_comp')),
  entity_id   uuid NOT NULL,
  author_id   uuid NOT NULL REFERENCES auth.users(id),
  content     text NOT NULL,
  mentions    uuid[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_entity_comments_entity ON entity_comments(entity_type, entity_id);
CREATE INDEX idx_entity_comments_mentions ON entity_comments USING GIN(mentions);
CREATE INDEX idx_entity_comments_author ON entity_comments(author_id);

ALTER TABLE entity_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON entity_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
