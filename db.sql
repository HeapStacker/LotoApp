-- Loto baza SQL inicijalizacija

CREATE TABLE IF NOT EXISTS round (
    id SERIAL PRIMARY KEY,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id INTEGER REFERENCES round(id),
    person_id VARCHAR(20) NOT NULL,
    numbers INTEGER[] NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drawn_numbers (
    id SERIAL PRIMARY KEY,
    round_id INTEGER UNIQUE REFERENCES round(id),
    numbers INTEGER[] NOT NULL,
    drawn_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Za PostgreSQL, potrebno je imati ekstenziju za uuid:
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";
