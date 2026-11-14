CREATE TABLE users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text,
 role text NOT NULL CHECK(role IN ('OWNER','ADMIN')), is_demo boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE businesses (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), facts jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX businesses_owner_idx ON businesses(owner_id);
CREATE TABLE change_plans (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id), owner_id uuid NOT NULL REFERENCES users(id),
 before_snapshot jsonb NOT NULL, proposed_change jsonb NOT NULL, input_revision integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','CANCELLED')),
 email_alerts boolean NOT NULL DEFAULT false, consent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plans_owner_idx ON change_plans(owner_id);
CREATE TABLE sources (
 id uuid PRIMARY KEY, url text NOT NULL UNIQUE, title text NOT NULL, collection_allowed boolean NOT NULL DEFAULT false,
 last_success_at timestamptz, last_error text
);
CREATE TABLE source_snapshots (
 id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES sources(id), content_hash text NOT NULL, normalized_text text NOT NULL,
 fetched_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id, content_hash)
);
CREATE TABLE source_changes (
 id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES sources(id),
 previous_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id), new_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id),
 status text NOT NULL DEFAULT 'PENDING', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id,new_snapshot_id)
);
CREATE TABLE policies (
 id uuid PRIMARY KEY, slug text NOT NULL UNIQUE, title text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('BENEFIT','CHANGE','TASK')), active_version_id uuid
);
CREATE TABLE policy_versions (
 id uuid PRIMARY KEY, policy_id uuid NOT NULL REFERENCES policies(id), version integer NOT NULL,
 status text NOT NULL CHECK(status IN ('APPROVED','PENDING_REVIEW','REJECTED','SUSPENDED')),
 definition jsonb NOT NULL, effective_from date NOT NULL, effective_to date,
 is_demo boolean NOT NULL DEFAULT false, verified_at timestamptz, reviewer_id uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(policy_id,version),
 CHECK(effective_to IS NULL OR effective_to >= effective_from)
);
ALTER TABLE policies ADD CONSTRAINT policies_active_version_fk FOREIGN KEY(active_version_id) REFERENCES policy_versions(id);
CREATE TABLE review_items (
 id uuid PRIMARY KEY, draft_version_id uuid NOT NULL UNIQUE REFERENCES policy_versions(id), base_version_id uuid REFERENCES policy_versions(id),
 priority integer NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3), reason text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 reviewer_id uuid REFERENCES users(id), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE evaluations (
 id uuid PRIMARY KEY, plan_id uuid NOT NULL REFERENCES change_plans(id), input_revision integer NOT NULL,
 input_snapshot jsonb NOT NULL, input_hash text NOT NULL, ruleset_hash text NOT NULL, meaningful_hash text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evaluations_plan_idx ON evaluations(plan_id,created_at DESC);
CREATE TABLE plan_tasks (
 id uuid PRIMARY KEY, plan_id uuid NOT NULL REFERENCES change_plans(id), stable_key text NOT NULL,
 policy_version_id uuid NOT NULL REFERENCES policy_versions(id), title text NOT NULL, guide jsonb NOT NULL,
 status text NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','DONE','NEEDS_REVIEW','RETIRED')),
 deadline_kind text NOT NULL CHECK(deadline_kind IN ('PREPARATION','NEEDS_CONFIRMATION')),
 deadline_date date, deadline_version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(plan_id,stable_key)
);
CREATE TABLE notification_jobs (
 id uuid PRIMARY KEY, plan_id uuid NOT NULL REFERENCES change_plans(id), task_id uuid REFERENCES plan_tasks(id),
 evaluation_id uuid REFERENCES evaluations(id), type text NOT NULL, dedupe_key text NOT NULL UNIQUE,
 deadline_version integer, scheduled_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CLAIMED','LOCAL_ONLY','ACCEPTED_BY_PROVIDER','FAILED','UNKNOWN','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0, claimed_at timestamptz, payload jsonb NOT NULL, provider_ref text, last_error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_due_idx ON notification_jobs(status,scheduled_at);
CREATE TABLE outbox (
 id uuid PRIMARY KEY, notification_id uuid NOT NULL UNIQUE REFERENCES notification_jobs(id), recipient text NOT NULL,
 subject text NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE feedback (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), evaluation_id uuid REFERENCES evaluations(id),
 message text NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE job_runs (
 id uuid PRIMARY KEY, type text NOT NULL, run_key text NOT NULL UNIQUE, status text NOT NULL,
 summary jsonb, last_error text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id), action text NOT NULL, entity_id uuid,
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
