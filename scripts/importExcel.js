// Usage:
//   node scripts/importExcel.js <file.xlsx> [Class Name]
//   node scripts/importExcel.js --all   (imports the two bundled Excel files)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parseWorkbook } = require('../src/utils/excel');
const Class = require('../src/models/Class');
const Student = require('../src/models/Student');

function classNameFromFile(filename) {
  const base = path.basename(filename, path.extname(filename));
  return base.trim() || 'Unnamed Class';
}

async function importBuffer(buffer, originalname, fallback) {
  const parsed = parseWorkbook(buffer, fallback || classNameFromFile(originalname));
  let created = 0, updated = 0, skipped = 0;
  const seen = new Set();
  for (const r of parsed.rows) {
    const genericSheet = /^(sheet\d*|data)$/i.test(r.sheet || '');
    const clsName = (genericSheet ? (fallback || classNameFromFile(originalname)) : r.className).trim();
    const key = clsName.toLowerCase() + '|' + r.rollNo;
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    const cls = await Class.findOneAndUpdate(
      { name: clsName },
      { $setOnInsert: { name: clsName, sourceFile: originalname } },
      { upsert: true, new: true }
    );
    const existing = await Student.findOne({ classId: cls._id, rollNo: r.rollNo });
    if (existing) {
      existing.name = r.name || existing.name;
      if (r.leetcodeId) existing.leetcodeId = r.leetcodeId;
      if (r.codechefId) existing.codechefId = r.codechefId;
      await existing.save();
      updated += 1;
    } else {
      await Student.create({
        classId: cls._id, rollNo: r.rollNo, name: r.name,
        leetcodeId: r.leetcodeId, codechefId: r.codechefId,
      });
      created += 1;
    }
  }
  return { file: originalname, created, updated, skipped, warnings: parsed.warnings };
}

async function main() {
  const args = process.argv.slice(2);
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/student_tracker';
  await mongoose.connect(uri);
  console.log('Connected to', uri);
  let files = [];
  if (args[0] === '--all') {
    files = [
      { p: 'C:\\Users\\rimjh\\Desktop\\Record\\CSE 16 .xlsx', cls: 'CSE 16' },
      { p: 'C:\\Users\\rimjh\\Desktop\\Record\\ELCE 2 LEET AND CODECHEF DATA.xlsx', cls: 'ELCE 2' },
    ];
  } else if (args[0]) {
    files = [{ p: args[0], cls: args[1] || classNameFromFile(args[0]) }];
  } else {
    console.log('Usage: node scripts/importExcel.js <file.xlsx> [Class Name]  OR  node scripts/importExcel.js --all');
    process.exit(1);
  }
  for (const f of files) {
    const buf = fs.readFileSync(f.p);
    const r = await importBuffer(buf, path.basename(f.p), f.cls);
    console.log(`${r.file}: created=${r.created} updated=${r.updated} skippedDup=${r.skipped}`);
    r.warnings.slice(0, 20).forEach((w) => console.log('  WARN:', w));
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
