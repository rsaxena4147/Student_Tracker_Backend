// One-time migration: copy ALL data from local MongoDB to Atlas.
// Usage: node scripts/migrateToAtlas.js
// Reads:  local  mongodb://127.0.0.1:27017/student_tracker
// Writes: Atlas  (MONGO_URI_ATLAS env or the --atlas flag value)
const mongoose = require('mongoose');

const LOCAL = 'mongodb://127.0.0.1:27017/student_tracker';
const ATLAS = process.env.MONGO_URI_ATLAS
  || 'mongodb+srv://rimjhimsaxena535:rimmih%40123@cluster0.lgkabnq.mongodb.net/student_tracker?retryWrites=true&w=majority';

const generic = new mongoose.Schema({}, { strict: false });

(async () => {
  const local = await mongoose.createConnection(LOCAL).asPromise();
  const remote = await mongoose.createConnection(ATLAS).asPromise();
  console.log('both connected');
  for (const name of ['classes', 'students', 'contestrecords', 'solvereconds']) {
    const docs = await local.db.collection(name).find({}).toArray();
    console.log(name, 'local docs:', docs.length);
    if (!docs.length) continue;
    // upsert by _id so re-runs are safe
    let up = 0;
    for (const d of docs) {
      await remote.db.collection(name).updateOne({ _id: d._id }, { $set: d }, { upsert: true });
      up += 1;
    }
    console.log(name, 'upserted:', up);
  }
  const counts = {};
  for (const name of ['classes', 'students', 'contestrecords']) {
    counts[name] = await remote.db.collection(name).countDocuments();
  }
  console.log('ATLAS COUNTS:', JSON.stringify(counts));
  await local.close(); await remote.close();
  console.log('MIGRATION DONE');
})().catch((e) => { console.error(e); process.exit(1); });
