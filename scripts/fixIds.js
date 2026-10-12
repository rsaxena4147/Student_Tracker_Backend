// One-off correction: applies verified ID fixes (swaps + dead-handle clears).
// Resets stale LeetCode snapshots + synced contests for touched rows.
// Usage: node scripts/fixIds.js
const mongoose = require('mongoose');
const Student = require('../src/models/Student');
const ContestRecord = require('../src/models/ContestRecord');

const CORR = {
  '2400320100216': { lc: 'anmol_1122', cc: 'anmolvats001' },
  '2400320100296': { lc: 'Aryan_yadav32', cc: 'aryanyadav32' },
  '2400320100219': { lc: 'gansh123', cc: 'suave_frogs_49' },
  '2400320100278': { lc: '', cc: 'arpit_1181' },
  '2400320100368': { lc: 'bhumisharma', cc: 'bhumisharma' },
  '2400320100339': { lc: '', cc: 'ayush_k_25' },
  '2400320100298': { lc: 'Aryashi100', cc: 'Aryashi100' },
  '2400320100302': { lc: 'ashishgupta_302', cc: 'ashishgupta_302' },
  '2400320100311': { lc: '', cc: '' },
  '2400320100240': { lc: '', cc: 'anubhav2005cc' },
  '2400320100303': { lc: '', cc: 'ashish20_jz' },
  '2400320100214': { lc: '_anmol_137', cc: '' },
  '2400320100218': { lc: '', cc: '' },
  '2400320230040': { lc: '', cc: 'dhruvb09' },
  '2400320230124': { lc: '', cc: '' },
  '2400320230128': { lc: '', cc: '' },
  '2400320230096': { lc: 'Prerna_019', cc: '' },
};

const FRESH_LC = {
  totalSolved: 0, easy: 0, medium: 0, hard: 0, ranking: null,
  streak: 0, totalActiveDays: 0, contestRating: null,
  contestGlobalRanking: null, attendedContestsCount: 0,
  syncedAt: null, syncError: '', monthlyActivityCache: {},
  dailyActivityCache: [], recentAcceptedCache: [],
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/student_tracker');
  for (const [roll, fix] of Object.entries(CORR)) {
    const s = await Student.findOne({ rollNo: roll });
    if (!s) { console.log(roll, 'NOT FOUND'); continue; }
    const lcChanged = (s.leetcodeId || '') !== fix.lc;
    s.leetcodeId = fix.lc;
    s.codechefId = fix.cc;
    if (lcChanged) {
      s.leetcode = { ...FRESH_LC };
      await ContestRecord.deleteMany({ studentId: s._id, platform: 'leetcode', source: 'leetcode-sync' });
      s.lastActivityAt = null;
    }
    await s.save();
    console.log(`${s.name} | ${roll} | LC=${fix.lc || '(blank)'} CC=${fix.cc || '(blank)'}${lcChanged ? ' [sync reset]' : ''}`);
  }
  await mongoose.disconnect();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
