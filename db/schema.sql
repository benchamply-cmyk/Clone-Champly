-- Schéma cible de la mémoire (PostgreSQL 16 + pgvector).
-- Reprend les structures de src/memory/store.ts ; à brancher via une classe PgMemoryStore.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE profile_facts (
  id uuid PRIMARY KEY,
  topic text NOT NULL,
  fact text NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  goal text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'idée',
  next_step text NOT NULL DEFAULT '',
  decisions text[] NOT NULL DEFAULT '{}',
  autonomy text NOT NULL DEFAULT 'proposer',
  monthly_budget_eur numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE episodes (
  id uuid PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  conversation_id text NOT NULL,
  role text NOT NULL,
  channel text NOT NULL,
  text text NOT NULL,
  embedding vector(1024) -- recherche sémantique dans le journal
);
CREATE INDEX episodes_conversation ON episodes (conversation_id, at);
CREATE INDEX episodes_embedding ON episodes USING hnsw (embedding vector_cosine_ops);

CREATE TABLE skills (
  id uuid PRIMARY KEY,
  title text NOT NULL UNIQUE,
  steps text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pending_actions (
  id uuid PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'en attente'
);
