const asyncHandler = require('express-async-handler');
const Student = require('../models/Student');
const ContestRecord = require('../models/ContestRecord');
const SolveRecord = require('../models/SolveRecord');
const { fetchLeetCodeUser, parseStats } = require('./services/leetcode');
const { fetchCodeChefUser } = require('./services/codechef');

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
  // POST /api/students/:id/sync
  router.post('/:id/sync', asyncHandler(async (req, res) => {
    const s = await Student.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Student not found' });
    if (!s.leetcodeId) return res.status(400).json({ message: 'No LeetCode username on file' });
    try {
      const payload = await fetchLeetCodeUser(s.leetcodeId);
      const st = parseStats(payload);
      if (!st.exists) {
        s.leetcode.syncError = 'LeetCode user not found';
        s.leetcode.syncedAt = new Date();
        await s.save();
        return res.status(404).json({ message: 'LeetCode user not found' });
      }
      await applySync(s, st);
      res.json({ message: 'LeetCode synced', stats: { totalSolved: st.totalSolved, contests: st.attendedContestsCount } });
    } catch (e) {
      s.leetcode.syncError = String((e && e.message) || e).slice(0, 300);
      s.leetcode.syncedAt = new Date();
      await s.save();
      res.status(502).json({ message: 'LeetCode sync failed: ' + s.leetcode.syncError });
    }
  }));

  // POST /api/students/:id/records
  router.post('/:id/records', asyncHandler(async (req, res) => {
    const s = await Student.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Student not found' });
    const { kind } = req.body;
    if (kind === 'solve') {
      const { platform, title, problemKey, difficulty = '', solvedAt = null } = req.body;
      if (!['leetcode', 'codechef'].includes(platform)) return res.status(400).json({ message: 'platform must be leetcode|codechef' });
      if (!title && !problemKey) return res.status(400).json({ message: 'title or problemKey required' });
      const key = String(problemKey || title).trim().toLowerCase().replace(/\s+/g, '-');
      const d = solvedAt ? new Date(solvedAt) : null;
      if (solvedAt && Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid solvedAt date' });
      const doc = await SolveRecord.findOneAndUpdate(
        { studentId: s._id, platform, problemKey: key },
        { $set: { title: title || key, difficulty, solvedAt: d, year: d ? d.getFullYear() : null, month: d ? d.getMonth() + 1 : null, source: 'manual' } },
        { upsert: true, new: true }
      );
      return res.status(201).json(doc);
    }
    if (kind === 'contest') {
      const { platform, contestName, date = null, rank = null, score = null, rating = null } = req.body;
      if (!['leetcode', 'codechef'].includes(platform)) return res.status(400).json({ message: 'platform must be leetcode|codechef' });
      if (!contestName) return res.status(400).json({ message: 'contestName required' });
      const d = date ? new Date(date) : null;
      if (date && Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid date' });
      const doc = await ContestRecord.findOneAndUpdate(
        { studentId: s._id, platform, contestName: String(contestName).trim() },
        { $set: { date: d, year: d ? d.getFullYear() : null, month: d ? d.getMonth() + 1 : null, rank, score, rating, attended: true, source: 'manual' } },
        { upsert: true, new: true }
      );
      return res.status(201).json(doc);
    }
    return res.status(400).json({ message: 'kind must be solve|contest' });
  }));
}

module.exports = { registerSyncAndRecordRoutes, applySync, applyCodeChefSync, syncOneStudent };
