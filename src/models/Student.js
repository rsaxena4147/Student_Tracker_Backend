const mongoose = require('mongoose');

const leetSnapshot = new mongoose.Schema({
  totalSolved: { type: Number, default: 0 },
  easy: { type: Number, default: 0 },
  medium: { type: Number, default: 0 },
  hard: { type: Number, default: 0 },
  ranking: { type: Number, default: null },
  streak: { type: Number, default: 0 },
  totalActiveDays: { type: Number, default: 0 },
  contestRating: { type: Number, default: null },
  contestGlobalRanking: { type: Number, default: null },
  attendedContestsCount: { type: Number, default: 0 },
  syncedAt: { type: Date, default: null },
  syncError: { type: String, default: '' },
  monthlyActivityCache: { type: Object, default: {} },
  dailyActivityCache: { type: Array, default: [] },
  recentAcceptedCache: { type: Array, default: [] },
}, { _id: false });

const codechefSnapshot = new mongoose.Schema({
  totalSolved: { type: Number, default: 0 },
  rating: { type: Number, default: null },
  attendedContestsCount: { type: Number, default: 0 },
  syncedAt: { type: Date, default: null },
  syncError: { type: String, default: '' },
  monthlyActivityCache: { type: Object, default: {} },
  dailyActivityCache: { type: Array, default: [] },
}, { _id: false });

const studentSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
  rollNo: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  leetcodeId: { type: String, default: '', trim: true },
  codechefId: { type: String, default: '', trim: true },
  codechefExtra: { type: String, default: '' },
  // Manual / cumulative CodeChef counts (Excel rarely has per-question dates)
  codechefSolved: { type: Number, default: 0 },
  codechefContests: { type: Number, default: 0 },
  leetcode: { type: leetSnapshot, default: () => ({}) },
  codechef: { type: codechefSnapshot, default: () => ({}) },
  lastActivityAt: { type: Date, default: null },
}, { timestamps: true });

studentSchema.index({ classId: 1, rollNo: 1 }, { unique: true });
studentSchema.index({ name: 'text' });

module.exports = mongoose.model('Student', studentSchema);
