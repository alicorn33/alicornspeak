-- ==========================================================================
-- AlicornSpeak — Database schema
-- วิธีใช้: เปิด pgAdmin -> คลิกขวาที่ฐานข้อมูล alicornspeak -> Query Tool
-- แล้ววางไฟล์นี้ทั้งหมด กด Execute (รูปสามเหลี่ยม ▶ หรือกด F5)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  username          TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  full_name         TEXT,
  is_ld             BOOLEAN NOT NULL DEFAULT false,
  cefr_level        TEXT NOT NULL DEFAULT 'A1',
  unlocked_level    INT NOT NULL DEFAULT 1,
  prefs             JSONB NOT NULL DEFAULT '{}'::jsonb,
  streak            INT NOT NULL DEFAULT 0,
  last_active_date  DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ความก้าวหน้าแบบ Spaced Repetition ของแต่ละคำ ต่อผู้ใช้ 1 คน
CREATE TABLE IF NOT EXISTS srs_progress (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word           TEXT NOT NULL,
  interval_days  INT NOT NULL DEFAULT 0,
  reps           INT NOT NULL DEFAULT 0,
  due_date       DATE NOT NULL,
  UNIQUE (user_id, word)
);

-- สถิติการเรียนรายวัน ต่อผู้ใช้ 1 คน
CREATE TABLE IF NOT EXISTS daily_stats (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date   DATE NOT NULL,
  studied     INT NOT NULL DEFAULT 0,
  correct     INT NOT NULL DEFAULT 0,
  minutes     NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_srs_user   ON srs_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_stats_user ON daily_stats(user_id);
