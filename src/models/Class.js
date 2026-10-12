const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  sourceFile: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Class', classSchema);
