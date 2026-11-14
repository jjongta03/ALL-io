CREATE TABLE login_attempts (
 bucket text PRIMARY KEY,
 started_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 1 CHECK(attempts > 0)
);
CREATE INDEX login_attempts_started ON login_attempts(started_at);
