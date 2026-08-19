require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const errorHandler = require('./middlewares/errorHandler');
const { apiLimiter } = require('./middlewares/rateLimiters');
const { COVER_DIR, AVATAR_DIR } = require('./config/storage');
const routes = require('./routes');
const { startReleaseScheduler } = require('./jobs/releaseScheduler');
const { startLyricsWorker } = require('./workers/lyricsWorker');
const { startReleaseWorker } = require('./workers/releaseWorker');

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

app.use(cookieParser());
app.use('/static/covers', express.static(COVER_DIR));
app.use('/static/avatars', express.static(AVATAR_DIR));

app.get('/', (req, res) => {
  res.json({ message: 'Audivo backend is running' });
});

app.use('/api', apiLimiter, routes);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startReleaseScheduler();
  startLyricsWorker();
  startReleaseWorker();
});