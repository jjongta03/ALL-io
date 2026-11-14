CREATE TABLE review_assessments (
 id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES review_items(id),
 actor_id uuid NOT NULL REFERENCES users(id), input_hash text NOT NULL,
 assessment jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_assessments_latest_idx ON review_assessments(review_id,created_at DESC);
CREATE TABLE integration_events (
 id uuid PRIMARY KEY, provider text NOT NULL, operation text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('LIVE','LOCAL')),
 status text NOT NULL CHECK(status IN ('SUCCESS','FAILED','DISABLED')),
 error_code text, created_at timestamptz NOT NULL DEFAULT now()
);
-- Preserve completed deliveries. Replace only future, unsent D-1 reminders.
INSERT INTO notification_jobs(id,plan_id,task_id,type,dedupe_key,deadline_version,scheduled_at,payload)
SELECT gen_random_uuid(),plan_id,task_id,'D-3',regexp_replace(dedupe_key,':D-1$',':D-3'),deadline_version,scheduled_at-interval '2 days',payload
FROM notification_jobs WHERE type='D-1' AND status='PENDING' AND scheduled_at-interval '2 days'>now()
ON CONFLICT(dedupe_key) DO NOTHING;
UPDATE notification_jobs SET status='CANCELLED' WHERE type='D-1' AND status='PENDING';
