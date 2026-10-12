const express = require('express');
const asyncHandler = require('express-async-handler');
const Student = require('../models/Student');
const SolveRecord = require('../models/SolveRecord');
const ContestRecord = require('../models/ContestRecord');
const { buildStudentsWorkbook, safeFileName } = require('../utils/exportExcel');

const router = express.Router();

function monthKey(y, m) { return `${y}-${String(m).padStart(2, '0')}`; }

// GET /api/students/:id/export — Excel for a single student (summary + monthly LC/CC split)
router.get('/:id/export', asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id).populate('classId').lean();
  if (!s) return res.status(404).json({ message: 'Student not found' });
  const groupDef = { _id: { s: '$studentId', p: '$platform', y: '$year', m: '$month' }, n: { $sum: 1 } };
  const solveAgg = await SolveRecord.aggregate([{ $match: { studentId: s._id } }, { $group: groupDef }]);
  const contestAgg = await ContestRecord.aggregate([{ $match: { studentId: s._id } }, { $group: groupDef }]);
  const className = (s.classId && s.classId.name) || 'student';
  const { buffer } = buildStudentsWorkbook({ className, students: [s], solveAgg, contestAgg });
  const filename = safeFileName(`${className} - ${s.name}`) + '.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}));

async function buildStudentPayload(student) {
  const solves = await SolveRecord.find({ studentId: student._id }).lean();
  const contests = await ContestRecord.find({ studentId: student._id }).sort({ date: 1 }).lean();
  const lcKeys = new Set(solves.filter((s) => s.platform === 'leetcode').map((s) => s.problemKey));
  const ccKeys = new Set(solves.filter((s) => s.platform === 'codechef').map((s) => s.problemKey));
  let overlap = 0;
  lcKeys.forEach((k) => { if (ccKeys.has(k)) overlap += 1; });
  const lcRec = solves.filter((s) => s.platform === 'leetcode').length;
  const ccRec = solves.filter((s) => s.platform === 'codechef').length;
  const leetcodeTotal = lcRec + ((student.leetcode && student.leetcode.totalSolved) || 0);
  const codechefTotal = ccRec + (student.codechefSolved || 0) + ((student.codechef && student.codechef.totalSolved) || 0);
  const ccSyncContests = (student.codechef && student.codechef.attendedContestsCount) || 0;
  const contestTotal = contests.length + (student.codechefContests || 0)
    + ((student.leetcode && student.leetcode.attendedContestsCount) || 0) + ccSyncContests;
  const months = {};
  const bump = (d, kind, contest) => {
    if (!d || Number.isNaN(d.getTime())) return;
    const y = d.getFullYear(), m = d.getMonth() + 1;
    const k = monthKey(y, m);
    months[k] = months[k] || { key: k, year: y, month: m, leetcode: 0, codechef: 0, contests: 0, contestList: [] };
    if (kind === 'lc') months[k].leetcode += 1;
    if (kind === 'cc') months[k].codechef += 1;
    if (kind === 'contest') { months[k].contests += 1; if (contest) months[k].contestList.push(contest); }
  };
  solves.forEach((s) => { if (s.solvedAt) bump(new Date(s.solvedAt), s.platform === 'leetcode' ? 'lc' : 'cc'); });
  contests.forEach((c) => { if (c.date) bump(new Date(c.date), 'contest', c); });
  const monthList = Object.values(months).sort((a, b) => (a.key < b.key ? -1 : 1));
  const hasMonthlySolves = solves.some((s) => s.solvedAt);
  return {
    student,
    totals: {
      leetcodeSolved: leetcodeTotal, codechefSolved: codechefTotal,
      combinedSolved: leetcodeTotal + codechefTotal - overlap, overlapDeduped: overlap,
      contests: contestTotal, contestsFromRecords: contests.length,
      leetcodeSyncContests: (student.leetcode && student.leetcode.attendedContestsCount) || 0,
      codechefSyncContests: ccSyncContests,
      codechefRating: (student.codechef && student.codechef.rating) ?? null,
      codechefSyncedAt: (student.codechef && student.codechef.syncedAt) || null,
      codechefSyncError: (student.codechef && student.codechef.syncError) || '',
      codechefManualContests: student.codechefContests || 0,
    },
    monthlyBreakdownAvailable: hasMonthlySolves,
    monthlyBreakdownNote: hasMonthlySolves
      ? 'Monthly question counts are computed from date-stamped solve records only.'
      : 'Cumulative totals only — the imported Excel files contain no per-question dates, so monthly question breakdowns cannot be calculated. Sync LeetCode or add dated solve records to enable monthly charts.',
    months: monthList,
  };
}

// GET /api/students/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id).populate('classId').lean();
  if (!s) return res.status(404).json({ message: 'Student not found' });
  res.json(await buildStudentPayload(s));
}));

// GET /api/students/:id/month/:ym
router.get('/:id/month/:ym', asyncHandler(async (req, res) => {
  const s = await Student.findById(req.params.id).lean();
  if (!s) return res.status(404).json({ message: 'Student not found' });
  const m = /^(\d{4})-(\d{2})$/.exec(req.params.ym || '');
  if (!m) return res.status(400).json({ message: 'Month must be YYYY-MM' });
  const y = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12) return res.status(400).json({ message: 'Invalid month' });
  const solves = await SolveRecord.find({ studentId: s._id, year: y, month: mo }).sort({ solvedAt: 1 }).lean();
  const contests = await ContestRecord.find({ studentId: s._id, year: y, month: mo }).sort({ date: 1 }).lean();
  res.json({
    year: y, month: mo,
    leetcode: solves.filter((x) => x.platform === 'leetcode'),
    codechef: solves.filter((x) => x.platform === 'codechef'),
    contests,
    counts: {
      leetcode: solves.filter((x) => x.platform === 'leetcode').length,
      codechef: solves.filter((x) => x.platform === 'codechef').length,
      contests: contests.length,
    },
  });
}));

module.exports = { router, buildStudentPayload };
