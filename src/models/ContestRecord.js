const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  platform: { type: String, enum: ['leetcode', 'codechef'], required: true, index: true },
  contestName: { type: String, required: true, trim: true },
  date: { type: Date, default: null },
  year: { type: Number, default: null },
  month: { type: Number, default: null },
  rank: { type: Number, default: null },
  score: { type: Number, default: null },
  rating: { type: Number, default: null },
  attended: { type: Boolean, default: true },
  source: { type: String, default: 'manual' },
}, { timestamps: true });

contestSchema.index({ studentId: 1, platform: 1, contestName: 1, date: 1 }, { unique: true, sparse: true });
contestSchema.index({ studentId: 1, year: 1, month: 1 });

module.exports = mongoose.model('ContestRecord', contestSchema);
