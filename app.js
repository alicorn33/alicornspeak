/* ==========================================================================
   AlicornSpeak — Main Application Logic (Frontend)
   Fully client-side (localStorage). API_BASE is reserved for a future
   backend sync feature and is not currently used.
   ========================================================================== */

const API_BASE = 'http://localhost:3000';

function loadUser() {
  try { return JSON.parse(localStorage.getItem('alicorn_user') || 'null'); }
  catch (e) { console.error('Corrupt user data, resetting.', e); return null; }
}

let user = loadUser();
let cards = [], idx = 0, flipped = false, nCorrect = 0;
let placementLevel = null;
let placementIdx = 0, placementScore = 0;
let progressTab = 'overview';
let learnLevel = 1, learnLevelWords = [], learnRoundNum = 1, learnRoundWords = [], learnWordIdx = 0, learnCorrect = 0;
let lastTickTs = null;
let SPEECH_RATE = 0.8;

const CEFR_LEVELS = ['A1','A2','B1','B2','C1','C2'];

const PLACEMENT_WORDS = [
  {word:'cat', level:0}, {word:'water', level:0},
  {word:'achieve', level:2}, {word:'improve', level:2},
  {word:'sophisticated', level:4}
];

const LEARN_LEVELS = [
  [ {word:'cat',th:'แมว'},{word:'dog',th:'สุนัข'},{word:'apple',th:'แอปเปิล'},{word:'water',th:'น้ำ'},{word:'happy',th:'มีความสุข'},
    {word:'book',th:'หนังสือ'},{word:'run',th:'วิ่ง'},{word:'jump',th:'กระโดด'},{word:'red',th:'สีแดง'},{word:'blue',th:'สีฟ้า'},
    {word:'big',th:'ใหญ่'},{word:'small',th:'เล็ก'},{word:'sun',th:'พระอาทิตย์'},{word:'moon',th:'พระจันทร์'},{word:'house',th:'บ้าน'},
    {word:'tree',th:'ต้นไม้'},{word:'fish',th:'ปลา'},{word:'bird',th:'นก'},{word:'milk',th:'นม'},{word:'bread',th:'ขนมปัง'} ],
  [ {word:'school',th:'โรงเรียน'},{word:'teacher',th:'ครู'},{word:'friend',th:'เพื่อน'},{word:'family',th:'ครอบครัว'},{word:'kitchen',th:'ห้องครัว'},
    {word:'garden',th:'สวน'},{word:'weather',th:'สภาพอากาศ'},{word:'morning',th:'เช้า'},{word:'evening',th:'เย็น'},{word:'hungry',th:'หิว'},
    {word:'thirsty',th:'กระหายน้ำ'},{word:'tired',th:'เหนื่อย'},{word:'exciting',th:'น่าตื่นเต้น'},{word:'dangerous',th:'อันตราย'},{word:'expensive',th:'แพง'},
    {word:'cheap',th:'ถูก'},{word:'borrow',th:'ยืม'},{word:'return',th:'คืน'},{word:'remember',th:'จำ'},{word:'forget',th:'ลืม'} ],
  [ {word:'achieve',th:'บรรลุ, ประสบความสำเร็จ'},{word:'improve',th:'พัฒนา, ปรับปรุง'},{word:'decide',th:'ตัดสินใจ'},{word:'compare',th:'เปรียบเทียบ'},{word:'describe',th:'บรรยาย'},
    {word:'explain',th:'อธิบาย'},{word:'imagine',th:'จินตนาการ'},{word:'suggest',th:'แนะนำ'},{word:'opinion',th:'ความคิดเห็น'},{word:'environment',th:'สิ่งแวดล้อม'},
    {word:'condition',th:'เงื่อนไข, สภาพ'},{word:'opportunity',th:'โอกาส'},{word:'experience',th:'ประสบการณ์'},{word:'responsible',th:'มีความรับผิดชอบ'},{word:'confident',th:'มั่นใจ'},
    {word:'generous',th:'ใจกว้าง'},{word:'patient',th:'อดทน'},{word:'curious',th:'อยากรู้อยากเห็น'},{word:'ancient',th:'โบราณ'},{word:'modern',th:'ทันสมัย'} ],
  [ {word:'sophisticated',th:'ซับซ้อน, ประณีต'},{word:'significant',th:'มีนัยสำคัญ'},{word:'essential',th:'จำเป็นอย่างยิ่ง'},{word:'considerable',th:'มากพอสมควร'},{word:'potential',th:'ศักยภาพ'},
    {word:'inevitable',th:'หลีกเลี่ยงไม่ได้'},{word:'controversial',th:'เป็นที่ถกเถียง'},{word:'ambiguous',th:'คลุมเครือ'},{word:'coincidence',th:'ความบังเอิญ'},{word:'phenomenon',th:'ปรากฏการณ์'},
    {word:'hypothesis',th:'สมมติฐาน'},{word:'perspective',th:'มุมมอง'},{word:'sustainable',th:'ยั่งยืน'},{word:'versatile',th:'อเนกประสงค์'},{word:'meticulous',th:'พิถีพิถัน'},
    {word:'pragmatic',th:'เชิงปฏิบัติ'},{word:'resilient',th:'ยืดหยุ่น, ฟื้นตัวไว'},{word:'tangible',th:'จับต้องได้'},{word:'ubiquitous',th:'พบเห็นได้ทั่วไป'},{word:'plausible',th:'เป็นไปได้, น่าเชื่อถือ'} ],
  [ {word:'serendipity',th:'โชคช่วยโดยบังเอิญ'},{word:'ephemeral',th:'ชั่วครู่ชั่วยาม'},{word:'quintessential',th:'เป็นแบบฉบับที่สุด'},{word:'idiosyncratic',th:'เป็นเอกลักษณ์เฉพาะตัว'},{word:'juxtaposition',th:'การวางเคียงกัน'},
    {word:'paradigm',th:'กรอบความคิด'},{word:'ostentatious',th:'โอ้อวด'},{word:'cacophony',th:'เสียงอึกทึกไม่ประสาน'},{word:'ubiquity',th:'การมีอยู่ทุกหนแห่ง'},{word:'magnanimous',th:'ใจกว้าง, มีเมตตา'},
    {word:'perfunctory',th:'ทำแบบขอไปที'},{word:'surreptitious',th:'แอบทำอย่างลับๆ'},{word:'vicissitude',th:'ความผันผวนของชีวิต'},{word:'ineffable',th:'ไม่อาจบรรยายได้'},{word:'obfuscate',th:'ทำให้สับสน คลุมเครือ'},
    {word:'recalcitrant',th:'ดื้อรั้น'},{word:'sycophant',th:'คนประจบสอพลอ'},{word:'insidious',th:'ร้ายกาจแบบแอบแฝง'},{word:'equanimity',th:'ความสงบใจ'},{word:'punctilious',th:'พิถีพิถันเรื่องระเบียบ'} ]
];

