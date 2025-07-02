import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { redisClient } from './db/index.js';
import oidcRoutes from './routes/oidc.js';
import { getConfig } from './config.js';

const app = express();
const port = getConfig().SERVER.PORT;

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'wss://relay.walletconnect.org', 'https://relay.walletconnect.org'],
      },
    },
  })
);
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/', oidcRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send({ status: 'ok' });
});

// Start server
const startServer = async () => {
  try {
    // await redisClient.connect();

    app.listen(port, () => {
      console.info(`Server running on port ${port}`);
    });

    return app;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.info('SIGTERM received. Shutting down gracefully...');
  await redisClient.disconnect();
  process.exit(0);
});

startServer();
