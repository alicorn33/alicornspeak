/* ==========================================================================
   AlicornSpeak — Backend API
   เชื่อมหน้าเว็บ (frontend) เข้ากับฐานข้อมูล PostgreSQL ผ่าน REST API
   ========================================================================== */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
app.use(cors()); // เปิดกว้างสำหรับโปรเจกต์เดโม่/การบ้าน — งานจริงควรจำกัด origin
app.use(express.json());

const dateStr = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

/* ---------- Helper: ประกอบข้อมูลผู้ใช้ทั้งหมดให้อยู่ในรูปแบบเดียวกับที่ frontend ใช้ ---------- */
async function assembleUser(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  const u = rows[0];

  const { rows: srsRows } = await pool.query(
    'SELECT word, interval_days, reps, due_date FROM srs_progress WHERE user_id = $1', [id]
  );
  const srs = {};
  srsRows.forEach(r => { srs[r.word] = { interval: r.interval_days, reps: r.reps, due: dateStr(r.due_date) }; });

  const { rows: statRows } = await pool.query(
    'SELECT stat_date, studied, correct, minutes FROM daily_stats WHERE user_id = $1', [id]
  );
  const daily = {};
  statRows.forEach(r => {
    daily[dateStr(r.stat_date)] = { studied: r.studied, correct: r.correct, minutes: parseFloat(r.minutes) };
  });

  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    isLd: u.is_ld,
    cefrLevel: u.cefr_level,
    unlockedLevel: u.unlocked_level,
    prefs: u.prefs || {},
    srs,
    stats: {
      streak: u.streak,
      lastActiveDate: u.last_active_date ? dateStr(u.last_active_date) : null,
      daily
    }
  };
}

/* ---------- Health check ---------- */
app.get('/api/health', (req, res) => res.json({ ok: true }));

/* ---------- Auth: สมัครสมาชิก ---------- */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, fullName, isLd, cefrLevel } = req.body;
    if (!username || !password || password.length < 8) {
      return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน หรือรหัสผ่านสั้นเกินไป (อย่างน้อย 8 ตัวอักษร)' });
    }
    const hash = await bcrypt.hash(password, 10);
    const prefs = { ldFont: !!isLd, fontScale: isLd ? 1.15 : 1, speechRate: isLd ? 0.7 : 0.85 };
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, is_ld, cefr_level, prefs)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [username, hash, fullName || username, !!isLd, cefrLevel || 'A1', prefs]
    );
    res.json(await assembleUser(rows[0].id));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว' });
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

/* ---------- Auth: เข้าสู่ระบบ ---------- */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE username = $1', [username]);
    if (rows.length === 0) return res.status(401).json({ error: 'ไม่พบชื่อผู้ใช้นี้' });
    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
    res.json(await assembleUser(rows[0].id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

/* ---------- ดึงข้อมูลผู้ใช้ทั้งหมด (ใช้ตอนโหลดแอปใหม่) ---------- */
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await assembleUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json(user);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

/* ---------- แก้ไขข้อมูลโปรไฟล์/การตั้งค่า ---------- */
app.patch('/api/users/:id', async (req, res) => {
  try {
    const { fullName, cefrLevel, unlockedLevel, prefs } = req.body;
    const fields = [], values = [];
    let i = 1;
    if (fullName !== undefined) { fields.push(`full_name = $${i++}`); values.push(fullName); }
    if (cefrLevel !== undefined) { fields.push(`cefr_level = $${i++}`); values.push(cefrLevel); }
    if (unlockedLevel !== undefined) { fields.push(`unlocked_level = $${i++}`); values.push(unlockedLevel); }
    if (prefs !== undefined) { fields.push(`prefs = $${i++}`); values.push(JSON.stringify(prefs)); }
    if (fields.length === 0) return res.json({ ok: true });
    values.push(req.params.id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, values);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

/* ---------- อัปเดต streak (เรียกตอนเปิดแอป/ล็อกอิน) ---------- */
app.post('/api/users/:id/streak', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT streak, last_active_date FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const today = dateStr(new Date());
    const last = rows[0].last_active_date ? dateStr(rows[0].last_active_date) : null;
    let streak = rows[0].streak || 0;
    if (last !== today) {
      const yesterday = dateStr(new Date(Date.now() - 86400000));
      streak = (last === yesterday) ? streak + 1 : 1;
      await pool.query('UPDATE users SET streak = $1, last_active_date = $2 WHERE id = $3', [streak, today, req.params.id]);
    }
    res.json({ streak, lastActiveDate: today });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

/* ---------- บันทึกความก้าวหน้า SRS ของคำศัพท์ 1 คำ ---------- */
app.put('/api/users/:id/srs', async (req, res) => {
  try {
    const { word, interval, reps, due } = req.body;
    if (!word || !due) return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
    await pool.query(
      `INSERT INTO srs_progress (user_id, word, interval_days, reps, due_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, word)
       DO UPDATE SET interval_days = EXCLUDED.interval_days, reps = EXCLUDED.reps, due_date = EXCLUDED.due_date`,
      [req.params.id, word, interval || 0, reps || 0, due]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

/* ---------- บันทึกความคืบหน้ารายวัน (นาทีที่เรียน/จำนวนข้อ/ความถูกต้อง) ---------- */
app.post('/api/users/:id/progress', async (req, res) => {
  try {
    const { studiedDelta = 0, correctDelta = 0, minutesDelta = 0 } = req.body;
    const today = dateStr(new Date());
    await pool.query(
      `INSERT INTO daily_stats (user_id, stat_date, studied, correct, minutes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, stat_date)
       DO UPDATE SET studied = daily_stats.studied + EXCLUDED.studied,
                     correct = daily_stats.correct + EXCLUDED.correct,
                     minutes = daily_stats.minutes + EXCLUDED.minutes`,
      [req.params.id, today, studiedDelta, correctDelta, minutesDelta]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ AlicornSpeak API กำลังทำงานที่ http://localhost:${PORT}`);
  console.log(`   ทดสอบได้ที่ http://localhost:${PORT}/api/health`);
});
