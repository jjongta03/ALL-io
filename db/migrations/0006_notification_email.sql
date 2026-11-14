ALTER TABLE email_contacts ADD COLUMN email text;
UPDATE email_contacts c SET email=u.email FROM users u WHERE u.id=c.owner_id;
ALTER TABLE email_contacts ALTER COLUMN email SET NOT NULL;
ALTER TABLE email_sync_jobs ADD COLUMN email text;
ALTER TABLE email_sync_jobs ADD COLUMN retired boolean NOT NULL DEFAULT false;
UPDATE email_sync_jobs j SET email=u.email FROM users u WHERE u.id=j.owner_id;
ALTER TABLE email_sync_jobs ALTER COLUMN email SET NOT NULL;
ALTER TABLE email_sync_jobs DROP CONSTRAINT email_sync_jobs_owner_id_revision_key;
ALTER TABLE email_sync_jobs ADD UNIQUE(owner_id,revision,email);
