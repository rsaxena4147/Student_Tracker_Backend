const XLSX = require('xlsx');

const SUMMARY_HEADER = ['Roll No', 'Name', 'LeetCode ID', 'CodeChef ID', 'LeetCode Ques', 'CodeChef Ques', 'Total Ques', 'LeetCode Contests', 'CodeChef Contests', 'Total Contests', 'Last Activity'];
const MONTHLY_HEADER = ['Roll No', 'Name', 'Month', 'LeetCode Ques', 'CodeChef Ques', 'LeetCode Contests', 'CodeChef Contests'];

function monthKey(y, m) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function safeFileName(s) {
  return (String(s || 'export').replace(/[^A-Za-z0-9 _.-]+/g, '-').replace(/\s+/g, ' ').trim() || 'export');
}

// solveAgg / contestAgg: [{ _id: { s, p, y, m }, n }] — grouped per student+platform(+month)
function buildStudentsWorkbook({ className, students, solveAgg, contestAgg }) {
  const solveByKey = new Map();
  solveAgg.forEach((a) => { solveByKey.set(`${a._id.s}|${a._id.p}|${a._id.y}|${a._id.m}`, a.n); });
  const contestByKey = new Map();
  contestAgg.forEach((a) => { contestByKey.set(`${a._id.s}|${a._id.p}|${a._id.y}|${a._id.m}`, a.n); });
  const sumBy = (map, sid, p) => {
    let t = 0;
    map.forEach((v, k) => { const [s, pl] = k.split('|'); if (s === String(sid) && pl === p) t += v; });
    return t;
  };

  const summary = [];
  const monthly = [];

  students.forEach((s) => {
    const sid = String(s._id);
    const lcRecQ = sumBy(solveByKey, sid, 'leetcode');
    const ccRecQ = sumBy(solveByKey, sid, 'codechef');
    const lcRecC = sumBy(contestByKey, sid, 'leetcode');
    const ccRecC = sumBy(contestByKey, sid, 'codechef');

    const lcAtt = (s.leetcode && s.leetcode.attendedContestsCount) || 0;
    const ccAtt = (s.codechef && s.codechef.attendedContestsCount) || 0;
    const leetcodeQ = lcRecQ + ((s.leetcode && s.leetcode.totalSolved) || 0);
    const codechefQ = ccRecQ + (s.codechefSolved || 0) + ((s.codechef && s.codechef.totalSolved) || 0);
    // synced contests are stored as ContestRecords too — only add snapshot surplus
    const leetcodeC = lcRecC + Math.max(0, lcAtt - lcRecC);
    const codechefC = ccRecC + Math.max(0, ccAtt - ccRecC) + (s.codechefContests || 0);

    summary.push({
      'Roll No': s.rollNo,
      'Name': s.name,
      'LeetCode ID': s.leetcodeId || '',
      'CodeChef ID': s.codechefId || '',
      'LeetCode Ques': leetcodeQ,
      'CodeChef Ques': codechefQ,
      'Total Ques': leetcodeQ + codechefQ,
      'LeetCode Contests': leetcodeC,
      'CodeChef Contests': codechefC,
      'Total Contests': leetcodeC + codechefC,
      'Last Activity': fmtDate(s.lastActivityAt || s.updatedAt),
    });

    // monthly: sync activity caches + dated solve/contest records
    const months = new Map(); // ym -> { lcQ, ccQ, lcC, ccC }
    const bump = (ym, field, n) => {
      if (!/^\d{4}-\d{2}$/.test(ym) || !n) return;
      if (!months.has(ym)) months.set(ym, { lcQ: 0, ccQ: 0, lcC: 0, ccC: 0 });
      months.get(ym)[field] += n;
    };
    const lcCache = (s.leetcode && s.leetcode.monthlyActivityCache) || {};
    const ccCache = (s.codechef && s.codechef.monthlyActivityCache) || {};
    Object.entries(lcCache).forEach(([ym, n]) => bump(ym, 'lcQ', Number(n) || 0));
    Object.entries(ccCache).forEach(([ym, n]) => bump(ym, 'ccQ', Number(n) || 0));
    solveAgg.forEach((a) => {
      if (String(a._id.s) !== sid || !a._id.y || !a._id.m) return;
      bump(monthKey(a._id.y, a._id.m), a._id.p === 'leetcode' ? 'lcQ' : 'ccQ', a.n);
    });
    contestAgg.forEach((a) => {
      if (String(a._id.s) !== sid || !a._id.y || !a._id.m) return;
      bump(monthKey(a._id.y, a._id.m), a._id.p === 'leetcode' ? 'lcC' : 'ccC', a.n);
    });

    [...months.keys()].sort().forEach((ym) => {
      const m = months.get(ym);
      if (!m.lcQ && !m.ccQ && !m.lcC && !m.ccC) return;
      monthly.push({
        'Roll No': s.rollNo,
        'Name': s.name,
        'Month': ym,
        'LeetCode Ques': m.lcQ,
        'CodeChef Ques': m.ccQ,
        'LeetCode Contests': m.lcC,
        'CodeChef Contests': m.ccC,
      });
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary, { header: SUMMARY_HEADER }), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthly, { header: MONTHLY_HEADER }), 'Monthly');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const base = safeFileName(className) || 'students';
  return { buffer, filename: `${base}.xlsx` };
}

module.exports = { buildStudentsWorkbook, safeFileName };
