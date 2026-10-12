const XLSX = require('xlsx');

function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Flexible header map: returns { rollNo, name, leetcodeId, codechefId, extra } column indexes
function mapColumns(headerRow) {
  const cells = headerRow.map((h, i) => ({ h: norm(h), raw: h, i }));
  const find = (...cands) => {
    for (const c of cands) {
      const hit = cells.find((x) => x.h === c || x.h.includes(c));
      if (hit) return hit.i;
    }
    return -1;
  };
  return {
    rollNo: find('rollno', 'rollnumber', 'roll', 'idnumber', 'enrollment', 'enrolment'),
    name: find('name', 'studentname', 'fullname'),
    leetcodeId: find('leetcodeid', 'leetcode', 'leetcodeusername', 'leet'),
    codechefId: find('codechefid', 'codechef', 'codechefusername', 'ccid'),
    extra: find('extra', 'note', 'remark', 'contest', 'score'),
  };
}

function cleanStr(v) {
  if (v == null) return '';
  let s = String(v).trim().replace(/\s+/g, ' ').replace(/\\n/g, '').trim();
  return s;
}

function cleanRoll(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(Math.trunc(v));
  return String(v).trim().replace(/\.0$/, '');
}

function parseWorkbook(buffer, classNameFallback) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const result = { classes: {}, rows: [], warnings: [] };
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    if (!aoa.length) continue;
    // find header row (first row containing name+roll-like headers)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(aoa.length, 5); i++) {
      const joined = norm((aoa[i] || []).join('|'));
      if (joined.includes('roll') && joined.includes('name')) { headerIdx = i; break; }
    }
    const header = aoa[headerIdx] || [];
    const map = mapColumns(header);
    if (map.rollNo < 0 || map.name < 0) {
      result.warnings.push(`Sheet "${sheetName}": could not find Roll No / Name columns; skipped.`);
      continue;
    }
    // class name: prefer sheet name unless it's generic like Sheet1 -> use file/classNameFallback
    const generic = /^(sheet\d*|data)$/i.test(String(sheetName).trim());
    const className = generic ? classNameFallback : String(sheetName).trim();
    for (let r = headerIdx + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const rollNo = cleanRoll(row[map.rollNo]);
      const name = cleanStr(row[map.name]);
      if (!rollNo && !name) continue; // blank row
      if (!rollNo || !name) {
        result.warnings.push(`Sheet "${sheetName}" row ${r + 1}: missing roll or name; skipped.`);
        continue;
      }
      const leetcodeId = map.leetcodeId >= 0 ? cleanStr(row[map.leetcodeId]) : '';
      const codechefId = map.codechefId >= 0 ? cleanStr(row[map.codechefId]) : '';
      const extraRaw = row.length > 4 && map.extra < 0 ? row.slice(4).filter((v) => v != null && String(v).trim() !== '') : (map.extra >= 0 ? row[map.extra] : '');
      const extra = cleanStr(Array.isArray(extraRaw) ? extraRaw.join(' | ') : extraRaw);
      if (/^(none|null|-|~|n\/a|na)$/i.test(leetcodeId)) { /* keep empty */ }
      result.rows.push({
        className,
        rollNo,
        name,
        leetcodeId: /^(none|null|-|~|n\/a|na)$/i.test(leetcodeId) ? '' : leetcodeId,
        codechefId: /^(none|null|-|~|n\/a|na)$/i.test(codechefId) ? '' : codechefId,
        extra,
        sheet: sheetName,
        rowNum: r + 1,
      });
      result.classes[className] = (result.classes[className] || 0) + 1;
    }
  }
  return result;
}

module.exports = { parseWorkbook, norm };
