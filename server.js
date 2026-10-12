require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./src/config/db');
const { router: studentRouter } = require('./src/routes/students');
const { registerSyncAndRecordRoutes } = require('./src/routes/studentWrite');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

registerSyncAndRecordRoutes(studentRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/classes', require('./src/routes/classes'));
app.use('/api/students', studentRouter);
app.use('/api/import', require('./src/routes/import'));

// 404 + error handler
app.use((req, res) => res.status(404).json({ message: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/student_tracker')
  .then(() => app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`)))
  .catch((e) => { console.error('DB connect failed', e); process.exit(1); });
