const mongoose = require('mongoose');

// One accepted problem solve. Dedupe key: student + platform + problemKey.
const solveSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  platform: { type: String, enum: ['leetcode', 'codechef'], required: true, index: true },
  problemKey: { type: String, required: true, trim: true }, // slug / code lowercased
  title: { type: String, default: '' },
  difficulty: { type: String, default: '' },
  solvedAt: { type: Date, default: null }, // null => cumulative-only record, excluded from monthly breakdowns
  year: { type: Number, default: null },
  month: { type: Number, default: null }, // 1-12
  source: { type: String, default: 'manual' }, // manual | excel | leetcode-sync
}, { timestamps: true });

solveSchema.index({ studentId: 1, platform: 1, problemKey: 1 }, { unique: true });
solveSchema.index({ studentId: 1, year: 1, month: 1 });

module.exports = mongoose.model('SolveRecord', solveSchema);
