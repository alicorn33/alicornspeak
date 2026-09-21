/* ==========================================================================
   AlicornSpeak — Main Application Logic (Frontend)
   Data lives in PostgreSQL via the backend in /server. localStorage is only
   used as an instant-load cache so the app doesn't flash empty on refresh —
   the database is always the source of truth.
   ========================================================================== */
 
// URL ฐานของ backend API (ทุก endpoint จะต่อท้าย path นี้)
const API_BASE = 'http://localhost:3000/api'; // ต้องรัน backend (ดู /server) ก่อนใช้งานหน้านี้
 
// ฟังก์ชันสำหรับเรียก API แบบ GET (ดึงข้อมูล)
async function apiGet(path) {
  // ยิง fetch ไปที่ API_BASE + path ด้วย method GET (ค่าเริ่มต้น)
  const res = await fetch(API_BASE + path);
  // ถ้า response ไม่ใช่ 2xx ให้โยน error พร้อมข้อความจาก response (หรือข้อความ default ถ้า parse json ไม่ได้)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
  // แปลง response เป็น JSON แล้ว return ออกไป
  return res.json();
}
// ฟังก์ชันสำหรับเรียก API แบบส่งข้อมูล (POST/PUT/PATCH เป็นต้น)
async function apiSend(method, path, body) {
  // ยิง fetch พร้อมกำหนด method, header เป็น JSON และแปลง body เป็น string
  const res = await fetch(API_BASE + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  });
  // ถ้า response ไม่สำเร็จ ให้โยน error ตามข้อความจาก server หรือข้อความ default
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
  // คืนค่าผลลัพธ์ที่แปลงเป็น JSON แล้ว
  return res.json();
}
// สำหรับการซิงก์ข้อมูลที่ไม่จำเป็นต้องรอผล (บันทึกไว้ในเครื่องก่อนแล้ว) —
// ถ้า backend ปิดอยู่หรือเน็ตหลุด จะไม่ทำให้หน้าเว็บค้าง แค่ log แจ้งเตือนใน console
function syncQuiet(promise) {
  // ดัก error ของ promise ที่ส่งเข้ามา แล้วแค่ warn ใน console ไม่ throw ต่อ ไม่กระทบ UI
  promise.catch(e => console.warn('ซิงก์ข้อมูลไปเซิร์ฟเวอร์ไม่สำเร็จ (ข้อมูลยังอยู่ในเครื่องนี้):', e.message));
}
 
// โหลดข้อมูลผู้ใช้จาก localStorage (ใช้เป็น cache ตอนเปิดแอปครั้งแรก)
function loadUser() {
  // พยายามอ่านค่า 'alicorn_user' จาก localStorage แล้ว parse เป็น object, ถ้าไม่มีให้เป็น null
  try { return JSON.parse(localStorage.getItem('alicorn_user') || 'null'); }
  // ถ้าข้อมูลเสีย (parse ไม่ได้) ให้ log error แล้วคืนค่า null แทนการ crash แอป
  catch (e) { console.error('Corrupt user data, resetting.', e); return null; }
}
 
// ตัวแปร global เก็บสถานะของแอปทั้งหมด
let user = loadUser();               // ข้อมูลผู้ใช้ปัจจุบัน (โหลดจาก cache ก่อน)
let cards = [], idx = 0, flipped = false, nCorrect = 0; // สถานะของหน้าทบทวนการ์ด (flashcards)
let placementLevel = null;           // ผลลัพธ์ระดับที่ได้จากแบบทดสอบวัดระดับ (ก่อนสมัครสมาชิก)
let placementIdx = 0, placementScore = 0; // ตำแหน่งคำถามปัจจุบัน และคะแนนสะสมของแบบทดสอบวัดระดับ
let progressTab = 'overview';        // แท็บที่กำลังเลือกอยู่ในหน้าความก้าวหน้า (ยังไม่ถูกใช้งานจริงในโค้ดนี้)
let learnLevel = 1, learnLevelWords = [], learnRoundNum = 1, learnRoundWords = [], learnWordIdx = 0, learnCorrect = 0; // สถานะของหน้าเรียนรู้/ฝึกออกเสียง
let lastTickTs = null;               // เวลาล่าสุดที่นับเวลาเรียน (ใช้คำนวณ delta นาที)
let SPEECH_RATE = 0.8;               // ความเร็วเสียงพูด (ค่าเริ่มต้น จะถูก override โดย applyPrefs)
 
// ลำดับระดับ CEFR ทั้งหมดที่ระบบรองรับ
const CEFR_LEVELS = ['A1','A2','B1','B2','C1','C2'];
 
// คำศัพท์ที่ใช้ในแบบทดสอบวัดระดับเริ่มต้น พร้อม level อ้างอิง (0=ง่ายสุด, 4=ยากสุด)
const PLACEMENT_WORDS = [
  {word:'cat', level:0}, {word:'water', level:0},     // คำระดับง่าย (A1)
  {word:'achieve', level:2}, {word:'improve', level:2}, // คำระดับกลาง (B1)
  {word:'sophisticated', level:4}                      // คำระดับยาก (C1)
];
 
