const express = require('express');
const asyncHandler = require('express-async-handler');
const Class = require('../models/Class');
const Student = require('../models/Student');
const SolveRecord = require('../models/SolveRecord');
const ContestRecord = require('../models/ContestRecord');
const { buildStudentsWorkbook } = require('../utils/exportExcel');

const router = express.Router();

// GET /api/classes — cards with aggregates
router.get('/', asyncHandler(async (req, res) => {
  const classes = await Class.find({}).sort({ name: 1 }).lean();
  const out = [];
  for (const c of classes) {
    const students = await Student.find({ classId: c._id }).lean();
    const ids = students.map((s) => s._id);
    const solves = ids.length ? await SolveRecord.aggregate([
      { $match: { studentId: { $in: ids } } },
      { $group: { _id: '$platform', n: { $sum: 1 } } },
    ]) : [];
    const byPlat = Object.fromEntries(solves.map((x) => [x._id, x.n]));
    const manualCC = students.reduce((a, s) => a + (s.codechefSolved || 0), 0);
    const leetSync = students.reduce((a, s) => a + ((s.leetcode && s.leetcode.totalSolved) || 0), 0);
    const ccSync = students.reduce((a, s) => a + ((s.codechef && s.codechef.totalSolved) || 0), 0);
    const ccSyncContests = students.reduce((a, s) => a + ((s.codechef && s.codechef.attendedContestsCount) || 0), 0);
    const lcSyncContests = students.reduce((a, s) => a + ((s.leetcode && s.leetcode.attendedContestsCount) || 0), 0);
    const contestCount = ids.length ? await ContestRecord.countDocuments({ studentId: { $in: ids } }) : 0;
    const manualCCContests = students.reduce((a, s) => a + (s.codechefContests || 0), 0);
    // synced contests are ALSO stored as ContestRecords — only count the snapshot
    // surplus beyond stored records to avoid double counting.
    const snapSum = lcSyncContests + ccSyncContests;
    const syncGap = Math.max(0, snapSum - contestCount);
    out.push({
      _id: c._id,
      name: c.name,
      studentCount: students.length,
      leetcodeSolved: (byPlat.leetcode || 0) + leetSync,
      codechefSolved: (byPlat.codechef || 0) + manualCC + ccSync,
      contestCount: contestCount + manualCCContests + syncGap,
    });
  }
  res.json(out);
}));

// GET /api/classes/:id/export — Excel: per-student totals + monthly LC/CC split
router.get('/:id/export', asyncHandler(async (req, res) => {
  const cls = await Class.findById(req.params.id).lean();
  if (!cls) return res.status(404).json({ message: 'Class not found' });
  const students = await Student.find({ classId: cls._id }).sort({ rollNo: 1 }).lean();
  const ids = students.map((s) => s._id);
  const groupDef = { _id: { s: '$studentId', p: '$platform', y: '$year', m: '$month' }, n: { $sum: 1 } };
  const solveAgg = ids.length ? await SolveRecord.aggregate([{ $match: { studentId: { $in: ids } } }, { $group: groupDef }]) : [];
  const contestAgg = ids.length ? await ContestRecord.aggregate([{ $match: { studentId: { $in: ids } } }, { $group: groupDef }]) : [];
  const { buffer, filename } = buildStudentsWorkbook({ className: cls.name, students, solveAgg, contestAgg });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}));

