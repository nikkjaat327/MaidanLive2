import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { connectDatabase, disconnectDatabase, getDatabaseDiagnostics } from './server/config/db.ts';
import { initSocketServer } from './server/socket/index.ts';
import authRoutes from './server/routes/authRoutes.ts';
import liveStreamRoutes from './server/routes/liveStreamRoutes.ts';
import scoreRoutes from './server/routes/scoreRoutes.ts';
import entityRoutes from './server/routes/entityRoutes.ts';
import tournamentWorkflowRoutes from './server/routes/tournamentWorkflowRoutes.ts';
import engagementRoutes from './server/routes/engagementRoutes.ts';
import platformOpsRoutes from './server/routes/platformOpsRoutes.ts';
import v1Routes from './server/routes/v1Routes.ts';
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

const STATIC_FILE_EXT_RE =
  /\.(?:js|mjs|css|png|jpg|jpeg|webp|gif|svg|ico|json|woff|woff2|ttf|map|txt|webmanifest|m3u8|ts|mp4)$/i;

async function startServer() {
  const dbInfo = await connectDatabase();
  await ensureEnvSuperAdminIfConfigured();

  const app = express();
  app.set('trust proxy', 1);
  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication requests. Please wait a few minutes.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 400,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/admin/login', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api', apiLimiter);

  app.get('/api/health', async (_req, res) => {
    let diag: ReturnType<typeof getDatabaseDiagnostics> | null = null;
    try {
      diag = getDatabaseDiagnostics();
    } catch {
      diag = null;
    }
    res.json({
      ok: true,
      dbMode: diag?.engine || dbInfo.mode,
      diagnostics: diag,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1', v1Routes);
  app.use('/api/auth', authRoutes);
  app.use('/api/live', liveStreamRoutes);
  app.use('/api/live', scoreRoutes);
  app.use('/api', entityRoutes);
  app.use('/api', tournamentWorkflowRoutes);
  app.use('/api', engagementRoutes);
  app.use('/api', platformOpsRoutes);

  // API 404 handler (never return index.html for unknown /api routes)
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
    // 1. Immutable 1-year cache for Vite hashed /assets/* and strict 404 on missing files
    const assetsDir = path.join(distDir, 'assets');
    app.use(
      '/assets',
      express.static(assetsDir, {
        maxAge: '1y',
        immutable: true,
        fallthrough: false,
      })
    );
    app.use('/assets', (_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(404).send('Asset not found.');
    });

    // 2. Service worker & manifest must NEVER be cached stale
    app.get(['/sw.js', '/registerSW.js'], (req, res) => {
      const target = path.join(distDir, req.path.replace(/^\/+/, ''));
      if (!fs.existsSync(target)) {
        res.status(404).send('Service worker not found.');
        return;
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.type('application/javascript');
      res.sendFile(target);
    });

    // 3. Other built static files in dist/
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json');
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );

    // 4. Strictly 404 missing static extensions or /assets/* (never return index.html)
    app.get('*', (req, res) => {
      if (req.path.startsWith('/assets/') || STATIC_FILE_EXT_RE.test(req.path)) {
        res.status(404).send('Static resource not found.');
        return;
      }
      if (fs.existsSync(distIndex)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(distIndex);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[MaidanLive] Server listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'}, db=${dbInfo.mode})`
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