// ฐานข้อมูลคำศัพท์ทั้งหมดของแอป แบ่งเป็น 5 เลเวล (array of arrays)
const LEARN_LEVELS = [
  // เลเวล 1 (A1): คำศัพท์พื้นฐานที่สุด 20 คำ พร้อมคำแปลไทย
  [ {word:'cat',th:'แมว'},{word:'dog',th:'สุนัข'},{word:'apple',th:'แอปเปิล'},{word:'water',th:'น้ำ'},{word:'happy',th:'มีความสุข'},
    {word:'book',th:'หนังสือ'},{word:'run',th:'วิ่ง'},{word:'jump',th:'กระโดด'},{word:'red',th:'สีแดง'},{word:'blue',th:'สีฟ้า'},
    {word:'big',th:'ใหญ่'},{word:'small',th:'เล็ก'},{word:'sun',th:'พระอาทิตย์'},{word:'moon',th:'พระจันทร์'},{word:'house',th:'บ้าน'},
    {word:'tree',th:'ต้นไม้'},{word:'fish',th:'ปลา'},{word:'bird',th:'นก'},{word:'milk',th:'นม'},{word:'bread',th:'ขนมปัง'} ],
  // เลเวล 2 (A2): คำศัพท์ระดับกลาง-ต้น 20 คำ
  [ {word:'school',th:'โรงเรียน'},{word:'teacher',th:'ครู'},{word:'friend',th:'เพื่อน'},{word:'family',th:'ครอบครัว'},{word:'kitchen',th:'ห้องครัว'},
    {word:'garden',th:'สวน'},{word:'weather',th:'สภาพอากาศ'},{word:'morning',th:'เช้า'},{word:'evening',th:'เย็น'},{word:'hungry',th:'หิว'},
    {word:'thirsty',th:'กระหายน้ำ'},{word:'tired',th:'เหนื่อย'},{word:'exciting',th:'น่าตื่นเต้น'},{word:'dangerous',th:'อันตราย'},{word:'expensive',th:'แพง'},
    {word:'cheap',th:'ถูก'},{word:'borrow',th:'ยืม'},{word:'return',th:'คืน'},{word:'remember',th:'จำ'},{word:'forget',th:'ลืม'} ],
  // เลเวล 3 (B1): คำศัพท์ระดับกลาง 20 คำ
  [ {word:'achieve',th:'บรรลุ, ประสบความสำเร็จ'},{word:'improve',th:'พัฒนา, ปรับปรุง'},{word:'decide',th:'ตัดสินใจ'},{word:'compare',th:'เปรียบเทียบ'},{word:'describe',th:'บรรยาย'},
    {word:'explain',th:'อธิบาย'},{word:'imagine',th:'จินตนาการ'},{word:'suggest',th:'แนะนำ'},{word:'opinion',th:'ความคิดเห็น'},{word:'environment',th:'สิ่งแวดล้อม'},
    {word:'condition',th:'เงื่อนไข, สภาพ'},{word:'opportunity',th:'โอกาส'},{word:'experience',th:'ประสบการณ์'},{word:'responsible',th:'มีความรับผิดชอบ'},{word:'confident',th:'มั่นใจ'},
    {word:'generous',th:'ใจกว้าง'},{word:'patient',th:'อดทน'},{word:'curious',th:'อยากรู้อยากเห็น'},{word:'ancient',th:'โบราณ'},{word:'modern',th:'ทันสมัย'} ],
  // เลเวล 4 (B2): คำศัพท์ระดับสูงขึ้น 20 คำ
  [ {word:'sophisticated',th:'ซับซ้อน, ประณีต'},{word:'significant',th:'มีนัยสำคัญ'},{word:'essential',th:'จำเป็นอย่างยิ่ง'},{word:'considerable',th:'มากพอสมควร'},{word:'potential',th:'ศักยภาพ'},
    {word:'inevitable',th:'หลีกเลี่ยงไม่ได้'},{word:'controversial',th:'เป็นที่ถกเถียง'},{word:'ambiguous',th:'คลุมเครือ'},{word:'coincidence',th:'ความบังเอิญ'},{word:'phenomenon',th:'ปรากฏการณ์'},
    {word:'hypothesis',th:'สมมติฐาน'},{word:'perspective',th:'มุมมอง'},{word:'sustainable',th:'ยั่งยืน'},{word:'versatile',th:'อเนกประสงค์'},{word:'meticulous',th:'พิถีพิถัน'},
    {word:'pragmatic',th:'เชิงปฏิบัติ'},{word:'resilient',th:'ยืดหยุ่น, ฟื้นตัวไว'},{word:'tangible',th:'จับต้องได้'},{word:'ubiquitous',th:'พบเห็นได้ทั่วไป'},{word:'plausible',th:'เป็นไปได้, น่าเชื่อถือ'} ],
  // เลเวล 5 (C1): คำศัพท์ระดับยากที่สุด 20 คำ
  [ {word:'serendipity',th:'โชคช่วยโดยบังเอิญ'},{word:'ephemeral',th:'ชั่วครู่ชั่วยาม'},{word:'quintessential',th:'เป็นแบบฉบับที่สุด'},{word:'idiosyncratic',th:'เป็นเอกลักษณ์เฉพาะตัว'},{word:'juxtaposition',th:'การวางเคียงกัน'},
    {word:'paradigm',th:'กรอบความคิด'},{word:'ostentatious',th:'โอ้อวด'},{word:'cacophony',th:'เสียงอึกทึกไม่ประสาน'},{word:'ubiquity',th:'การมีอยู่ทุกหนแห่ง'},{word:'magnanimous',th:'ใจกว้าง, มีเมตตา'},
    {word:'perfunctory',th:'ทำแบบขอไปที'},{word:'surreptitious',th:'แอบทำอย่างลับๆ'},{word:'vicissitude',th:'ความผันผวนของชีวิต'},{word:'ineffable',th:'ไม่อาจบรรยายได้'},{word:'obfuscate',th:'ทำให้สับสน คลุมเครือ'},
    {word:'recalcitrant',th:'ดื้อรั้น'},{word:'sycophant',th:'คนประจบสอพลอ'},{word:'insidious',th:'ร้ายกาจแบบแอบแฝง'},{word:'equanimity',th:'ความสงบใจ'},{word:'punctilious',th:'พิถีพิถันเรื่องระเบียบ'} ]
];
 
// คะแนนขั้นต่ำที่ต้องได้ (จาก 20 ข้อ) เพื่อผ่านเลเวลและปลดล็อกเลเวลถัดไป
const PASS_THRESHOLD = 14;
// จำนวนคำต่อรอบในการฝึกออกเสียง (แต่ละเลเวลมี 2 รอบ รอบละ 10 คำ = 20 คำ)
const WORDS_PER_ROUND = 10;
 
/* ================= Persistence helpers ================= */
// บันทึกข้อมูล user object ปัจจุบันลง localStorage (เป็น cache)
function saveUser() {
  // แปลง user เป็น JSON string แล้วเก็บลง localStorage คีย์ 'alicorn_user'
  try { localStorage.setItem('alicorn_user', JSON.stringify(user)); }
  // ถ้าบันทึกไม่สำเร็จ (เช่น storage เต็มหรือถูกปิด) ให้แจ้งเตือนผู้ใช้ด้วย toast
  catch (e) { console.error('Save failed', e); toast('⚠️ ไม่สามารถบันทึกข้อมูลได้ในอุปกรณ์นี้'); }
}
 
