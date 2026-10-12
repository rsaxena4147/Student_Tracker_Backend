const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchCodeChefPage(username) {
  const uname = String(username || '').trim();
  if (!uname) throw new Error('empty username');
  const { data: html } = await axios.get(`https://www.codechef.com/users/${encodeURIComponent(uname)}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    timeout: 30000,
  });
  return html;
}

// A missing user serves the generic homepage (title "CodeChef - Learn and...").
// A real profile has title "<user> | CodeChef User Profile for <Name> | CodeChef".
function isRealProfile(html, username) {
  const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  const title = m ? m[1].trim() : '';
  return title.toLowerCase().startsWith(String(username).toLowerCase());
}

function parseCodeChef(html, username) {
  if (!isRealProfile(html, username)) return { exists: false };
  const out = { exists: true, contests: [], dailyActivity: [] };

  const solved = /Total Problems Solved:\s*(\d+)/i.exec(html);
  out.totalSolved = solved ? Number(solved[1]) : 0;

  const ratingHeader = /<div class="rating-number"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (ratingHeader) {
    const digits = ratingHeader[1].replace(/<[^>]+>/g, '').replace(/[^\d]/g, '');
    out.rating = digits ? Number(digits) : null;
  } else out.rating = null;

  // Contest history embedded in Drupal settings JSON
  const dv = /date_versus_rating":\{"all":(\[[\s\S]*?\])\s*,\s*"all_old"/.exec(html);
  if (dv) {
    try {
      const arr = JSON.parse(dv[1]);
      out.contests = arr.map((c) => {
        let date = null;
        if (c.end_date) {
          const d = new Date(String(c.end_date).replace(' ', 'T'));
          if (!Number.isNaN(d.getTime())) date = d;
        } else if (c.getyear) {
          const d = new Date(Number(c.getyear), Number(c.getmonth) - 1, Number(c.getday));
          if (!Number.isNaN(d.getTime())) date = d;
        }
        return {
          code: c.code || '',
          contestName: c.name || c.code || 'CodeChef Contest',
          date,
          rank: c.rank != null && c.rank !== '' ? Number(c.rank) : null,
          rating: c.rating != null && c.rating !== '' ? Number(c.rating) : null,
        };
      }).filter((c) => c.date);
    } catch { out.contests = []; }
  }
  out.attendedContestsCount = out.contests.length;

  // Daily submission heatmap (normalize to zero-padded ISO dates for correct sort/group)
  const daily = /userDailySubmissionsStats\s*=\s*(\[[\s\S]*?\]);/.exec(html);
  if (daily) {
    try {
      const arr = JSON.parse(daily[1]);
      out.dailyActivity = arr
        .filter((x) => x && x.date)
        .map((x) => {
          const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(x.date).trim());
          if (!m) return null;
          return { date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, count: Number(x.value) || 0 };
        })
        .filter(Boolean)
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    } catch { out.dailyActivity = []; }
  } else out.dailyActivity = [];
  const monthlyActivity = {};
  out.dailyActivity.forEach((x) => {
    const k = String(x.date).slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(k)) monthlyActivity[k] = (monthlyActivity[k] || 0) + x.count;
  });
  out.monthlyActivity = monthlyActivity;
  return out;
}

async function fetchCodeChefUser(username) {
  const html = await fetchCodeChefPage(username);
  return parseCodeChef(html, username);
}

module.exports = { fetchCodeChefPage, fetchCodeChefUser, parseCodeChef, isRealProfile };