const PASS_THRESHOLD = 14;
const WORDS_PER_ROUND = 10;

/* ================= Persistence helpers ================= */
function saveUser() {
  try { localStorage.setItem('alicorn_user', JSON.stringify(user)); }
  catch (e) { console.error('Save failed', e); toast('⚠️ ไม่สามารถบันทึกข้อมูลได้ในอุปกรณ์นี้'); }
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

/* ================= Stats & streak tracking ================= */
function touchStreak() {
  if (!user) return;
  if (!user.stats) user.stats = { streak: 0, lastActiveDate: null, daily: {} };
  const today = todayStr();
  if (user.stats.lastActiveDate === today) return;
  const yesterday = daysAgoStr(1);
  user.stats.streak = (user.stats.lastActiveDate === yesterday) ? (user.stats.streak || 0) + 1 : 1;
  user.stats.lastActiveDate = today;
  saveUser();
}

function ensureTodayRecord() {
  if (!user) return null;
  if (!user.stats) user.stats = { streak: 0, lastActiveDate: null, daily: {} };
  const today = todayStr();
  if (!user.stats.daily[today]) user.stats.daily[today] = { studied: 0, correct: 0, minutes: 0 };
  return user.stats.daily[today];
}

function tickMinutes() {
  if (!user) return;
  const rec = ensureTodayRecord();
  const now = Date.now();
  if (lastTickTs) rec.minutes += Math.min((now - lastTickTs) / 60000, 5);
  lastTickTs = now;
  saveUser();
}

function recordAnswer(correct) {
  if (!user) return;
  const rec = ensureTodayRecord();
  rec.studied++;
  if (correct) rec.correct++;
  saveUser();
}

function statsSummary() {
  if (!user || !user.stats) return { minutesToday: 0, streak: 0, accuracy: 0 };
  const today = ensureTodayRecord() || { minutes: 0 };
  let studied = 0, correct = 0;
  for (let i = 0; i < 7; i++) {
    const rec = user.stats.daily[daysAgoStr(i)];
    if (rec) { studied += rec.studied; correct += rec.correct; }
  }
  return {
    minutesToday: Math.round(today.minutes || 0),
    streak: user.stats.streak || 0,
    accuracy: studied > 0 ? Math.round((correct / studied) * 100) : 0
  };
}

function weeklyStats() {
  if (!user || !user.stats) return { minutes: 0, accuracy: 0 };
  let minutes = 0, studied = 0, correct = 0;
  for (let i = 0; i < 7; i++) {
    const rec = user.stats.daily[daysAgoStr(i)];
    if (rec) { minutes += rec.minutes || 0; studied += rec.studied || 0; correct += rec.correct || 0; }
  }
  return { minutes: Math.round(minutes), accuracy: studied > 0 ? Math.round((correct / studied) * 100) : 0 };
}

function formatMinutes(m) {
  const h = Math.floor(m / 60), mm = m % 60;
  return h > 0 ? `${h} ชั่วโมง ${mm} นาที` : `${mm} นาที`;
}

function currentCefr() {
  const idx = Math.min((user?.unlockedLevel || 1) - 1, CEFR_LEVELS.length - 1);
  return CEFR_LEVELS[idx];
}

/* ================= Accessibility preferences ================= */
function applyPrefs() {
  const prefs = user?.prefs || {};
  document.body.classList.toggle('ld-font', !!prefs.ldFont);
  document.documentElement.style.setProperty('--font-scale', prefs.fontScale || 1);
  SPEECH_RATE = prefs.speechRate || (user?.isLd ? 0.7 : 0.85);
}

function toggleLdFont() {
  if (!user) return;
  user.prefs = user.prefs || {};
  user.prefs.ldFont = !user.prefs.ldFont;
  saveUser(); applyPrefs(); showProfile();
}

function setFontScale(scale) {
  if (!user) return;
  user.prefs = user.prefs || {};
  user.prefs.fontScale = scale;
  saveUser(); applyPrefs(); showProfile();
}

function setSpeechRate(rate) {
  if (!user) return;
  user.prefs = user.prefs || {};
  user.prefs.speechRate = rate;
  saveUser(); applyPrefs(); showProfile();
}

/* ================= Vocabulary bank & spaced repetition ================= */
const CURATED = {
  apple: { phonetic: '/æp.əl/', exampleSentence: 'I eat an apple.', exampleTranslation: 'ฉันกินแอปเปิล', emoji: '🍎' },
  cat:   { phonetic: '/kæt/', exampleSentence: 'The cat sleeps.', exampleTranslation: 'แมวนอนหลับ', emoji: '🐱' },
  dog:   { phonetic: '/dɒɡ/', exampleSentence: 'My dog plays.', exampleTranslation: 'สุนัขของฉันเล่น', emoji: '🐶' },
  happy: { phonetic: '/hæp.i/', exampleSentence: 'I am happy.', exampleTranslation: 'ฉันมีความสุข', emoji: '😊' },
  water: { phonetic: '/wɔː.tər/', exampleSentence: 'Drink water.', exampleTranslation: 'ดื่มน้ำ', emoji: '💧' }
};

const EMOJI_MAP = {
  book:'📖', run:'🏃', jump:'🤸', red:'🟥', blue:'🟦', big:'🐘', small:'🐜', sun:'☀️', moon:'🌙',
  house:'🏠', tree:'🌳', fish:'🐟', bird:'🐦', milk:'🥛', bread:'🍞', school:'🏫', teacher:'👩‍🏫',
  friend:'🧑‍🤝‍🧑', family:'👨‍👩‍👧', kitchen:'🍳', garden:'🌷', weather:'⛅', morning:'🌅', evening:'🌆',
  hungry:'🍽️', thirsty:'🥤', tired:'😴', exciting:'🎉', dangerous:'⚠️', expensive:'💰', cheap:'🏷️',
  borrow:'🤝', return:'↩️', remember:'🧠', forget:'💭'
};
const ABSTRACT_EMOJIS = ['💡','🎯','📊','🧩','🔍','✨','📌'];

function emojiFor(word) {
  if (EMOJI_MAP[word]) return EMOJI_MAP[word];
  let h = 0; for (const c of word) h = (h * 31 + c.charCodeAt(0)) % ABSTRACT_EMOJIS.length;
  return ABSTRACT_EMOJIS[h];
}

function buildCardData(w) {
  const c = CURATED[w.word];
  if (c) return { word: w.word, th: w.th, ...c };
  return {
    word: w.word, th: w.th, phonetic: '', emoji: emojiFor(w.word),
    exampleSentence: `Try to use "${w.word}" in your own sentence!`,
    exampleTranslation: `ลองแต่งประโยคด้วยคำว่า "${w.th}" ดูสิ!`
  };
}

function vocabUpTo(level) {
  const pool = [];
  for (let i = 0; i < level; i++) LEARN_LEVELS[i].forEach(w => pool.push(w));
  return pool;
}

function dueWords(limit = 20) {
  if (!user) return [];
  if (!user.srs) user.srs = {};
  const today = todayStr();
  const pool = vocabUpTo(user.unlockedLevel || 1);
  const due = [], fresh = [];
  pool.forEach(w => {
    const rec = user.srs[w.word];
    if (!rec) fresh.push(w);
    else if (rec.due <= today) due.push(w);
  });
  let selection = due.slice(0, limit);
  if (selection.length < limit) selection = selection.concat(fresh.slice(0, limit - selection.length));
  return selection;
}

function updateSrs(word, rating) {
  if (!user) return;
  if (!user.srs) user.srs = {};
  const rec = user.srs[word] || { interval: 0, reps: 0 };
  let interval;
  if (rating === 'Hard') { interval = 1; rec.reps = 0; }
  else if (rating === 'Good') { rec.reps = (rec.reps || 0) + 1; interval = rec.interval ? Math.round(rec.interval * 2.0) : 3; }
  else { rec.reps = (rec.reps || 0) + 1; interval = rec.interval ? Math.round(rec.interval * 2.8) : 7; }
  interval = Math.min(interval, 60);
  user.srs[word] = { interval, reps: rec.reps, due: daysAgoStr(-interval) };
  saveUser();
}

/* ================= Small UI helpers ================= */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function speak(w) {
  if (!('speechSynthesis' in window)) { toast('⚠️ เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง'); return; }
  const u = new SpeechSynthesisUtterance(w);
  u.lang = 'en-US'; u.rate = SPEECH_RATE;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

function navBar(active) {
  const items = [
    { key: 'home', icon: '🏠', label: 'หน้าหลัก', fn: 'showDash()' },
    { key: 'study', icon: '🔄', label: 'ทบทวน', fn: 'startStudy()' },
    { key: 'learn', icon: '📗', label: 'เรียนรู้', fn: 'showLearnLevels()' },
    { key: 'stats', icon: '📊', label: 'สถิติ', fn: 'showProgress()' },
    { key: 'me', icon: '👤', label: 'ฉัน', fn: 'showProfile()' }
  ];
  return `<div class="navbar">${items.map(i =>
    `<div class="navitem ${i.key === active ? 'active' : ''}" onclick="${i.fn}"><span>${i.icon}</span><small>${i.label}</small></div>`
  ).join('')}</div>`;
}

/* ================= Home ================= */
function showHome() {
  document.getElementById('app').innerHTML = `
    <div class="hero">
      <div class="mascot">📖🦄</div>
      <h1>สวัสดี! ยินดีต้อนรับสู่<br>AlicornSpeak</h1>
      <p class="sub">เรียนรู้คำศัพท์ภาษาอังกฤษ<br>อย่างเป็นระบบตามมาตรฐาน CEFR สำหรับเด็ก LD</p>
    </div>
    <button class="btn btn-green" onclick="startPlacementTest()">เริ่มทดสอบระดับของฉัน</button>
    <button class="btn btn-white" onclick="showAuth(false)">เข้าสู่ระบบ</button>
    <button class="btn btn-white" onclick="showAuth(true)" style="border-color:#4A7C59;color:#4A7C59;margin-top:.5rem">สมัครสมาชิก</button>
    <div class="feat-row">
      <div class="feat"><span class="fi">🌱</span>เรียนง่าย<br>เป็นขั้นตอน</div>
      <div class="feat"><span class="fi">🔄</span>จำได้นาน<br>ด้วยระบบ SRS</div>
      <div class="feat"><span class="fi">📈</span>เห็นพัฒนาการ<br>อย่างชัดเจน</div>
    </div>
    <p class="quote">"เรียนวันละนิด เก่งขึ้นทุกวัน"</p>`;
}

/* ================= Placement Test ================= */
function startPlacementTest() {
  placementIdx = 0; placementScore = 0;
  renderPlacementQuestion();
}

function renderPlacementQuestion() {
  const q = PLACEMENT_WORDS[placementIdx];
  const pct = Math.round((placementIdx / PLACEMENT_WORDS.length) * 100);
  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <button class="back-btn" onclick="showHome()">←</button>
      <h1>ทดสอบระดับ</h1>
    </div>
    <p class="sub" style="text-align:left;margin-bottom:.3rem">คำถามที่ ${placementIdx + 1} / ${PLACEMENT_WORDS.length}</p>
    <div class="bar" style="margin-bottom:1rem"><div class="fill" style="width:${pct}%"></div></div>
    <div class="card" style="text-align:center">
      <p style="color:#8A9A8C;margin-bottom:.5rem">คุณรู้จักคำนี้ไหม?</p>
      <div class="word" style="margin:1rem 0">${q.word}</div>
      <button class="audio" onclick="speak('${q.word}')" style="margin:0 auto">🔊</button>
    </div>
    <button class="btn btn-green" onclick="answerPlacement(true)">✅ รู้จักคำนี้</button>
    <button class="btn btn-white" onclick="answerPlacement(false)">❓ ยังไม่รู้จัก</button>`;
}

function answerPlacement(known) {
  if (known) placementScore += PLACEMENT_WORDS[placementIdx].level + 1;
  placementIdx++;
  if (placementIdx >= PLACEMENT_WORDS.length) {
    const levelIdx = Math.max(0, Math.min(CEFR_LEVELS.length - 1, Math.round(placementScore / 3)));
    placementLevel = CEFR_LEVELS[levelIdx];
    showPlacementResult();
  } else renderPlacementQuestion();
}

function showPlacementResult() {
  document.getElementById('app').innerHTML = `
    <div style="text-align:center;padding-top:2rem">
      <div style="font-size:4rem">🎉</div>
      <h1>ผลการทดสอบของคุณ</h1>
      <p class="sub">ระดับที่เหมาะสมกับคุณคือ</p>
      <div class="badge" style="font-size:1.3rem;padding:8px 24px">${placementLevel}</div>
      <p class="sub" style="margin-top:1rem">สมัครสมาชิกเพื่อบันทึกผล<br>และเริ่มต้นเส้นทางการเรียนรู้ของคุณ</p>
    </div>
    <button class="btn btn-green" onclick="showAuth(true)">สมัครสมาชิกเลย</button>
    <button class="btn btn-white" onclick="showHome()">กลับหน้าแรก</button>`;
}

/* ================= Auth (Register / Login) ================= */
function showAuth(reg = true) {
  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <button class="back-btn" onclick="showHome()">←</button>
      <h1>🦄 AlicornSpeak</h1>
    </div>
    <p class="sub">${reg ? 'สร้างบัญชีเพื่อเริ่มต้นเรียนรู้' : 'เข้าสู่ระบบเพื่อเรียนต่อ'}</p>
    <div class="card">
      <h2 style="text-align:center;color:#2D5A3D;margin-bottom:1rem">${reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h2>
      ${reg ? `<label>ชื่อ - นามสกุล</label><input id="f_name" placeholder="กรอกชื่อ - นามสกุล">` : ''}
      <label>ชื่อผู้ใช้ / อีเมล</label><input id="f_user" placeholder="กรอกชื่อผู้ใช้หรืออีเมล">
      <label>รหัสผ่าน</label><input id="f_pass" type="password" placeholder="อย่างน้อย 8 ตัวอักษร">

      ${reg ? `
        <div class="ld-box">
          <input type="checkbox" id="f_ld">
          <label for="f_ld" style="margin:0;font-weight:400">ผู้เรียนมีความบกพร่องทางการเรียนรู้ (LD)<br><small style="color:#8A9A8C">ระบบจะปรับรูปแบบตัวอักษรและความเร็วเสียงอ่านให้เหมาะสมอัตโนมัติ (ปรับเพิ่มเติมได้ในหน้าโปรไฟล์)</small></label>
        </div>
      ` : ''}

      ${reg && placementLevel ? `<p class="sub" style="text-align:left;margin-top:.75rem">📊 ผลทดสอบระดับของคุณ: <span class="badge">${placementLevel}</span></p>` : ''}

      <button class="btn btn-green" onclick="processAuth(${reg})">${reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</button>
      <span class="link" onclick="showAuth(${!reg})">${reg ? 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครสมาชิก'}</span>
    </div>`;
}

async function processAuth(reg) {
  const username = document.getElementById('f_user').value.trim();
  const password = document.getElementById('f_pass').value;
  const fullName = reg ? document.getElementById('f_name').value.trim() : '';
  const isLd = reg ? document.getElementById('f_ld').checked : false;

  if (!username || password.length < 8) {
    toast('❌ กรุณากรอกข้อมูลให้ครบถ้วน (รหัสผ่านอย่างน้อย 8 ตัวอักษร)');
    return;
  }

  if (reg) {
    user = {
      userId: 'user_' + Date.now(),
      username, fullName: fullName || username,
      cefrLevel: placementLevel || 'A1',
      isLd, unlockedLevel: 1,
      prefs: { ldFont: isLd, fontScale: isLd ? 1.15 : 1, speechRate: isLd ? 0.7 : 0.85 },
      srs: {},
      stats: { streak: 0, lastActiveDate: null, daily: {} }
    };
  } else if (!user) {
    // No real backend: a login with no local account just starts a fresh local profile.
    user = {
      userId: 'user_' + Date.now(),
      username, fullName: username,
      cefrLevel: 'A1', isLd: false, unlockedLevel: 1,
      prefs: { ldFont: false, fontScale: 1, speechRate: 0.85 },
      srs: {}, stats: { streak: 0, lastActiveDate: null, daily: {} }
    };
  }

  saveUser();
  placementLevel = null;
  applyPrefs();
  touchStreak();
  toast(reg ? '🎉 สมัครสมาชิกสำเร็จ!' : '👋 ยินดีต้อนรับกลับมาครับ');
  showDash();
}

function logout() {
  if (!confirm('ต้องการออกจากระบบใช่หรือไม่?')) return;
  user = null;
  localStorage.removeItem('alicorn_user');
  applyPrefs();
  showHome();
}

/* ================= Dashboard ================= */
function showDash() {
  if (!user) { showHome(); return; }
  const s = statsSummary();
  const due = dueWords(20).length;
  const overallPct = Math.round(((user.unlockedLevel - 1) / LEARN_LEVELS.length) * 100);
  document.getElementById('app').innerHTML = `
    <h1 style="text-align:left;font-size:1.4rem">สวัสดี, ${user.fullName || user.username} 👋</h1>
    <p class="sub" style="text-align:left;margin-bottom:1rem">
      ระดับปัจจุบัน <span class="badge">${user.cefrLevel || 'A1'}</span>
      ${user.isLd ? '<span class="badge badge-orange">LD Mode</span>' : ''}
    </p>
    <div class="card" style="background:linear-gradient(135deg,#E8F5EC,#FDF8F0)">
      <p style="color:#5A6B5C;font-size:.9rem">การ์ดที่ต้องทบทวนวันนี้ ☀️</p>
      <b style="font-size:2.5rem;color:#3A7250">${due}</b> <span style="color:#5A6B5C">ใบ</span>
      <button class="btn btn-green" onclick="startStudy()">${due > 0 ? 'เริ่มทบทวนคำศัพท์ →' : 'ทบทวนอีกครั้ง →'}</button>
    </div>
    <div class="stats">
      <div class="stat"><b>${s.minutesToday}</b><span>นาทีวันนี้</span></div>
      <div class="stat"><b>🔥${s.streak}</b><span>วันต่อเนื่อง</span></div>
      <div class="stat"><b>${s.accuracy}%</b><span>ความถูกต้อง</span></div>
    </div>
    <div class="card" style="margin-top:1rem;cursor:pointer" onclick="showProgress()">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="color:#2D5A3D">ความก้าวหน้าตาม CEFR</b>
        <span style="color:#4A7C59;font-size:.8rem;font-weight:600">ดูทั้งหมด →</span>
      </div>
      <div class="bar"><div class="fill" style="width:${overallPct}%"></div></div>
      <p style="text-align:right;font-size:.75rem;color:#8A9A8C;margin-top:.3rem">${overallPct}% ของหลักสูตรทั้งหมด</p>
    </div>
    ${navBar('home')}`;
}

/* ================= Profile ================= */
function showProfile() {
  if (!user) { showHome(); return; }
  const fs = user.prefs?.fontScale || 1;
  const rate = user.prefs?.speechRate ?? SPEECH_RATE;
  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <button class="back-btn" onclick="showDash()">←</button>
      <h1>โปรไฟล์ของฉัน</h1>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:3.5rem;margin-bottom:.5rem">👤</div>
      <b style="font-size:1.2rem;color:#2D5A3D">${user.fullName || user.username}</b><br>
      <span class="sub" style="font-size:.9rem;color:#8A9A8C">@${user.username}</span>
      <div style="margin-top:.5rem">
        <span class="badge">ระดับ ${user.cefrLevel || 'A1'}</span>
        ${user.isLd ? '<span class="badge badge-orange" style="margin-left:5px">LD Mode Active</span>' : ''}
      </div>
    </div>
    <div class="card">
      <b style="color:#2D5A3D">การตั้งค่าการอ่าน (สำหรับ LD)</b>
      <div class="setting-row">
        <div class="setting-label">แบบอักษรอ่านง่าย (Lexend)<small>ลดความสับสนของตัวอักษรและเว้นบรรทัดให้กว้างขึ้น</small></div>
        <label class="switch"><input type="checkbox" ${user.prefs?.ldFont ? 'checked' : ''} onchange="toggleLdFont()"><span class="track"></span></label>
      </div>
      <div class="setting-row">
        <div class="setting-label">ขนาดตัวอักษร</div>
        <div class="seg">
          <button class="seg-btn ${fs === 1 ? 'active' : ''}" onclick="setFontScale(1)">ปกติ</button>
          <button class="seg-btn ${fs === 1.15 ? 'active' : ''}" onclick="setFontScale(1.15)">ใหญ่</button>
          <button class="seg-btn ${fs === 1.3 ? 'active' : ''}" onclick="setFontScale(1.3)">ใหญ่พิเศษ</button>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-label">ความเร็วเสียงอ่าน</div>
        <div class="seg">
          <button class="seg-btn ${rate <= 0.7 ? 'active' : ''}" onclick="setSpeechRate(0.7)">ช้า</button>
          <button class="seg-btn ${rate > 0.7 && rate < 0.9 ? 'active' : ''}" onclick="setSpeechRate(0.85)">ปกติ</button>
          <button class="seg-btn ${rate >= 0.9 ? 'active' : ''}" onclick="setSpeechRate(1)">เร็ว</button>
        </div>
      </div>
      <p class="sub" style="text-align:left;margin-top:.75rem">🎯 เป้าหมายรายวัน: 20 คำ / วัน</p>
    </div>
    <button class="btn btn-white" onclick="logout()" style="color:#E76F6F;border-color:#E76F6F">ออกจากระบบ</button>
    ${navBar('me')}`;
}

/* ================= Study (Flashcards, SRS-driven) ================= */
async function startStudy() {
  if (!user) { showAuth(false); return; }
  const words = dueWords(20);
  cards = words.map(buildCardData);
  idx = 0; nCorrect = 0;
  lastTickTs = Date.now();
  if (cards.length === 0) { renderStudyEmpty(); return; }
  renderCard();
}

function renderStudyEmpty() {
  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <button class="back-btn" onclick="showDash()">←</button>
      <h1>ทบทวนคำศัพท์</h1>
    </div>
    <div class="empty-state card">
      <span class="ei">🌟</span>
      <b style="color:#2D5A3D;font-size:1.1rem">เยี่ยมมาก! ไม่มีการ์ดที่ต้องทบทวนตอนนี้</b>
      <p class="sub" style="margin-top:.5rem">ปลดล็อกคำศัพท์ใหม่ได้จากหน้าเรียนรู้ หรือกลับมาทบทวนใหม่พรุ่งนี้</p>
      <button class="btn btn-green" onclick="showLearnLevels()">ไปเรียนคำศัพท์ใหม่</button>
    </div>
    ${navBar('study')}`;
}

function renderCard() {
  flipped = false;
  const c = cards[idx];
  document.getElementById('app').innerHTML = `
    <p class="sub" style="margin-bottom:.5rem">การ์ดที่ ${idx + 1} / ${cards.length}</p>
    <div class="flash" id="fc" onclick="flip()">
      <div class="flash-inner">
        <div class="face front">
          <button class="audio" onclick="event.stopPropagation();speak('${c.word}')">🔊</button>
          <div class="emoji">${c.emoji}</div>
          <div class="word">${c.word}</div>
          ${c.phonetic ? `<div class="phon">${c.phonetic}</div>` : ''}
          <p style="color:#8A9A8C;font-size:.85rem">👆 แตะบัตรเพื่อดูคำแปล</p>
        </div>
        <div class="face back">
          <div class="trans">${c.th}</div>
          <div class="example"><b style="color:#3A7250">${c.exampleSentence}</b><br>${c.exampleTranslation}</div>
          <button class="audio" onclick="event.stopPropagation();speak('${c.word}')">🔊</button>
        </div>
      </div>
    </div>
    <div class="rates" id="rates" style="display:none">
      <button class="rate r1" onclick="rate('Hard')">🤔 ยาก</button>
      <button class="rate r2" onclick="rate('Good')">😊 ดี</button>
      <button class="rate r3" onclick="rate('Easy')">😄 ง่าย</button>
    </div>
    ${navBar('study')}`;
}

function flip() {
  if (!flipped) {
    document.getElementById('fc').classList.add('flipped');
    document.getElementById('rates').style.display = 'flex';
    flipped = true;
  }
}

function rate(rating) {
  tickMinutes();
  const word = cards[idx].word;
  updateSrs(word, rating);
  const correct = rating === 'Good' || rating === 'Easy';
  recordAnswer(correct);
  if (correct) nCorrect++;
  idx++;
  if (idx >= cards.length) {
    document.getElementById('app').innerHTML = `
      <div style="text-align:center;padding-top:3rem">
        <div style="font-size:5rem">🎉</div>
        <h1>ทบทวนครบแล้ว!</h1>
        <p class="sub">คุณตอบถูก ${nCorrect} / ${cards.length} ใบ</p>
        <button class="btn btn-green" onclick="showDash()">กลับหน้าหลัก</button>
      </div>
      ${navBar('study')}`;
  } else renderCard();
}

/* ================= Learn & Speaking Test ================= */
function showLearnLevels() {
  if (!user) { showAuth(false); return; }
  const unlocked = user.unlockedLevel || 1;
  const grid = LEARN_LEVELS.map((_, i) => {
    const lvl = i + 1;
    const locked = lvl > unlocked;
    const passed = lvl < unlocked;
    const cls = locked ? 'locked' : passed ? 'completed' : '';
    const numDisplay = locked ? '🔒' : passed ? '✅' : lvl;
    return `<div class="lvl-card ${cls}" onclick="${locked ? '' : `startLearnLevel(${lvl})`}">
      <div class="lvl-num">${numDisplay}</div>
      <div class="lvl-tag">${locked ? 'ยังไม่ปลดล็อก' : `เลเวล ${lvl} · ${CEFR_LEVELS[i]}`} (20 ข้อ)</div>
    </div>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <button class="back-btn" onclick="showDash()">←</button>
      <h1>บทเรียนออกเสียง 📗</h1>
    </div>
    <p class="sub" style="text-align:left">ทดสอบพูดออกเสียง 20 ข้อ ผ่านเกณฑ์ 70% (14 ข้อขึ้นไป) เพื่อปลดล็อกเลเวลถัดไป</p>
    <div class="lvl-grid">${grid}</div>
    ${navBar('learn')}`;
}

function startLearnLevel(level) {
  learnLevel = level;
  learnLevelWords = LEARN_LEVELS[level - 1];
  learnRoundNum = 1;
  learnRoundWords = learnLevelWords.slice(0, WORDS_PER_ROUND);
  learnWordIdx = 0;
  learnCorrect = 0;
  lastTickTs = Date.now();
  renderLearnWord();
}

function renderLearnWord() {
  const q = learnRoundWords[learnWordIdx];
  const doneSoFar = (learnRoundNum - 1) * WORDS_PER_ROUND + learnWordIdx;
  const pct = Math.round((doneSoFar / (WORDS_PER_ROUND * 2)) * 100);

  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <button class="back-btn" onclick="showLearnLevels()">←</button>
      <h1>เลเวล ${learnLevel} · รอบ ${learnRoundNum}/2</h1>
    </div>
    <p class="sub" style="text-align:left;margin-bottom:.3rem">ข้อที่ ${doneSoFar + 1} / 20</p>
    <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
    <div class="q-card" id="qCard">
      <button class="audio" onclick="speak('${q.word}')" style="margin:0 auto">🔊 ฟังเสียง</button>
      <div class="word" style="font-size:2.5rem;margin:.5rem 0">${q.word}</div>
      <div class="phon">${q.th}</div>
      <button class="mic-btn" id="micBtn" onclick="startSpeechRecognition('${q.word}')">🎤</button>
      <p id="heardText" class="sub" style="margin-top:1rem">กดปุ่มไมค์แล้วพูดคำศัพท์ภาษาอังกฤษ</p>
    </div>
    ${navBar('learn')}`;
}

function startSpeechRecognition(targetWord) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast('⚠️ เบราว์เซอร์นี้ไม่รองรับการแปลงเสียงพูด');
    setTimeout(() => judgePronunciation(targetWord, targetWord), 1000);
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  const micBtn = document.getElementById('micBtn');
  micBtn.classList.add('listening');
  micBtn.disabled = true;
  document.getElementById('heardText').textContent = "กำลังฟังเสียงของคุณ...";

  recognition.onresult = (e) => {
    const said = e.results[0][0].transcript.trim().toLowerCase();
    judgePronunciation(said, targetWord);
  };
  recognition.onerror = () => {
    micBtn.classList.remove('listening');
    micBtn.disabled = false;
    document.getElementById('heardText').textContent = "❌ ไม่ได้ยินเสียง ลองใหม่อีกครั้ง";
  };
  recognition.onend = () => { micBtn.classList.remove('listening'); micBtn.disabled = false; };
  recognition.start();
}

function judgePronunciation(said, targetWord) {
  tickMinutes();
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const isMatch = norm(said).includes(norm(targetWord)) || norm(targetWord).includes(norm(said));

  if (isMatch) learnCorrect++;
  recordAnswer(isMatch);
  const card = document.getElementById('qCard');
  card.className = `q-card ${isMatch ? 'correct' : 'wrong'}`;
  document.getElementById('heardText').innerHTML = isMatch
    ? `✅ ถูกต้อง! ได้ยินว่า "${said}"`
    : `❌ คำที่ถูกคือ "${targetWord}" (ได้ยิน: "${said}")`;

  setTimeout(nextLearnWord, 1500);
}

function nextLearnWord() {
  learnWordIdx++;
  if (learnWordIdx < WORDS_PER_ROUND) {
    renderLearnWord();
  } else if (learnRoundNum === 1) {
    learnRoundNum = 2;
    learnRoundWords = learnLevelWords.slice(WORDS_PER_ROUND, WORDS_PER_ROUND * 2);
    learnWordIdx = 0;
    toast('🔄 จบรอบที่ 1! ไปต่อรอบที่ 2 กัน');
    renderLearnWord();
  } else {
    finishLearnLevel();
  }
}

function finishLearnLevel() {
  const passed = learnCorrect >= PASS_THRESHOLD;
  if (passed && user && learnLevel >= (user.unlockedLevel || 1)) {
    user.unlockedLevel = Math.min(LEARN_LEVELS.length, learnLevel + 1);
    user.cefrLevel = currentCefr();
    saveUser();
  }
  document.getElementById('app').innerHTML = `
    <div style="text-align:center;padding-top:3rem">
      <div style="font-size:5rem">${passed ? '🌟' : '💪'}</div>
      <h1>${passed ? `ผ่านเลเวล ${learnLevel} แล้ว!` : 'ยังไม่ผ่านเกณฑ์'}</h1>
      <p class="sub">คุณพูดถูก ${learnCorrect} / 20 ข้อ (ต้องผ่านอย่างน้อย 14 ข้อ)</p>
      ${passed && learnLevel < LEARN_LEVELS.length ? `<button class="btn btn-green" onclick="startLearnLevel(${learnLevel + 1})">ไปเลเวล ${learnLevel + 1} →</button>` : ''}
      <button class="btn btn-white" onclick="startLearnLevel(${learnLevel})">ทำเลเวลนี้ซ้ำ</button>
      <button class="btn btn-white" onclick="showLearnLevels()">กลับหน้าเลือกเลเวล</button>
    </div>
    ${navBar('learn')}`;
}

/* ================= Progress ================= */
function showProgress(tab) {
  if (!user) { showHome(); return; }
  if (tab) progressTab = tab;
  const curIdx = CEFR_LEVELS.indexOf(user.cefrLevel || 'A1');
  const roadmap = CEFR_LEVELS.map((lv, i) => {
    const cls = i < curIdx ? 'done' : i === curIdx ? 'current' : '';
    return `<div class="rlevel ${cls}">${lv}</div>`;
  }).join('<div class="rline"></div>');

  const wk = weeklyStats();
  const s = statsSummary();

  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <button class="back-btn" onclick="showDash()">←</button>
      <h1>ความก้าวหน้าของฉัน</h1>
    </div>
    <div class="card">
      <b style="color:#2D5A3D">เส้นทาง CEFR Roadmap</b>
      <div class="roadmap" style="margin:1rem 0">${roadmap}</div>
      <p class="sub" style="text-align:left;margin:0">ระดับปัจจุบัน: ${user.cefrLevel || 'A1'}</p>
      <div class="streak-row"><span class="streak-flame">🔥</span><span class="sub" style="margin:0">ต่อเนื่อง ${s.streak} วัน</span></div>
    </div>
    <div class="card">
      <b style="color:#2D5A3D">สถิติการเรียนรู้ 7 วันล่าสุด</b>
      <p class="sub" style="text-align:left;margin-top:.5rem">⏱️ เวลาเรียนรวม: ${formatMinutes(wk.minutes)}</p>
      <p class="sub" style="text-align:left;margin:0">📊 ความถูกต้องเฉลี่ย: ${wk.accuracy}%</p>
    </div>
    ${navBar('stats')}`;
}

/* ================= Boot ================= */
applyPrefs();
if (user) { touchStreak(); }
user ? showDash() : showHome();
