import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

import { connectDatabase, disconnectDatabase } from './server/config/db.ts';
import { initSocketServer } from './server/socket/index.ts';
import authRoutes from './server/routes/authRoutes.ts';
import liveStreamRoutes from './server/routes/liveStreamRoutes.ts';
import scoreRoutes from './server/routes/scoreRoutes.ts';
import entityRoutes from './server/routes/entityRoutes.ts';
import tournamentWorkflowRoutes from './server/routes/tournamentWorkflowRoutes.ts';
import engagementRoutes from './server/routes/engagementRoutes.ts';
import platformOpsRoutes from './server/routes/platformOpsRoutes.ts';
import uploadRoutes from './server/routes/uploadRoutes.ts';
import { User } from './server/models/User.ts';

dotenv.config();

async function ensureEnvSuperAdminIfConfigured(): Promise<void> {
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD?.trim();
  const name = process.env.BOOTSTRAP_SUPER_ADMIN_NAME?.trim() || 'Super Admin';

  if (!email || !password || password.length < 8) return;

  const existingSuperAdmin = await User.countDocuments({ role: 'SUPER_ADMIN' });
  if (existingSuperAdmin > 0) return;

  const existingUser = await User.findOne({ email });
  if (existingUser) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({
    name,
    email,
    passwordHash,
    role: 'SUPER_ADMIN',
    permissions: {
      manageStreams: true,
      manageScores: true,
      manageTournaments: true,
      manageTeams: true,
      managePlayers: true,
      moderateChat: true,
      manageSponsors: true,
      manageVenues: true,
      declareResults: true,
    },
    isActive: true,
  });
  console.log(`[Auth] Bootstrapped Super Admin from environment for ${email}`);
}

async function startServer() {
  const dbInfo = await connectDatabase();
  if (dbInfo.mode !== 'offline') {
    await ensureEnvSuperAdminIfConfigured();
  }

  const app = express();
  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, dbMode: dbInfo.mode, timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/live', liveStreamRoutes);
  app.use('/api/live', scoreRoutes);
  app.use('/api', entityRoutes);
  app.use('/api', tournamentWorkflowRoutes);
  app.use('/api', engagementRoutes);
  app.use('/api', platformOpsRoutes);
  app.use('/api/uploads', uploadRoutes);

  // Graceful fallback when MongoDB is offline
  app.use(
    (
      err: Error & { name?: string },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (
        err?.name === 'MongooseError' ||
        err?.name === 'MongoNetworkError' ||
        err?.message?.includes('buffering timed out') ||
        err?.message?.includes('Client must be connected')
      ) {
        console.warn('[AI Studio] Database offline — returning mock empty response');
        if (req.method === 'GET') {
          return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
        }
        return res
          .status(503)
          .json({ message: 'Service temporarily unavailable (database offline)' });
      }
      next(err);
    }
  );

  // API 404 handler (prevent HTML fallback for unknown /api routes)
  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'API endpoint not found.' });
  });

  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const isProd =
    process.env.NODE_ENV === 'production' ||
    (process.env.NODE_ENV !== 'development' &&
      process.env.DISABLE_HMR !== 'true' &&
      fs.existsSync(distIndex));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[MaidanLive] Server listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`
    );
  });

  const shutdown = async () => {
    httpServer.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('[MaidanLive] Fatal startup error:', err);
  process.exit(1);
});
