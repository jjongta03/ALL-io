-- Retire the old channel without treating its consent as email consent.
-- Delivered/local history and old account-link records remain for historical retention;
-- no running code reads or exposes the retired account-link tables.
UPDATE workspace_notifications SET status='CANCELLED'
WHERE channel='ALIMTALK' AND status IN ('PENDING','CLAIMED');
UPDATE owner_profiles SET
  profile=profile - 'alimtalkAlerts',
  onboarding=CASE WHEN jsonb_typeof(onboarding->'owner')='object'
    THEN jsonb_set(onboarding,'{owner}',(onboarding->'owner') - 'alimtalkAlerts')
    ELSE onboarding END;
