BEGIN;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oidc_subject text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_oidc_subject_idx ON users (oidc_subject);
CREATE UNIQUE INDEX users_email_idx ON users (email);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workspaces_owner_user_id_idx ON workspaces (owner_user_id);

ALTER TABLE saved_discoveries
  ADD COLUMN workspace_id uuid REFERENCES workspaces(id) ON DELETE RESTRICT;
CREATE INDEX saved_discoveries_workspace_created_idx
  ON saved_discoveries (workspace_id, created_at);

ALTER TABLE activation_plans
  ADD COLUMN workspace_id uuid REFERENCES workspaces(id) ON DELETE RESTRICT;
CREATE INDEX activation_plans_workspace_created_idx
  ON activation_plans (workspace_id, created_at);

CREATE TABLE sessions (
  sid varchar PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX sessions_expire_idx ON sessions (expire);

COMMIT;
