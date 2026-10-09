-- Reserved for consent-scoped document search after the embedding pipeline is evaluated.
-- Structured labs and dates must always come from health_resources, not this index.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS health_document_embeddings (
  id uuid PRIMARY KEY,
  owner uuid NOT NULL,
  document_id uuid NOT NULL,
  page integer NOT NULL CHECK (page > 0),
  embedding vector(768) NOT NULL,
  encrypted_chunk bytea NOT NULL,
  provider_model text NOT NULL
);
CREATE INDEX IF NOT EXISTS health_embeddings_owner ON health_document_embeddings(owner);
ALTER TABLE health_document_embeddings ENABLE ROW LEVEL SECURITY;
-- No policy is granted yet: the prototype does not populate or serve this index.
