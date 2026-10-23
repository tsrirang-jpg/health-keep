CREATE TABLE app_users (
    id uuid PRIMARY KEY,
    email varchar(254) NOT NULL UNIQUE,
    display_name varchar(100) NOT NULL,
    password_hash varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    refresh_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE TABLE patients (
    id uuid PRIMARY KEY,
    display_name varchar(100) NOT NULL,
    birth_date date,
    blood_group varchar(7) NOT NULL DEFAULT 'UNKNOWN'
        CHECK (blood_group IN ('UNKNOWN','A+','A-','B+','B-','AB+','AB-','O+','O-')),
    version bigint NOT NULL DEFAULT 1,
    change_seq bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE patient_access (
    patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    role varchar(10) NOT NULL CHECK (role IN ('OWNER','EDITOR','VIEWER')),
    PRIMARY KEY (patient_id,user_id)
);
CREATE UNIQUE INDEX one_owner_per_patient ON patient_access(patient_id) WHERE role = 'OWNER';
CREATE INDEX patient_access_user_idx ON patient_access(user_id);
CREATE TABLE health_records (
    id uuid PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    kind varchar(20) NOT NULL CHECK (kind IN ('CONDITION','ALLERGY','MEDICATION','VISIT','APPOINTMENT','COVERAGE','NOTE')),
    title varchar(200) NOT NULL,
    details varchar(4000) NOT NULL DEFAULT '',
    provider varchar(200) NOT NULL DEFAULT '',
    occurred_at timestamptz,
    version bigint NOT NULL DEFAULT 1,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (kind <> 'APPOINTMENT' OR occurred_at IS NOT NULL)
);
CREATE INDEX health_records_patient_idx ON health_records(patient_id,updated_at);
CREATE TABLE sync_events (
    patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    seq bigint NOT NULL,
    type varchar(30) NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (patient_id,seq)
);
