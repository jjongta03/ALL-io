ALTER TABLE owner_profiles ADD COLUMN email_sync_revision integer NOT NULL DEFAULT 0;
CREATE TABLE email_contacts (
 owner_id uuid PRIMARY KEY REFERENCES users(id), revision integer NOT NULL,
 desired boolean NOT NULL, remote_status text, sync_status text NOT NULL DEFAULT 'PENDING',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE email_sync_jobs (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), revision integer NOT NULL,
 desired boolean NOT NULL, status text NOT NULL DEFAULT 'PENDING', claimed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,revision)
);
CREATE INDEX email_sync_jobs_pending ON email_sync_jobs(status,created_at);
CREATE UNIQUE INDEX email_sync_one_claim ON email_sync_jobs(owner_id) WHERE status='CLAIMED';
INSERT INTO email_contacts(owner_id,revision,desired)
SELECT owner_id,1,COALESCE((profile->>'emailAlerts')::boolean,false) FROM owner_profiles;
UPDATE owner_profiles SET email_sync_revision=1;
INSERT INTO email_sync_jobs(id,owner_id,revision,desired)
SELECT gen_random_uuid(),owner_id,revision,desired FROM email_contacts;
CREATE TABLE policy_watch_queries (
 id uuid PRIMARY KEY, query text NOT NULL UNIQUE, enabled boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), checked_at timestamptz
);
ALTER TABLE sources ADD COLUMN watch_attempted_at timestamptz;
CREATE TABLE policy_discoveries (
 id uuid PRIMARY KEY, url text NOT NULL UNIQUE, title text NOT NULL, snippet text,
 status text NOT NULL DEFAULT 'NEW', source_id uuid REFERENCES sources(id),
 discovered_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE watched_source_heads (
 source_id uuid PRIMARY KEY REFERENCES sources(id), snapshot_id uuid NOT NULL REFERENCES source_snapshots(id),
 revision integer NOT NULL DEFAULT 1
);
CREATE TABLE watched_source_events (
 id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES sources(id), revision integer NOT NULL,
 previous_snapshot_id uuid REFERENCES source_snapshots(id), snapshot_id uuid NOT NULL REFERENCES source_snapshots(id),
 review_id uuid REFERENCES review_items(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id,revision)
);
ALTER TABLE workspace_notifications DROP CONSTRAINT workspace_notifications_kind_check;
ALTER TABLE workspace_notifications ADD CONSTRAINT workspace_notifications_kind_check
CHECK(kind IN ('NEW_BENEFIT','PROJECT_DEADLINE','DOCUMENT_DEADLINE','WEEKLY_DIGEST'));
