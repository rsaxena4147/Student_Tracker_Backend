// Sync LeetCode stats for every student that has a LeetCode id.
// Usage: node scripts/syncAll.js
const mongoose = require('mongoose');
const Student = require('../src/models/Student');
const { fetchLeetCodeUser, parseStats } = require('../src/services/leetcode');
const { applySync } = require('../src/routes/studentWrite');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/student_tracker');
  const students = await Student.find({ leetcodeId: { $ne: '' } });
  console.log('TO SYNC:', students.length);
  let ok = 0, fail = 0;
  const conc = 2;
  for (let i = 0; i < students.length; i += conc) {
    await Promise.all(students.slice(i, i + conc).map(async (s) => {
      try {
        const st = parseStats(await fetchLeetCodeUser(s.leetcodeId));
        if (!st.exists) throw new Error('user not found');
        await applySync(s, st);
        ok += 1;
      } catch (e) {
        s.leetcode.syncError = String((e && e.message) || e).slice(0, 200);
        s.leetcode.syncedAt = new Date();
        await s.save();
        fail += 1;
      }
    }));
    console.log(`progress ${Math.min(i + conc, students.length)}/${students.length} ok=${ok} fail=${fail}`);
    await sleep(900);
  }
  console.log(`DONE ok=${ok} fail=${fail}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