// GET /api/classes/:id/students?q=&sort=&page=&limit=
router.get('/:id/students', asyncHandler(async (req, res) => {
  const cls = await Class.findById(req.params.id).lean();
  if (!cls) return res.status(404).json({ message: 'Class not found' });
  const { q = '', sort = 'name', order = 'asc', page = '1', limit = '20' } = req.query;
  const filter = { classId: cls._id };
  if (q.trim()) {
    filter.$or = [
      { name: { $regex: q.trim(), $options: 'i' } },
      { rollNo: { $regex: q.trim(), $options: 'i' } },
    ];
  }
  const sortMap = {
    name: { name: 1 }, rollNo: { rollNo: 1 },
    leetcode: { 'leetcode.totalSolved': 1 }, codechef: { codechefSolved: 1 },
    contests: { 'leetcode.attendedContestsCount': 1 }, updated: { updatedAt: 1 },
  };
  const desc = order !== 'asc';
  let sortObj = sortMap[sort] || sortMap.name;
  sortObj = Object.fromEntries(Object.entries(sortObj).map(([k, v]) => [k, desc ? -Math.abs(v) : Math.abs(v)]));
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const total = await Student.countDocuments(filter);
  // combined/contests are computed AFTER aggregation, so fetch all, sort globally, then paginate
  const computedSort = sort === 'combined' || sort === 'contests';
  const students = computedSort
    ? await Student.find(filter).lean()
    : await Student.find(filter).sort(sortObj).skip((pg - 1) * lim).limit(lim).lean();
  const ids = students.map((s) => s._id);
  const solveAgg = ids.length ? await SolveRecord.aggregate([
    { $match: { studentId: { $in: ids } } },
    { $group: { _id: { s: '$studentId', p: '$platform' }, n: { $sum: 1 }, keys: { $addToSet: '$problemKey' } } },
  ]) : [];
  const contestAgg = ids.length ? await ContestRecord.aggregate([
    { $match: { studentId: { $in: ids } } },
    { $group: { _id: '$studentId', n: { $sum: 1 }, latest: { $max: '$date' } } },
  ]) : [];
  const contestById = Object.fromEntries(contestAgg.map((x) => [String(x._id), x]));
  const perStudent = {};
  solveAgg.forEach((x) => {
    const id = String(x._id.s);
    perStudent[id] = perStudent[id] || {};
    perStudent[id][x._id.p] = { n: x.n, keys: new Set(x.keys) };
  });
  // allow sorting by computed combined/contests — global sort BEFORE pagination
  let rows = students.map((s) => {
    const id = String(s._id);
    const lcRec = (perStudent[id] && perStudent[id].leetcode) || { n: 0, keys: new Set() };
    const ccRec = (perStudent[id] && perStudent[id].codechef) || { n: 0, keys: new Set() };
    const leetcodeTotal = lcRec.n + ((s.leetcode && s.leetcode.totalSolved) || 0);
    const codechefTotal = ccRec.n + (s.codechefSolved || 0) + ((s.codechef && s.codechef.totalSolved) || 0);
    // dedupe overlap only when problem identity verified (same normalized key both platforms)
    let overlap = 0;
    lcRec.keys.forEach((k) => { if (ccRec.keys.has(k)) overlap += 1; });
    // ContestRecord already holds synced LC+CC contests, so only add snapshot counts
    // that exceed stored records (avoids double counting after sync).
    const recN = (contestById[id] && contestById[id].n) || 0;
    const lcAtt = (s.leetcode && s.leetcode.attendedContestsCount) || 0;
    const ccAtt = (s.codechef && s.codechef.attendedContestsCount) || 0;
    const syncGap = Math.max(0, lcAtt + ccAtt - recN);
    const contestTotal = recN + (s.codechefContests || 0) + syncGap;
    const latest = contestById[id]?.latest || s.lastActivityAt || s.updatedAt;
    return {
      _id: s._id, rollNo: s.rollNo, name: s.name,
      leetcodeId: s.leetcodeId, codechefId: s.codechefId,
      leetcodeSolved: leetcodeTotal, codechefSolved: codechefTotal,
      combinedSolved: leetcodeTotal + codechefTotal - overlap, overlapDeduped: overlap,
      contests: contestTotal, lastActivityAt: latest,
      hasLeetcodeSync: !!(s.leetcode && s.leetcode.syncedAt),
    };
  });
  // allow sorting by computed combined/contests — global sort BEFORE pagination
  if (sort === 'combined' || sort === 'contests') {
    const key = sort === 'combined' ? 'combinedSolved' : 'contests';
    rows.sort((a, b) => (order === 'asc' ? a[key] - b[key] : b[key] - a[key]));
    rows = rows.slice((pg - 1) * lim, pg * lim);
  }
  res.json({ class: cls, total, page: pg, limit: lim, pages: Math.max(1, Math.ceil(total / lim)), students: rows });
}));

// POST /api/classes/:id/students — add a student (no delete API exists by design)
router.post('/:id/students', asyncHandler(async (req, res) => {
  const cls = await Class.findById(req.params.id);
  if (!cls) return res.status(404).json({ message: 'Class not found' });
  const name = String(req.body.name || '').trim();
  const rollNo = String(req.body.rollNo || '').trim().replace(/\.0$/, '');
  const leetcodeId = String(req.body.leetcodeId || '').trim().replace(/\s+/g, '');
  const codechefId = String(req.body.codechefId || '').trim().replace(/\s+/g, '');
  if (!name) return res.status(400).json({ message: 'Student name is required' });
  if (!rollNo) return res.status(400).json({ message: 'Roll number is required' });
  if (!/^[A-Za-z0-9 _.-]+$/.test(rollNo)) return res.status(400).json({ message: 'Invalid roll number' });
  const dupe = await Student.findOne({ classId: cls._id, rollNo });
  if (dupe) return res.status(409).json({ message: `Roll no ${rollNo} already exists in ${cls.name} (${dupe.name})` });
  if (leetcodeId && dupe === null) {
    const other = await Student.findOne({ classId: cls._id, leetcodeId }).lean();
    if (other && leetcodeId) return res.status(409).json({ message: `LeetCode id "${leetcodeId}" is already used by ${other.name}` });
  }
  const s = await Student.create({ classId: cls._id, rollNo, name, leetcodeId, codechefId });
  res.status(201).json(s);
}));

module.exports = router;
