const asyncHandler = require('express-async-handler');
const Student = require('../models/Student');
const ContestRecord = require('../models/ContestRecord');
const { fetchLeetCodeUser, parseStats } = require('../services/leetcode');
const { fetchCodeChefUser } = require('../services/codechef');

async function applySync(student, st) {
  student.leetcode.totalSolved = st.totalSolved;
  student.leetcode.easy = st.easy;
  student.leetcode.medium = st.medium;
  student.leetcode.hard = st.hard;
  student.leetcode.ranking = st.ranking;
  student.leetcode.streak = st.streak;
  student.leetcode.totalActiveDays = st.totalActiveDays;
  student.leetcode.attendedContestsCount = st.attendedContestsCount;
  student.leetcode.contestRating = st.contestRating;
  student.leetcode.contestGlobalRanking = st.contestGlobalRanking;
  student.leetcode.syncedAt = new Date();
  student.leetcode.syncError = '';
  student.leetcode.monthlyActivityCache = st.monthlyActivity;
  student.leetcode.dailyActivityCache = st.dailyActivity;
  student.leetcode.recentAcceptedCache = st.recentAccepted;
  student.lastActivityAt = new Date();
  await student.save();
  for (const c of st.contests) {
    if (!c.date) continue;
    await ContestRecord.updateOne(
      { studentId: student._id, platform: 'leetcode', contestName: c.contestName },
      { $set: { date: c.date, year: c.date.getFullYear(), month: c.date.getMonth() + 1, rank: c.rank, rating: c.rating, attended: true, source: 'leetcode-sync' } },
      { upsert: true }
    );
  }
}

async function applyCodeChefSync(student, cc) {
  student.codechef.totalSolved = cc.totalSolved || 0;
  student.codechef.rating = cc.rating ?? null;
  student.codechef.attendedContestsCount = cc.attendedContestsCount || 0;
  student.codechef.syncedAt = new Date();
  student.codechef.syncError = '';
  student.codechef.monthlyActivityCache = cc.monthlyActivity || {};
  student.codechef.dailyActivityCache = (cc.dailyActivity || []).slice(-365);
  student.lastActivityAt = new Date();
  await student.save();
  for (const c of cc.contests) {
    if (!c.date) continue;
    await ContestRecord.updateOne(
      { studentId: student._id, platform: 'codechef', contestName: c.contestName },
      { $set: { date: c.date, year: c.date.getFullYear(), month: c.date.getMonth() + 1, rank: c.rank, rating: c.rating, score: null, attended: true, source: 'codechef-sync' } },
      { upsert: true }
    );
  }
}

async function syncOneStudent(s) {
  const out = { leetcode: 'skipped', codechef: 'skipped' };
  if (s.leetcodeId) {
    try {
      const st = parseStats(await fetchLeetCodeUser(s.leetcodeId));
      if (!st.exists) throw new Error('LeetCode user not found');
      await applySync(s, st);
      out.leetcode = `ok (${st.totalSolved} solved, ${st.attendedContestsCount} contests)`;
    } catch (e) {
      s.leetcode.syncError = String((e && e.message) || e).slice(0, 200);
      s.leetcode.syncedAt = new Date();
      await s.save();
      out.leetcode = 'failed: ' + s.leetcode.syncError;
    }
  }
  if (s.codechefId) {
    try {
      const cc = await fetchCodeChefUser(s.codechefId);
      if (!cc.exists) throw new Error('CodeChef user not found');
      await applyCodeChefSync(s, cc);
      out.codechef = `ok (${cc.totalSolved} solved, ${cc.attendedContestsCount} contests)`;
    } catch (e) {
      s.codechef.syncError = String((e && e.message) || e).slice(0, 200);
      s.codechef.syncedAt = new Date();
      await s.save();
      out.codechef = 'failed: ' + s.codechef.syncError;
    }
  }
  return out;
}

function registerSyncAndRecordRoutes(router) {
  // POST /api/students/:id/sync — syncs BOTH LeetCode and CodeChef
  router.post('/:id/sync', asyncHandler(async (req, res) => {
    const s = await Student.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Student not found' });
    if (!s.leetcodeId && !s.codechefId) return res.status(400).json({ message: 'No LeetCode/CodeChef username on file' });
    const result = await syncOneStudent(s);
    res.json({ message: 'Sync finished', result });
  }));
}

module.exports = { registerSyncAndRecordRoutes, applySync, applyCodeChefSync, syncOneStudent };