// คืนค่าวันที่ปัจจุบันในรูปแบบ YYYY-MM-DD
function todayStr() { return new Date().toISOString().slice(0, 10); }
// คืนค่าวันที่ย้อนหลัง n วันจากวันนี้ ในรูปแบบ YYYY-MM-DD (ใช้ n ติดลบเพื่อคำนวณวันในอนาคตได้ด้วย)
function daysAgoStr(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
 
/* ================= Stats & streak tracking ================= */
// อัปเดต streak (จำนวนวันต่อเนื่องที่เข้าใช้งาน) โดยอิงเวลาเครื่องผู้ใช้ (ฝั่ง client)
function touchStreak() {
  if (!user) return; // ไม่มี user ล็อกอินอยู่ ก็ไม่ต้องทำอะไร
  // ถ้ายังไม่มี object stats ให้สร้างค่าเริ่มต้นขึ้นมา
  if (!user.stats) user.stats = { streak: 0, lastActiveDate: null, daily: {} };
  const today = todayStr(); // วันนี้ตามรูปแบบ YYYY-MM-DD
  // ถ้าวันนี้เคย touch ไปแล้ว ไม่ต้องทำซ้ำ (กัน streak เพิ่มซ้ำในวันเดียวกัน)
  if (user.stats.lastActiveDate === today) return;
  const yesterday = daysAgoStr(1); // คำนวณวันเมื่อวาน
  // ถ้าวันที่ active ล่าสุดคือเมื่อวาน ให้ streak +1 (ต่อเนื่อง), ถ้าไม่ใช่ให้ reset เป็น 1
  user.stats.streak = (user.stats.lastActiveDate === yesterday) ? (user.stats.streak || 0) + 1 : 1;
  user.stats.lastActiveDate = today; // อัปเดตวันที่ active ล่าสุดเป็นวันนี้
  saveUser(); // บันทึกการเปลี่ยนแปลงลง localStorage
}
 
// เวอร์ชันที่ให้เซิร์ฟเวอร์เป็นผู้ตัดสิน (กันกรณีเปิดเครื่องอื่นแล้วนาฬิกาเครื่องไม่ตรงกัน)
async function touchStreakServer() {
  if (!user) return; // ไม่มี user ก็ข้าม
  try {
    // เรียก endpoint POST /users/:id/streak ให้ server คำนวณ streak ที่ถูกต้อง
    const result = await apiSend('POST', `/users/${user.id}/streak`, {});
    user.stats.streak = result.streak;               // อัปเดต streak จากผลลัพธ์ server
    user.stats.lastActiveDate = result.lastActiveDate; // อัปเดตวันที่ active ล่าสุดจาก server
    saveUser(); // บันทึกทับ cache ในเครื่อง
  } catch (e) { console.warn('ซิงก์ streak ไม่สำเร็จ:', e.message); } // ถ้า error แค่ warn ไม่กระทบ UI
}
 
// ดึงข้อมูลล่าสุดจากฐานข้อมูลมาทับ cache ในเครื่อง (เผื่อมีการแก้ไขจากที่อื่น)
async function hydrateFromServer() {
  if (!user) return; // ไม่มี user ก็ไม่ต้อง sync
  try {
    // ดึงข้อมูล user ล่าสุดทั้งหมดจาก server ตาม id
    const fresh = await apiGet(`/users/${user.id}`);
    user = fresh;        // แทนที่ user ในเครื่องด้วยข้อมูลสดจาก server
    saveUser();           // บันทึกลง cache
    applyPrefs();         // apply การตั้งค่าที่อาจเปลี่ยนไป (font, speech rate ฯลฯ)
    // ถ้าหน้าปัจจุบันเป็นหน้า nav ที่มีปุ่ม active อยู่ (แปลว่าอยู่ในแอปแล้ว) ให้ refresh หน้า dashboard
    if (document.querySelector('.navitem.active span')) showDash();
  } catch (e) { console.warn('ดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์ไม่สำเร็จ:', e.message); } // ถ้าดึงไม่ได้ก็ใช้ cache เดิมต่อไป
}
 
// ตรวจสอบ/สร้าง record สถิติของวันนี้ ถ้ายังไม่มีให้สร้างค่าเริ่มต้น แล้วคืนค่า record นั้น
function ensureTodayRecord() {
  if (!user) return null; // ไม่มี user ก็ไม่มี record ให้คืน
  // ถ้ายังไม่มี stats ให้สร้างโครงสร้างเริ่มต้น
  if (!user.stats) user.stats = { streak: 0, lastActiveDate: null, daily: {} };
  const today = todayStr(); // วันที่วันนี้
  // ถ้ายังไม่มี record ของวันนี้ ให้สร้างค่าเริ่มต้น (ศึกษา 0, ถูก 0, นาที 0)
  if (!user.stats.daily[today]) user.stats.daily[today] = { studied: 0, correct: 0, minutes: 0 };
  return user.stats.daily[today]; // คืนค่า record ของวันนี้
}
 
// นับเวลาที่ใช้เรียน (เรียกเมื่อมีการโต้ตอบ เช่น ตอบการ์ด/ออกเสียง) โดยคำนวณ delta เวลาจากครั้งก่อนหน้า
function tickMinutes() {
  if (!user) return; // ไม่มี user ก็ไม่ต้องนับเวลา
  const rec = ensureTodayRecord(); // เอา record ของวันนี้มา (สร้างถ้ายังไม่มี)
  const now = Date.now(); // เวลาปัจจุบัน (timestamp)
  let delta = 0; // ตัวแปรเก็บระยะเวลาที่ผ่านไปเป็นนาที
  // ถ้ามีการ tick ครั้งก่อนหน้า ให้คำนวณส่วนต่างเวลาเป็นนาที แต่ไม่เกิน 5 นาที (กันกรณีทิ้งหน้าไว้นาน)
  if (lastTickTs) delta = Math.min((now - lastTickTs) / 60000, 5);
  lastTickTs = now; // อัปเดตเวลาที่ tick ล่าสุดเป็นตอนนี้
  rec.minutes += delta; // บวกเวลาที่ผ่านไปเข้า record ของวันนี้
  saveUser(); // บันทึกลง cache ในเครื่อง
  // ถ้ามีเวลาผ่านไปจริง (delta > 0) ให้ sync ขึ้น server แบบไม่รอผล (เงียบๆ)
  if (delta > 0) syncQuiet(apiSend('POST', `/users/${user.id}/progress`, { minutesDelta: delta }));
}
 
// บันทึกผลการตอบคำถามหนึ่งข้อ (ถูก/ผิด) ทั้งใน local record และ sync ขึ้น server
function recordAnswer(correct) {
  if (!user) return; // ไม่มี user ก็ข้าม
  const rec = ensureTodayRecord(); // record ของวันนี้
  rec.studied++; // นับจำนวนข้อที่ศึกษาเพิ่ม 1
  if (correct) rec.correct++; // ถ้าตอบถูกให้เพิ่มจำนวนข้อที่ถูกด้วย
  saveUser(); // บันทึก cache ในเครื่อง
  // sync ผลลัพธ์ขึ้น server แบบไม่บล็อก UI (studiedDelta และ correctDelta ตามผลลัพธ์)
  syncQuiet(apiSend('POST', `/users/${user.id}/progress`, { studiedDelta: 1, correctDelta: correct ? 1 : 0 }));
}
 
// สรุปสถิติสำหรับหน้า dashboard: นาทีวันนี้, streak, ความแม่นยำเฉลี่ย 7 วัน
function statsSummary() {
  // ถ้าไม่มี user หรือ stats ให้คืนค่าเริ่มต้นเป็น 0 ทั้งหมด
  if (!user || !user.stats) return { minutesToday: 0, streak: 0, accuracy: 0 };
  const today = ensureTodayRecord() || { minutes: 0 }; // record ของวันนี้ (fallback เป็น minutes:0)
  let studied = 0, correct = 0; // ตัวแปรสะสมยอดศึกษาและยอดถูกใน 7 วันย้อนหลัง
  // วนลูป 7 วันย้อนหลัง (รวมวันนี้) เพื่อรวมยอด studied/correct
  for (let i = 0; i < 7; i++) {
    const rec = user.stats.daily[daysAgoStr(i)]; // record ของวันที่ i วันก่อน
    if (rec) { studied += rec.studied; correct += rec.correct; } // ถ้ามี record ให้บวกเข้าผลรวม
  }
  return {
    minutesToday: Math.round(today.minutes || 0), // ปัดเศษนาทีวันนี้เป็นจำนวนเต็ม
    streak: user.stats.streak || 0,                // จำนวนวันต่อเนื่อง
    accuracy: studied > 0 ? Math.round((correct / studied) * 100) : 0 // % ความแม่นยำ (กันหารด้วย 0)
  };
}
 
// สรุปสถิติรายสัปดาห์ (7 วันย้อนหลัง) สำหรับหน้าความก้าวหน้า: นาทีรวม และความแม่นยำเฉลี่ย
function weeklyStats() {
  if (!user || !user.stats) return { minutes: 0, accuracy: 0 }; // ไม่มีข้อมูลให้คืนค่า default
  let minutes = 0, studied = 0, correct = 0; // ตัวแปรสะสม
  // วนลูป 7 วันย้อนหลังเพื่อรวมนาที, จำนวนศึกษา, จำนวนถูก
  for (let i = 0; i < 7; i++) {
    const rec = user.stats.daily[daysAgoStr(i)];
    if (rec) { minutes += rec.minutes || 0; studied += rec.studied || 0; correct += rec.correct || 0; }
  }
  // คืนค่านาทีรวม (ปัดเศษ) และ % ความแม่นยำเฉลี่ย
  return { minutes: Math.round(minutes), accuracy: studied > 0 ? Math.round((correct / studied) * 100) : 0 };
}
 
// แปลงจำนวนนาทีเป็นข้อความอ่านง่าย เช่น "1 ชั่วโมง 30 นาที" หรือ "45 นาที"
function formatMinutes(m) {
  const h = Math.floor(m / 60), mm = m % 60; // แยกเป็นชั่วโมงและนาทีที่เหลือ
  return h > 0 ? `${h} ชั่วโมง ${mm} นาที` : `${mm} นาที`; // ถ้ามีชั่วโมงให้แสดงทั้งคู่ ไม่งั้นแสดงแค่นาที
}
 
// คำนวณระดับ CEFR ปัจจุบันของผู้ใช้ จาก unlockedLevel (เลเวลที่ปลดล็อกแล้ว)
function currentCefr() {
  // แปลง unlockedLevel (1-based) เป็น index ใน CEFR_LEVELS โดยไม่ให้เกินขอบเขตของ array
  const idx = Math.min((user?.unlockedLevel || 1) - 1, CEFR_LEVELS.length - 1);
  return CEFR_LEVELS[idx]; // คืนค่าระดับ CEFR ที่ตรงกับ index นั้น
}
 
/* ================= Accessibility preferences ================= */
// นำการตั้งค่าการเข้าถึง (accessibility) ของผู้ใช้มา apply กับหน้าเว็บจริง
function applyPrefs() {
  const prefs = user?.prefs || {}; // ดึง prefs ของ user หรือ object ว่างถ้าไม่มี
  // เปิด/ปิด class 'ld-font' ที่ body ตามค่า ldFont (ใช้ฟอนต์ที่อ่านง่ายสำหรับ LD)
  document.body.classList.toggle('ld-font', !!prefs.ldFont);
  // ตั้งค่า CSS variable --font-scale ตามค่าที่ผู้ใช้เลือก (default 1 = ปกติ)
  document.documentElement.style.setProperty('--font-scale', prefs.fontScale || 1);
  // ตั้งความเร็วเสียงพูด: ใช้ค่าที่ผู้ใช้ตั้งไว้ หรือ default ตามว่าเป็นผู้เรียน LD หรือไม่
  SPEECH_RATE = prefs.speechRate || (user?.isLd ? 0.7 : 0.85);
}
 
// สลับเปิด/ปิดฟอนต์อ่านง่าย (LD font) และบันทึก + sync ขึ้น server
function toggleLdFont() {
  if (!user) return; // ต้อง login ก่อน
  user.prefs = user.prefs || {}; // สร้าง prefs ถ้ายังไม่มี
  user.prefs.ldFont = !user.prefs.ldFont; // สลับค่า true/false
  saveUser(); applyPrefs(); showProfile(); // บันทึก, apply การเปลี่ยนแปลง, render หน้าโปรไฟล์ใหม่
  syncQuiet(apiSend('PATCH', `/users/${user.id}`, { prefs: user.prefs })); // sync prefs ขึ้น server แบบเงียบ
}
 
// ตั้งค่าขนาดตัวอักษร (font scale) ตามที่ผู้ใช้เลือก
function setFontScale(scale) {
  if (!user) return; // ต้อง login ก่อน
  user.prefs = user.prefs || {}; // สร้าง prefs ถ้ายังไม่มี
  user.prefs.fontScale = scale; // เก็บค่า scale ที่เลือก
  saveUser(); applyPrefs(); showProfile(); // บันทึก, apply, render หน้าโปรไฟล์ใหม่
  syncQuiet(apiSend('PATCH', `/users/${user.id}`, { prefs: user.prefs })); // sync ขึ้น server
}
 
// ตั้งค่าความเร็วเสียงอ่าน (speech rate) ตามที่ผู้ใช้เลือก
function setSpeechRate(rate) {
  if (!user) return; // ต้อง login ก่อน
  user.prefs = user.prefs || {}; // สร้าง prefs ถ้ายังไม่มี
  user.prefs.speechRate = rate; // เก็บค่าความเร็วที่เลือก
  saveUser(); applyPrefs(); showProfile(); // บันทึก, apply, render หน้าโปรไฟล์ใหม่
  syncQuiet(apiSend('PATCH', `/users/${user.id}`, { prefs: user.prefs })); // sync ขึ้น server
}
 
/* ================= Vocabulary bank & spaced repetition ================= */
// ข้อมูลคำศัพท์ที่ถูกเตรียมไว้ล่วงหน้าอย่างละเอียด (คำอ่าน, ตัวอย่างประโยค, emoji) สำหรับคำยอดนิยม
const CURATED = {
  apple: { phonetic: '/æp.əl/', exampleSentence: 'I eat an apple.', exampleTranslation: 'ฉันกินแอปเปิล', emoji: '🍎' },
  cat:   { phonetic: '/kæt/', exampleSentence: 'The cat sleeps.', exampleTranslation: 'แมวนอนหลับ', emoji: '🐱' },
  dog:   { phonetic: '/dɒɡ/', exampleSentence: 'My dog plays.', exampleTranslation: 'สุนัขของฉันเล่น', emoji: '🐶' },
  happy: { phonetic: '/hæp.i/', exampleSentence: 'I am happy.', exampleTranslation: 'ฉันมีความสุข', emoji: '😊' },
  water: { phonetic: '/wɔː.tər/', exampleSentence: 'Drink water.', exampleTranslation: 'ดื่มน้ำ', emoji: '💧' }
};
 
// ตารางจับคู่คำศัพท์กับ emoji ที่เหมาะสม (สำหรับคำที่ไม่ได้อยู่ใน CURATED)
const EMOJI_MAP = {
  book:'📖', run:'🏃', jump:'🤸', red:'🟥', blue:'🟦', big:'🐘', small:'🐜', sun:'☀️', moon:'🌙',
  house:'🏠', tree:'🌳', fish:'🐟', bird:'🐦', milk:'🥛', bread:'🍞', school:'🏫', teacher:'👩‍🏫',
  friend:'🧑‍🤝‍🧑', family:'👨‍👩‍👧', kitchen:'🍳', garden:'🌷', weather:'⛅', morning:'🌅', evening:'🌆',
  hungry:'🍽️', thirsty:'🥤', tired:'😴', exciting:'🎉', dangerous:'⚠️', expensive:'💰', cheap:'🏷️',
  borrow:'🤝', return:'↩️', remember:'🧠', forget:'💭'
};
// รายชื่อ emoji สำรองสำหรับคำนามธรรม/คำที่ไม่มีใน EMOJI_MAP (เลือกแบบสุ่มคงที่ตามตัวอักษรของคำ)
const ABSTRACT_EMOJIS = ['💡','🎯','📊','🧩','🔍','✨','📌'];
 
// หา emoji ที่เหมาะสมกับคำศัพท์ที่กำหนด
function emojiFor(word) {
  if (EMOJI_MAP[word]) return EMOJI_MAP[word]; // ถ้ามีใน EMOJI_MAP ให้ใช้ค่านั้นเลย
  // ถ้าไม่มี ให้คำนวณ hash ง่ายๆ จากตัวอักษรของคำ เพื่อเลือก emoji จาก ABSTRACT_EMOJIS แบบ deterministic
  let h = 0; for (const c of word) h = (h * 31 + c.charCodeAt(0)) % ABSTRACT_EMOJIS.length;
  return ABSTRACT_EMOJIS[h]; // คืน emoji ที่เลือกได้
}
 
// สร้างข้อมูลการ์ดคำศัพท์แบบเต็ม (รวมคำแปล, คำอ่าน, ตัวอย่างประโยค, emoji) จากคำศัพท์ดิบ w
function buildCardData(w) {
  const c = CURATED[w.word]; // เช็คว่ามีข้อมูลที่เตรียมไว้ล่วงหน้าหรือไม่
  if (c) return { word: w.word, th: w.th, ...c }; // ถ้ามีให้รวมข้อมูล curated เข้าไปด้วย
  // ถ้าไม่มีข้อมูล curated ให้สร้างข้อมูล fallback: ไม่มี phonetic, ใช้ emoji จาก emojiFor, ตัวอย่างประโยคทั่วไป
  return {
    word: w.word, th: w.th, phonetic: '', emoji: emojiFor(w.word),
    exampleSentence: `Try to use "${w.word}" in your own sentence!`,
    exampleTranslation: `ลองแต่งประโยคด้วยคำว่า "${w.th}" ดูสิ!`
  };
}
 
// รวบรวมคำศัพท์ทั้งหมดตั้งแต่เลเวล 1 จนถึงเลเวลที่กำหนด (level) เข้าเป็น pool เดียว
function vocabUpTo(level) {
  const pool = []; // array เก็บผลลัพธ์
  // วนลูปตั้งแต่เลเวล 0 ถึง level-1 (index แบบ 0-based) แล้วดึงคำศัพท์ของแต่ละเลเวลมาใส่ pool
  for (let i = 0; i < level; i++) LEARN_LEVELS[i].forEach(w => pool.push(w));
  return pool; // คืนค่า pool คำศัพท์ทั้งหมดที่ปลดล็อกแล้ว
}
 
// หาคำศัพท์ที่ "ถึงกำหนดทบทวน" ตามระบบ spaced repetition (SRS) จำกัดจำนวนตาม limit
function dueWords(limit = 20) {
  if (!user) return []; // ไม่มี user ก็ไม่มีคำให้ทบทวน
  if (!user.srs) user.srs = {}; // สร้าง object เก็บสถานะ SRS ถ้ายังไม่มี
  const today = todayStr(); // วันที่วันนี้
  const pool = vocabUpTo(user.unlockedLevel || 1); // คำศัพท์ทั้งหมดที่ผู้ใช้ปลดล็อกแล้ว
  const due = [], fresh = []; // due = คำที่ถึงกำหนดทบทวนแล้ว, fresh = คำที่ยังไม่เคยเรียน SRS เลย
  // วนลูปคำศัพท์ทั้งหมดใน pool เพื่อแยกว่าคำไหน due, คำไหน fresh
  pool.forEach(w => {
    const rec = user.srs[w.word]; // ข้อมูล SRS ของคำนี้ (ถ้ามี)
    if (!rec) fresh.push(w);              // ไม่เคยมี record มาก่อน = คำใหม่
    else if (rec.due <= today) due.push(w); // มี record และวันครบกำหนด <= วันนี้ = ถึงกำหนดทบทวน
  });
  let selection = due.slice(0, limit); // เอาคำที่ due ก่อน ไม่เกิน limit
  // ถ้าคำ due ไม่พอ limit ให้เติมด้วยคำใหม่ (fresh) จนครบ limit
  if (selection.length < limit) selection = selection.concat(fresh.slice(0, limit - selection.length));
  return selection; // คืนรายการคำที่จะใช้ทบทวนรอบนี้
}
 
// อัปเดตสถานะ SRS ของคำศัพท์หนึ่งคำ ตามระดับความยาก (rating) ที่ผู้ใช้ประเมินหลังทบทวน
function updateSrs(word, rating) {
  if (!user) return; // ต้อง login ก่อน
  if (!user.srs) user.srs = {}; // สร้าง object SRS ถ้ายังไม่มี
  const rec = user.srs[word] || { interval: 0, reps: 0 }; // ดึง record เดิมของคำนี้ หรือค่าเริ่มต้น
  let interval; // ระยะเวลา (วัน) ก่อนจะครบกำหนดทบทวนครั้งถัดไป
  // ถ้าประเมินว่า "ยาก" ให้ reset จำนวนครั้งที่ทำถูกติดต่อกัน (reps) และตั้ง interval สั้นๆ (1 วัน)
  if (rating === 'Hard') { interval = 1; rec.reps = 0; }
  // ถ้าประเมินว่า "ปานกลาง" ให้เพิ่ม reps และคูณ interval เดิมด้วย 2.0 (หรือเริ่มที่ 3 วันถ้าเป็นครั้งแรก)
  else if (rating === 'Good') { rec.reps = (rec.reps || 0) + 1; interval = rec.interval ? Math.round(rec.interval * 2.0) : 3; }
  // ถ้าประเมินว่า "ง่าย" ให้เพิ่ม reps และคูณ interval เดิมด้วย 2.8 (โตเร็วกว่า) หรือเริ่มที่ 7 วัน
  else { rec.reps = (rec.reps || 0) + 1; interval = rec.interval ? Math.round(rec.interval * 2.8) : 7; }
  interval = Math.min(interval, 60); // จำกัด interval สูงสุดไม่เกิน 60 วัน
  const due = daysAgoStr(-interval); // คำนวณวันครบกำหนดทบทวนถัดไป (อนาคต, ใช้เลขติดลบกับ daysAgoStr)
  user.srs[word] = { interval, reps: rec.reps, due }; // บันทึกสถานะ SRS ใหม่ของคำนี้
  saveUser(); // บันทึกลง cache ในเครื่อง
  // sync สถานะ SRS ขึ้น server แบบไม่บล็อก UI
  syncQuiet(apiSend('PUT', `/users/${user.id}/srs`, { word, interval, reps: rec.reps, due }));
}
 
/* ================= Small UI helpers ================= */
// แสดงข้อความแจ้งเตือนแบบ toast ชั่วคราวที่มุมจอ
function toast(msg) {
  const t = document.createElement('div'); // สร้าง element div ใหม่
  t.className = 'toast'; t.textContent = msg; // ใส่ class และข้อความ
  document.body.appendChild(t); // แปะเข้าไปใน body
  setTimeout(() => t.remove(), 2200); // ลบทิ้งอัตโนมัติหลังจาก 2.2 วินาที
}
 
// ใช้ Web Speech API อ่านออกเสียงคำศัพท์ภาษาอังกฤษที่กำหนด
function speak(w) {
  // ถ้าเบราว์เซอร์ไม่รองรับ speechSynthesis ให้แจ้งเตือนแล้วจบฟังก์ชัน
  if (!('speechSynthesis' in window)) { toast('⚠️ เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง'); return; }
  const u = new SpeechSynthesisUtterance(w); // สร้างคำสั่งอ่านออกเสียงจากคำ w
  u.lang = 'en-US'; u.rate = SPEECH_RATE; // ตั้งภาษาเป็นอังกฤษ (US) และความเร็วตามค่าที่ตั้งไว้
  speechSynthesis.cancel(); speechSynthesis.speak(u); // ยกเลิกเสียงที่กำลังพูดอยู่ (ถ้ามี) แล้วพูดคำใหม่
}
 
// สร้าง HTML ของแถบเมนูด้านล่าง (bottom navigation) พร้อม highlight เมนูที่ active อยู่
function navBar(active) {
  // รายการเมนูทั้งหมด: key สำหรับเทียบ active, icon, label ภาษาไทย, และฟังก์ชันที่เรียกเมื่อกด
  const items = [
    { key: 'home', icon: '🏠', label: 'หน้าหลัก', fn: 'showDash()' },
    { key: 'study', icon: '🔄', label: 'ทบทวน', fn: 'startStudy()' },
    { key: 'learn', icon: '📗', label: 'เรียนรู้', fn: 'showLearnLevels()' },
    { key: 'stats', icon: '📊', label: 'สถิติ', fn: 'showProgress()' },
    { key: 'me', icon: '👤', label: 'ฉัน', fn: 'showProfile()' }
  ];
  // แปลง items เป็น HTML string, ใส่ class 'active' ให้เมนูที่ key ตรงกับ active ที่ส่งเข้ามา
  return `<div class="navbar">${items.map(i =>
    `<div class="navitem ${i.key === active ? 'active' : ''}" onclick="${i.fn}"><span>${i.icon}</span><small>${i.label}</small></div>`
  ).join('')}</div>`;
}
 
/* ================= Home ================= */
// แสดงหน้าแรก (landing page) ก่อนล็อกอิน พร้อมปุ่มเริ่มทดสอบ/เข้าสู่ระบบ/สมัครสมาชิก
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
// เริ่มแบบทดสอบวัดระดับ: reset ตำแหน่งคำถามและคะแนน แล้ว render คำถามแรก
function startPlacementTest() {
  placementIdx = 0; placementScore = 0; // reset ค่าตั้งต้น
  renderPlacementQuestion(); // แสดงคำถามแรก
}
 
// render หน้าคำถามปัจจุบันของแบบทดสอบวัดระดับ
function renderPlacementQuestion() {
  const q = PLACEMENT_WORDS[placementIdx]; // คำถามปัจจุบันตามตำแหน่ง placementIdx
  const pct = Math.round((placementIdx / PLACEMENT_WORDS.length) * 100); // % ความคืบหน้าของแบบทดสอบ
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
 
// ประมวลผลคำตอบของผู้ใช้ในแบบทดสอบวัดระดับ (known = รู้จักคำนี้หรือไม่)
function answerPlacement(known) {
  // ถ้ารู้จักคำนี้ ให้บวกคะแนนตาม level ของคำ+1 (คำยากยิ่งได้คะแนนเยอะ)
  if (known) placementScore += PLACEMENT_WORDS[placementIdx].level + 1;
  placementIdx++; // ไปคำถามถัดไป
  if (placementIdx >= PLACEMENT_WORDS.length) {
    // ถ้าตอบครบทุกคำถามแล้ว ให้คำนวณระดับ CEFR จากคะแนนรวม (หารด้วย 3 แล้วปัดเศษ, จำกัดไม่เกินขอบเขต array)
    const levelIdx = Math.max(0, Math.min(CEFR_LEVELS.length - 1, Math.round(placementScore / 3)));
    placementLevel = CEFR_LEVELS[levelIdx]; // เก็บระดับที่คำนวณได้
    showPlacementResult(); // แสดงหน้าผลลัพธ์
  } else renderPlacementQuestion(); // ยังไม่ครบ ให้แสดงคำถามถัดไป
}
 
// แสดงหน้าผลลัพธ์ของแบบทดสอบวัดระดับ พร้อมชวนสมัครสมาชิก
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
// แสดงฟอร์มสมัครสมาชิก (reg=true) หรือเข้าสู่ระบบ (reg=false)
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
 
// ประมวลผลการ submit ฟอร์ม auth (สมัครสมาชิกหรือเข้าสู่ระบบ) ผ่าน backend API
async function processAuth(reg) {
  const username = document.getElementById('f_user').value.trim(); // อ่านค่า username/email จากฟอร์ม
  const password = document.getElementById('f_pass').value;         // อ่านค่ารหัสผ่าน
  const fullName = reg ? document.getElementById('f_name').value.trim() : ''; // ชื่อเต็ม (เฉพาะตอนสมัคร)
  const isLd = reg ? document.getElementById('f_ld').checked : false;         // checkbox LD (เฉพาะตอนสมัคร)
 
  // ตรวจสอบข้อมูลเบื้องต้น: ต้องมี username และรหัสผ่านอย่างน้อย 8 ตัวอักษร
  if (!username || password.length < 8) {
    toast('❌ กรุณากรอกข้อมูลให้ครบถ้วน (รหัสผ่านอย่างน้อย 8 ตัวอักษร)');
    return; // หยุดการทำงานถ้าข้อมูลไม่ครบ
  }
 
  const btn = event?.target; // อ้างอิงปุ่มที่ถูกกด (จาก global event object)
  // ปิดปุ่มชั่วคราวและเปลี่ยนข้อความเป็น "กำลังเชื่อมต่อ..." ระหว่างรอ API
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังเชื่อมต่อ...'; }
 
  try {
    // ถ้าเป็นการสมัครสมาชิกให้เรียก /auth/register พร้อมข้อมูลทั้งหมด รวมถึงระดับจากแบบทดสอบ (ถ้ามี)
    const data = reg
      ? await apiSend('POST', '/auth/register', { username, password, fullName, isLd, cefrLevel: placementLevel || 'A1' })
      : await apiSend('POST', '/auth/login', { username, password }); // ถ้า login ให้เรียก /auth/login
    user = data;              // เก็บข้อมูล user ที่ได้จาก server
    saveUser();                // บันทึกลง cache
    placementLevel = null;     // เคลียร์ผลทดสอบวัดระดับชั่วคราว เพราะบันทึกเข้าบัญชีแล้ว
    applyPrefs();               // apply การตั้งค่าของ user คนนี้
    touchStreak();               // อัปเดต streak แบบ local ทันที
    touchStreakServer();         // sync streak กับ server อีกที
    toast(reg ? '🎉 สมัครสมาชิกสำเร็จ!' : '👋 ยินดีต้อนรับกลับมาครับ'); // แจ้งเตือนความสำเร็จ
    showDash(); // ไปหน้า dashboard
  } catch (e) {
    // ถ้าเกิด error ให้แจ้งเตือนข้อความ error พร้อมคำแนะนำเรื่อง backend
    toast('❌ ' + (e.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่าเปิด backend ไว้หรือยัง'));
    // เปิดปุ่มกลับมาใช้งานได้ และคืนข้อความปุ่มเดิม
    if (btn) { btn.disabled = false; btn.textContent = reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'; }
  }
}
 
// ออกจากระบบ: ยืนยันก่อน แล้วล้างข้อมูล user ทั้งหมดออกจาก memory และ localStorage
function logout() {
  if (!confirm('ต้องการออกจากระบบใช่หรือไม่?')) return; // ถ้าผู้ใช้กด "ยกเลิก" ให้หยุด
  user = null; // เคลียร์ตัวแปร user
  localStorage.removeItem('alicorn_user'); // ลบข้อมูลออกจาก localStorage
  applyPrefs(); // reset การตั้งค่าหน้าตาให้กลับเป็นค่า default
  showHome(); // กลับไปหน้าแรก
}
 
/* ================= Dashboard ================= */
// แสดงหน้า dashboard หลัก (หลังล็อกอินแล้ว) พร้อมสรุปสถิติและทางลัดไปหน้าอื่น
function showDash() {
  if (!user) { showHome(); return; } // ถ้ายังไม่ล็อกอิน ให้ไปหน้าแรกแทน
  const s = statsSummary(); // ดึงสรุปสถิติ (นาทีวันนี้, streak, ความแม่นยำ)
  const due = dueWords(20).length; // จำนวนคำที่ต้องทบทวนวันนี้ (สูงสุด 20)
  // % ความก้าวหน้าโดยรวมของหลักสูตร คำนวณจากเลเวลที่ปลดล็อกแล้วเทียบกับเลเวลทั้งหมด
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
// แสดงหน้าโปรไฟล์: ข้อมูลผู้ใช้ + การตั้งค่าการเข้าถึง (LD) + ปุ่มออกจากระบบ
function showProfile() {
  if (!user) { showHome(); return; } // ต้องล็อกอินก่อนถึงจะเข้าหน้านี้ได้
  const fs = user.prefs?.fontScale || 1;              // ขนาดฟอนต์ปัจจุบัน (default 1)
  const rate = user.prefs?.speechRate ?? SPEECH_RATE;  // ความเร็วเสียงปัจจุบัน (fallback เป็นค่า global)
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
// เริ่มเซสชันทบทวนคำศัพท์ (flashcards) โดยดึงคำที่ถึงกำหนดทบทวนจากระบบ SRS
async function startStudy() {
  if (!user) { showAuth(false); return; } // ต้องล็อกอินก่อน ไม่งั้นพาไปหน้า login
  const words = dueWords(20);          // ดึงคำที่ต้องทบทวนวันนี้ (สูงสุด 20 คำ)
  cards = words.map(buildCardData);    // แปลงคำดิบเป็นข้อมูลการ์ดแบบเต็ม
  idx = 0; nCorrect = 0;               // reset ตำแหน่งการ์ดปัจจุบันและจำนวนที่ตอบถูก
  lastTickTs = Date.now();             // เริ่มจับเวลาเซสชันนี้
  if (cards.length === 0) { renderStudyEmpty(); return; } // ถ้าไม่มีคำให้ทบทวนเลย ให้แสดงหน้าว่าง
  renderCard(); // แสดงการ์ดใบแรก
}
 
// แสดงหน้าเมื่อไม่มีคำศัพท์ให้ทบทวนแล้ว (ทบทวนหมดแล้ววันนี้)
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
 
// แสดงการ์ดคำศัพท์ปัจจุบัน (ด้านหน้า = คำศัพท์, ด้านหลัง = คำแปล/ตัวอย่าง) พร้อมปุ่มประเมินความยาก
function renderCard() {
  flipped = false; // reset สถานะการพลิกการ์ดทุกครั้งที่แสดงการ์ดใหม่
  const c = cards[idx]; // ข้อมูลการ์ดปัจจุบันตามตำแหน่ง idx
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
      <button class="rate r2" onclick="rate('Medium')">😊 ปานกลาง</button>
      <button class="rate r3" onclick="rate('Easy')">😄 ง่าย</button>
    </div>
    ${navBar('study')}`;
}
 
// พลิกการ์ด (แสดงด้านหลัง) เมื่อผู้ใช้แตะการ์ด — ทำได้ครั้งเดียวต่อการ์ด
function flip() {
  if (!flipped) { // ถ้ายังไม่เคยพลิกการ์ดใบนี้
    document.getElementById('fc').classList.add('flipped'); // เพิ่ม class เพื่อ trigger CSS animation พลิกการ์ด
    document.getElementById('rates').style.display = 'flex'; // แสดงปุ่มประเมินความยากหลังพลิกแล้ว
    flipped = true; // ตั้งสถานะว่าพลิกแล้ว กันการพลิกซ้ำ
  }
}
 
// ประมวลผลการประเมินความยากของการ์ด แล้วไปการ์ดถัดไป (หรือจบเซสชัน)
function rate(rating) {
  tickMinutes(); // นับเวลาที่ใช้ไปในการ์ดนี้
  const word = cards[idx].word; // คำศัพท์ของการ์ดปัจจุบัน
  updateSrs(word, rating); // อัปเดตกำหนดการทบทวนครั้งถัดไปตามระบบ SRS
  const correct = rating === 'Good' || rating === 'Easy'; // ถือว่า "ถูก" ถ้าประเมินเป็นปานกลางหรือง่าย
  recordAnswer(correct); // บันทึกผลลัพธ์ลงสถิติ
  if (correct) nCorrect++; // นับจำนวนที่ตอบถูกในเซสชันนี้
  idx++; // เลื่อนไปการ์ดถัดไป
  if (idx >= cards.length) {
    // ถ้าทบทวนครบทุกใบแล้ว ให้แสดงหน้าสรุปผล
    document.getElementById('app').innerHTML = `
      <div style="text-align:center;padding-top:3rem">
        <div style="font-size:5rem">🎉</div>
        <h1>ทบทวนครบแล้ว!</h1>
        <p class="sub">คุณตอบถูก ${nCorrect} / ${cards.length} ใบ</p>
        <button class="btn btn-green" onclick="showDash()">กลับหน้าหลัก</button>
      </div>
      ${navBar('study')}`;
  } else renderCard(); // ยังไม่ครบ ให้แสดงการ์ดถัดไป
}
 
/* ================= Learn & Speaking Test ================= */
// แสดงหน้าเลือกเลเวลของบทเรียนออกเสียง (แสดงสถานะ ล็อก/ผ่านแล้ว/พร้อมเรียน ของแต่ละเลเวล)
function showLearnLevels() {
  if (!user) { showAuth(false); return; } // ต้องล็อกอินก่อน
  const unlocked = user.unlockedLevel || 1; // เลเวลสูงสุดที่ปลดล็อกแล้ว (default 1)
  // สร้าง HTML การ์ดของแต่ละเลเวล โดยเช็คสถานะ ล็อก/ผ่านแล้ว/ปัจจุบัน
  const grid = LEARN_LEVELS.map((_, i) => {
    const lvl = i + 1; // เลข level แบบ 1-based
    const locked = lvl > unlocked; // ล็อกอยู่ถ้าเลเวลนี้สูงกว่าที่ปลดล็อกแล้ว
    const passed = lvl < unlocked; // ผ่านแล้วถ้าเลเวลนี้ต่ำกว่าที่ปลดล็อกปัจจุบัน
    const cls = locked ? 'locked' : passed ? 'completed' : ''; // class CSS ตามสถานะ
    const numDisplay = locked ? '🔒' : passed ? '✅' : lvl; // ตัวเลข/ไอคอนที่แสดงตามสถานะ
    // ถ้าล็อกอยู่จะไม่มี onclick (กดไม่ได้), ถ้าไม่ล็อกจะเรียก startLearnLevel(lvl)
    return `<div class="lvl-card ${cls}" onclick="${locked ? '' : `startLearnLevel(${lvl})`}">
      <div class="lvl-num">${numDisplay}</div>
      <div class="lvl-tag">${locked ? 'ยังไม่ปลดล็อก' : `เลเวล ${lvl} · ${CEFR_LEVELS[i]}`} (20 ข้อ)</div>
    </div>`;
  }).join(''); // รวม HTML ของทุกเลเวลเข้าด้วยกัน
 
  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <button class="back-btn" onclick="showDash()">←</button>
      <h1>บทเรียนออกเสียง 📗</h1>
    </div>
    <p class="sub" style="text-align:left">ทดสอบพูดออกเสียง 20 ข้อ ผ่านเกณฑ์ 70% (14 ข้อขึ้นไป) เพื่อปลดล็อกเลเวลถัดไป</p>
    <div class="lvl-grid">${grid}</div>
    ${navBar('learn')}`;
}
 
// เริ่มเลเวลการฝึกออกเสียงที่เลือก: เตรียมคำศัพท์ของรอบแรก และ reset สถานะ
function startLearnLevel(level) {
  learnLevel = level; // เก็บเลเวลที่กำลังเรียน
  learnLevelWords = LEARN_LEVELS[level - 1]; // คำศัพท์ทั้ง 20 คำของเลเวลนี้ (index 0-based)
  learnRoundNum = 1; // เริ่มที่รอบ 1 (จากทั้งหมด 2 รอบ)
  learnRoundWords = learnLevelWords.slice(0, WORDS_PER_ROUND); // คำ 10 คำแรกสำหรับรอบ 1
  learnWordIdx = 0; // เริ่มที่คำแรกของรอบ
  learnCorrect = 0; // reset จำนวนที่พูดถูกของเลเวลนี้
  lastTickTs = Date.now(); // เริ่มจับเวลาเซสชันนี้
  renderLearnWord(); // แสดงคำแรก
}
 
// render หน้าคำศัพท์ปัจจุบันของการฝึกออกเสียง พร้อมปุ่มไมค์และแถบความคืบหน้า
function renderLearnWord() {
  const q = learnRoundWords[learnWordIdx]; // คำศัพท์ปัจจุบันในรอบนี้
  const doneSoFar = (learnRoundNum - 1) * WORDS_PER_ROUND + learnWordIdx; // จำนวนข้อที่ทำไปแล้วทั้งหมด (รวมรอบก่อนหน้า)
  const pct = Math.round((doneSoFar / (WORDS_PER_ROUND * 2)) * 100); // % ความคืบหน้ารวมของทั้งเลเวล (2 รอบ = 20 ข้อ)
 
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
 
// เริ่มการรับฟังเสียงพูดผ่าน Web Speech Recognition API เพื่อตรวจจับว่าผู้ใช้พูดคำที่กำหนดถูกไหม
function startSpeechRecognition(targetWord) {
  // เช็ค constructor ของ SpeechRecognition (รองรับทั้งแบบมาตรฐานและ webkit prefix)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    // ถ้าเบราว์เซอร์ไม่รองรับ ให้แจ้งเตือนแล้ว fallback ไปตัดสินว่าถูกอัตโนมัติหลัง 1 วินาที
    toast('⚠️ เบราว์เซอร์นี้ไม่รองรับการแปลงเสียงพูด');
    setTimeout(() => judgePronunciation(targetWord, targetWord), 1000);
    return;
  }
  const recognition = new SpeechRecognition(); // สร้าง instance ของตัวรู้จำเสียง
  recognition.lang = 'en-US'; // ตั้งภาษาที่จะรู้จำเป็นภาษาอังกฤษ (US)
  recognition.interimResults = false; // ไม่ต้องการผลลัพธ์ระหว่างพูด เอาแค่ผลสุดท้าย
 
  const micBtn = document.getElementById('micBtn'); // อ้างอิงปุ่มไมค์
  micBtn.classList.add('listening'); // เพิ่ม class แสดงสถานะ "กำลังฟัง" (เช่น animation)
  micBtn.disabled = true; // ปิดปุ่มชั่วคราวกันกดซ้ำระหว่างฟัง
  document.getElementById('heardText').textContent = "กำลังฟังเสียงของคุณ..."; // อัปเดตข้อความสถานะ
 
  // เมื่อได้ผลลัพธ์การรู้จำเสียงแล้ว
  recognition.onresult = (e) => {
    const said = e.results[0][0].transcript.trim().toLowerCase(); // ข้อความที่รู้จำได้ (lowercase, ตัดช่องว่าง)
    judgePronunciation(said, targetWord); // นำไปตัดสินว่าถูกหรือผิด
  };
  // เมื่อเกิดข้อผิดพลาดระหว่างรู้จำเสียง (เช่น ไม่มีเสียงเข้ามา)
  recognition.onerror = () => {
    micBtn.classList.remove('listening'); // เอา class listening ออก
    micBtn.disabled = false; // เปิดปุ่มกลับมาใช้งานได้
    document.getElementById('heardText').textContent = "❌ ไม่ได้ยินเสียง ลองใหม่อีกครั้ง"; // แจ้งเตือนผู้ใช้
  };
  // เมื่อการรู้จำเสียงสิ้นสุดลง (ไม่ว่าจะสำเร็จหรือไม่) ให้คืนสถานะปุ่มไมค์กลับปกติ
  recognition.onend = () => { micBtn.classList.remove('listening'); micBtn.disabled = false; };
  recognition.start(); // เริ่มการฟังเสียงจริง
}
 
// ตัดสินว่าคำที่ผู้ใช้พูด (said) ตรงกับคำเป้าหมาย (targetWord) หรือไม่ แล้วอัปเดต UI + สถิติ
function judgePronunciation(said, targetWord) {
  tickMinutes(); // นับเวลาที่ใช้ไป
  // ฟังก์ชันช่วย normalize string: แปลงเป็นตัวพิมพ์เล็กและตัดตัวอักษรที่ไม่ใช่ a-z ออก
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  // ถือว่าถูกถ้าคำใดคำหนึ่ง "มี" อีกคำเป็นส่วนหนึ่งอยู่ (ยืดหยุ่นกว่าการเทียบเท่ากันเป๊ะๆ)
  const isMatch = norm(said).includes(norm(targetWord)) || norm(targetWord).includes(norm(said));
 
  if (isMatch) learnCorrect++; // ถ้าถูก ให้เพิ่มจำนวนที่ตอบถูกของเลเวลนี้
  recordAnswer(isMatch); // บันทึกผลลัพธ์ลงสถิติรวม
  const card = document.getElementById('qCard'); // อ้างอิง card element ปัจจุบัน
  card.className = `q-card ${isMatch ? 'correct' : 'wrong'}`; // เปลี่ยนสี/style ของการ์ดตามผลลัพธ์
  // แสดงข้อความผลลัพธ์: ถ้าถูกบอกว่าได้ยินอะไร, ถ้าผิดบอกทั้งคำที่ถูกและคำที่ได้ยิน
  document.getElementById('heardText').innerHTML = isMatch
    ? `✅ ถูกต้อง! ได้ยินว่า "${said}"`
    : `❌ คำที่ถูกคือ "${targetWord}" (ได้ยิน: "${said}")`;
 
  setTimeout(nextLearnWord, 1500); // รอ 1.5 วินาทีให้ผู้ใช้เห็นผลลัพธ์ แล้วไปคำถัดไปอัตโนมัติ
}
 
// เลื่อนไปคำถัดไปในการฝึกออกเสียง หรือเปลี่ยนรอบ/จบเลเวลถ้าครบแล้ว
function nextLearnWord() {
  learnWordIdx++; // เลื่อนตำแหน่งคำไปข้างหน้า
  if (learnWordIdx < WORDS_PER_ROUND) {
    renderLearnWord(); // ยังไม่ครบรอบ ให้แสดงคำถัดไป
  } else if (learnRoundNum === 1) {
    // ถ้าจบรอบ 1 แล้ว ให้เริ่มรอบ 2 ด้วยคำ 10 คำหลังของเลเวล
    learnRoundNum = 2;
    learnRoundWords = learnLevelWords.slice(WORDS_PER_ROUND, WORDS_PER_ROUND * 2);
    learnWordIdx = 0; // reset ตำแหน่งคำในรอบใหม่
    toast('🔄 จบรอบที่ 1! ไปต่อรอบที่ 2 กัน'); // แจ้งเตือนเปลี่ยนรอบ
    renderLearnWord(); // แสดงคำแรกของรอบ 2
  } else {
    finishLearnLevel(); // จบทั้ง 2 รอบแล้ว ให้สรุปผลของเลเวล
  }
}
 
// สรุปผลการฝึกออกเสียงของเลเวลนี้: ตรวจว่าผ่านไหม, ปลดล็อกเลเวลถัดไปถ้าผ่าน, แสดงผลลัพธ์
function finishLearnLevel() {
  const passed = learnCorrect >= PASS_THRESHOLD; // ผ่านถ้าตอบถูกอย่างน้อย 14 จาก 20 ข้อ
  // ถ้าผ่าน และเลเวลนี้ยังไม่เคยปลดล็อกไกลกว่านี้มาก่อน ให้ปลดล็อกเลเวลถัดไป
  if (passed && user && learnLevel >= (user.unlockedLevel || 1)) {
    user.unlockedLevel = Math.min(LEARN_LEVELS.length, learnLevel + 1); // เพิ่มเลเวลที่ปลดล็อก (ไม่เกินเลเวลสูงสุด)
    user.cefrLevel = currentCefr(); // อัปเดตระดับ CEFR ปัจจุบันตามเลเวลใหม่
    saveUser(); // บันทึกลง cache
    // sync การปลดล็อกเลเวล/ระดับ CEFR ขึ้น server แบบไม่บล็อก UI
    syncQuiet(apiSend('PATCH', `/users/${user.id}`, { unlockedLevel: user.unlockedLevel, cefrLevel: user.cefrLevel }));
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
// แสดงหน้าความก้าวหน้าโดยละเอียด: roadmap ตามระดับ CEFR + สถิติ 7 วันย้อนหลัง
function showProgress(tab) {
  if (!user) { showHome(); return; } // ต้องล็อกอินก่อน
  if (tab) progressTab = tab; // อัปเดตแท็บที่เลือก (ถ้ามีการส่งค่ามา)
  const curIdx = CEFR_LEVELS.indexOf(user.cefrLevel || 'A1'); // ตำแหน่ง index ของระดับ CEFR ปัจจุบัน
  // สร้าง HTML ของ roadmap: ระดับที่ผ่านแล้ว (done), ระดับปัจจุบัน (current), หรือยังไม่ถึง
  const roadmap = CEFR_LEVELS.map((lv, i) => {
    const cls = i < curIdx ? 'done' : i === curIdx ? 'current' : ''; // กำหนด class ตามตำแหน่งเทียบกับ curIdx
    return `<div class="rlevel ${cls}">${lv}</div>`;
  }).join('<div class="rline"></div>'); // คั่นแต่ละระดับด้วยเส้นเชื่อม
 
  const wk = weeklyStats(); // สถิติรวม 7 วันย้อนหลัง (นาที, ความแม่นยำ)
  const s = statsSummary(); // สถิติสรุป (ใช้เอา streak มาแสดง)
 
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
applyPrefs(); // apply การตั้งค่า (font/scale/speech rate) ตั้งแต่ตอนโหลดหน้าเว็บ (ก่อนแม้แต่ล็อกอิน)
// ถ้ามี user ล็อกอินอยู่แล้ว (มาจาก cache ใน localStorage) ให้ sync สถานะต่างๆ กับ server
if (user) {
  touchStreak();       // อัปเดตทันทีจาก cache ในเครื่อง ให้ UI ไม่กระตุก
  touchStreakServer(); // แล้วให้เซิร์ฟเวอร์ยืนยันอีกที (เผื่อนาฬิกาเครื่องไม่ตรง)
  hydrateFromServer(); // ดึงข้อมูลล่าสุดจากฐานข้อมูลมาทับ cache
}
user ? showDash() : showHome(); // ถ้ามี user ให้เข้า dashboard เลย ถ้าไม่มีให้แสดงหน้าแรก