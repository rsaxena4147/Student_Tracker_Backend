const express = require('express');
const asyncHandler = require('express-async-handler');
const multer = require('multer');
const path = require('path');
const Class = require('../models/Class');
const Student = require('../models/Student');
const { parseWorkbook } = require('../utils/excel');
const ContestRecord = require('../models/ContestRecord');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) return cb(new Error('Only .xlsx / .xls files allowed'));
    cb(null, true);
  },
});

function classNameFromFile(filename) {
  const base = path.basename(filename || 'upload', path.extname(filename || ''));
  return base.trim() || 'Unnamed Class';
}

// POST /api/import/excel  (multipart field: file, optional className)
router.post('/excel', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name: file)' });
  const fallback = (req.body.className || classNameFromFile(req.file.originalname)).trim();
  let parsed;
  try {
    parsed = parseWorkbook(req.file.buffer, fallback);
  } catch (e) {
    return res.status(400).json({ message: 'Could not parse Excel: ' + e.message });
  }
  let created = 0, updated = 0, skipped = 0;
  const seen = new Set(); // dedupe within file: class|roll
  for (const r of parsed.rows) {
    // filename-derived class takes precedence when sheets are generic
    const genericSheet = /^(sheet\d*|data)$/i.test(r.sheet || '');
    const clsName = (genericSheet ? fallback : r.className).trim();
    const dedupeKey = clsName.toLowerCase() + '|' + r.rollNo;
    if (seen.has(dedupeKey)) { skipped += 1; continue; }
    seen.add(dedupeKey);
    const cls = await Class.findOneAndUpdate(
      { name: clsName },
      { $setOnInsert: { name: clsName, sourceFile: req.file.originalname } },
      { upsert: true, new: true }
    );
    // repeated imports safe: match class+roll, update ids/names
    const existing = await Student.findOne({ classId: cls._id, rollNo: r.rollNo });
    const numericExtra = r.extra && /^-?\d+(\.\d+)?$/.test(r.extra.trim()) ? Number(r.extra.trim()) : null;
    if (existing) {
      existing.name = r.name || existing.name;
      if (r.leetcodeId) existing.leetcodeId = r.leetcodeId;
      if (r.codechefId) existing.codechefId = r.codechefId;
      if (r.extra && !numericExtra) existing.codechefExtra = r.extra;
      await existing.save();
      updated += 1;
    } else {
      await Student.create({
        classId: cls._id, rollNo: r.rollNo, name: r.name,
        leetcodeId: r.leetcodeId, codechefId: r.codechefId,
        codechefExtra: numericExtra != null ? '' : (r.extra || ''),
        codechefSolved: 0, codechefContests: 0,
      });
      created += 1;
    }
  }
  res.json({
    message: 'Import complete',
    file: req.file.originalname,
    classesTouched: Object.keys(parsed.classes),
    created, updated, skippedDuplicates: skipped,
    warnings: parsed.warnings.slice(0, 50),
  });
}));

// POST /api/import/sync-class/:classId — refresh LeetCode AND CodeChef for all students (bounded, best-effort)
router.post('/sync-class/:classId', asyncHandler(async (req, res) => {
  const { syncOneStudent } = require('./studentWrite');
  const students = await Student.find({ classId: req.params.classId, $or: [{ leetcodeId: { $ne: '' } }, { codechefId: { $ne: '' } }] });
  let ok = 0, failed = 0;
  const errors = [];
  const conc = Math.max(1, Math.min(3, Number(process.env.SYNC_CONCURRENCY || 2)));
  for (let i = 0; i < students.length; i += conc) {
    const batch = students.slice(i, i + conc);
    await Promise.all(batch.map(async (s) => {
      try {
        const r = await syncOneStudent(s);
        if (/^ok/.test(r.leetcode) || /^ok/.test(r.codechef) || r.leetcode === 'skipped' || r.codechef === 'skipped') ok += 1;
        else { failed += 1; if (errors.length < 10) errors.push(`${s.name}: LC ${r.leetcode} | CC ${r.codechef}`); }
      } catch (e) {
        failed += 1;
        if (errors.length < 10) errors.push(`${s.name}: ${String((e && e.message) || e).slice(0, 120)}`);
      }
    }));
    // be polite to rate limits (CodeChef 429s easily)
    await new Promise((r) => setTimeout(r, 2500));
  }
  res.json({ message: 'Class sync finished (LeetCode + CodeChef)', total: students.length, ok, failed, errors });
}));

module.exports = router;
