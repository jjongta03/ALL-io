-- v2 current-business workspace. Legacy hiring plans remain unchanged.
CREATE TABLE owner_profiles (
 owner_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 profile jsonb NOT NULL DEFAULT '{}', onboarding jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE businesses ADD COLUMN revision integer NOT NULL DEFAULT 1;
CREATE TABLE contract_scans (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 media_type text NOT NULL CHECK(media_type IN ('application/pdf','image/png','image/jpeg')),
 document bytea NOT NULL, draft jsonb NOT NULL, provider text NOT NULL,
 status text NOT NULL CHECK(status IN ('NEEDS_REVIEW','CONFIRMED','MANUAL_REQUIRED')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scans_business_idx ON contract_scans(business_id);
CREATE TABLE employees (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 scan_id uuid UNIQUE REFERENCES contract_scans(id) ON DELETE SET NULL,
 details jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employees_business_idx ON employees(business_id,created_at,id);
CREATE TABLE workspace_evaluations (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
 revision integer NOT NULL, input_snapshot jsonb NOT NULL, rules_snapshot jsonb NOT NULL,
 input_hash text NOT NULL, ruleset_hash text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_evaluation_idx ON workspace_evaluations(business_id,created_at,id);
-- Evaluation input contains only normalized business/rule facts, never contract files or employee names.
CREATE FUNCTION reject_workspace_evaluation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Evaluation snapshots are immutable'; END $$;
CREATE TRIGGER workspace_evaluation_immutable BEFORE UPDATE OR DELETE ON workspace_evaluations
FOR EACH ROW EXECUTE FUNCTION reject_workspace_evaluation_mutation();
CREATE TABLE benefit_projects (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
 policy_id uuid NOT NULL REFERENCES policies(id), policy_version_id uuid NOT NULL REFERENCES policy_versions(id),
 evaluation_id uuid NOT NULL REFERENCES workspace_evaluations(id),
 cycle_key text NOT NULL, title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_id,policy_id,cycle_key)
);
CREATE TABLE project_steps (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES benefit_projects(id) ON DELETE CASCADE,
 position integer NOT NULL, title text NOT NULL, guide jsonb NOT NULL,
 done boolean NOT NULL DEFAULT false, deadline date, deadline_revision integer NOT NULL DEFAULT 1,
 UNIQUE(project_id,position)
);
CREATE TABLE recurring_documents (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
 title text NOT NULL, anchor_date date NOT NULL, frequency text NOT NULL CHECK(frequency IN ('WEEKLY','MONTHLY','YEARLY')),
 lead_days integer NOT NULL CHECK(lead_days BETWEEN 0 AND 30), url text, memo text,
 enabled boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document_occurrences (
 id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES recurring_documents(id) ON DELETE CASCADE,
 due_date date NOT NULL, done boolean NOT NULL DEFAULT false, UNIQUE(document_id,due_date)
);
CREATE TABLE workspace_notifications (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
 kind text NOT NULL CHECK(kind IN ('NEW_BENEFIT','PROJECT_DEADLINE','DOCUMENT_DEADLINE')),
 channel text NOT NULL CHECK(channel IN ('EMAIL','ALIMTALK')), dedupe_key text NOT NULL UNIQUE,
 project_step_id uuid REFERENCES project_steps(id) ON DELETE CASCADE,
 occurrence_id uuid REFERENCES document_occurrences(id) ON DELETE CASCADE,
 policy_version_id uuid REFERENCES policy_versions(id), resource_revision integer,
 scheduled_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'PENDING'
 CHECK(status IN ('PENDING','CLAIMED','LOCAL_ONLY','ACCEPTED_BY_PROVIDER','FAILED','UNKNOWN','CANCELLED')),
 payload jsonb NOT NULL, claimed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_notifications_due_idx ON workspace_notifications(status,scheduled_at);
CREATE TABLE workspace_outbox (
 notification_id uuid PRIMARY KEY REFERENCES workspace_notifications(id) ON DELETE CASCADE,
 channel text NOT NULL, title text NOT NULL, path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE channel_account_links (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), business_id uuid NOT NULL REFERENCES businesses(id),
 channel_id text NOT NULL, channel_user_id text NOT NULL,
 UNIQUE(channel_id,channel_user_id,business_id)
);
CREATE TABLE channel_link_tokens (
 token_hash text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), business_id uuid NOT NULL REFERENCES businesses(id),
 expires_at timestamptz NOT NULL
);
