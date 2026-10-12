const axios = require('axios');

const URL = process.env.LEETCODE_GRAPHQL || 'https://leetcode.com/graphql';

const QUERY = `
query Q($u: String!) {
  matchedUser(username: $u) {
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    profile { ranking }
    userCalendar { submissionCalendar streak totalActiveDays }
  }
  recentSubmissionList(username: $u, limit: 20) { title titleSlug timestamp statusDisplay }
  userContestRanking(username: $u) { attendedContestsCount rating globalRanking topPercentage }
  userContestRankingHistory(username: $u) { attended ranking rating contest { title startTime } }
}`;

async function fetchLeetCodeUser(username) {
  const uname = String(username || '').trim();
  if (!uname) throw new Error('empty username');
  const { data } = await axios.post(URL, { query: QUERY, variables: { u: uname } }, {
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', Referer: `https://leetcode.com/u/${uname}/` },
    timeout: 25000,
  });
  if (data.errors) throw new Error(data.errors.map((e) => e.message).join('; '));
  return data.data;
}

function parseStats(payload) {
  const mu = payload.matchedUser;
  if (!mu) return { exists: false };
  const arr = (mu.submitStatsGlobal && mu.submitStatsGlobal.acSubmissionNum) || [];
  const get = (d) => (arr.find((x) => x.difficulty === d) || {}).count || 0;
  let calendar = {};
  let monthlySolved = {};
  try {
    calendar = JSON.parse((mu.userCalendar && mu.userCalendar.submissionCalendar) || '{}') || {};
  } catch { calendar = {}; }
  // submissionCalendar: { epochSec: count } — accepted-submission events per day
  const daily = [];
  Object.entries(calendar).forEach(([sec, count]) => {
    const d = new Date(Number(sec) * 1000);
    daily.push({ date: d.toISOString().slice(0, 10), count: Number(count) || 0, ts: Number(sec) });
  });
  daily.sort((a, b) => (a.date < b.date ? -1 : 1));
  // aggregate to month buckets (activity counts, NOT de-duplicated solves — labelled as such upstream)
  monthlySolved = {};
  daily.forEach((x) => {
    const k = x.date.slice(0, 7);
    monthlySolved[k] = (monthlySolved[k] || 0) + x.count;
  });
  const ranking = payload.userContestRanking || {};
  const history = (payload.userContestRankingHistory || []).filter((h) => h && h.attended && h.contest);
  const contests = history.map((h) => ({
    contestName: h.contest.title,
    date: h.contest.startTime ? new Date(h.contest.startTime * 1000) : null,
    rank: h.ranking ?? null,
    rating: h.rating ?? null,
    score: null,
  }));
  const recentAccepted = ((payload.recentSubmissionList || []).filter((s) => (s.statusDisplay || '').toLowerCase() === 'accepted'))
    .map((s) => ({ title: s.title, slug: s.titleSlug, solvedAt: s.timestamp ? new Date(Number(s.timestamp) * 1000) : null }));
  return {
    exists: true,
    totalSolved: get('All'),
    easy: get('Easy'),
    medium: get('Medium'),
    hard: get('Hard'),
    ranking: (mu.profile && mu.profile.ranking) || null,
    streak: (mu.userCalendar && mu.userCalendar.streak) || 0,
    totalActiveDays: (mu.userCalendar && mu.userCalendar.totalActiveDays) || 0,
    attendedContestsCount: ranking.attendedContestsCount || 0,
    contestRating: ranking.rating != null ? Math.round(ranking.rating) : null,
    contestGlobalRanking: ranking.globalRanking || null,
    dailyActivity: daily.slice(-365),
    monthlyActivity: monthlySolved,
    contests,
    recentAccepted,
  };
}

module.exports = { fetchLeetCodeUser, parseStats };
