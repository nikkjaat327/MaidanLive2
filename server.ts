import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { connectDatabase, disconnectDatabase, getDatabaseDiagnostics } from './server/config/db.ts';
import { expressCorsOptionsDelegate } from './server/config/cors.ts';
import { initSocketServer } from './server/socket/index.ts';
import authRoutes from './server/routes/authRoutes.ts';
import liveStreamRoutes from './server/routes/liveStreamRoutes.ts';
import scoreRoutes from './server/routes/scoreRoutes.ts';
import entityRoutes from './server/routes/entityRoutes.ts';
import tournamentWorkflowRoutes from './server/routes/tournamentWorkflowRoutes.ts';
import engagementRoutes from './server/routes/engagementRoutes.ts';
import platformOpsRoutes from './server/routes/platformOpsRoutes.ts';
import v1Routes from './server/routes/v1Routes.ts';
import obsBroadcastRoutes from './server/routes/obsBroadcastRoutes.ts';
import broadcastGraphicsRoutes from './server/routes/broadcastGraphicsRoutes.ts';
import { initObsControllerBridge } from './server/services/obsControllerService.ts';
import { initAdScheduleEngine, stopAdScheduleEngine } from './server/services/broadcastAdScheduleService.ts';
import { ALL_GRANULAR_PERMISSIONS, User } from './server/models/User.ts';
import { Tournament } from './server/models/Tournament.ts';
import { LiveStream } from './server/models/LiveStream.ts';
import { LiveScore } from './server/models/LiveScore.ts';
import { Team } from './server/models/Team.ts';
import { Player } from './server/models/Player.ts';

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
    granularPermissions: [...ALL_GRANULAR_PERMISSIONS],
    isActive: true,
  });
  console.log(`[Auth] Bootstrapped Super Admin from environment for ${email}`);
}

const STATIC_FILE_EXT_RE =
  /\.(?:js|mjs|css|png|jpg|jpeg|webp|gif|svg|ico|json|woff|woff2|ttf|map|txt|webmanifest|m3u8|ts|mp4)$/i;

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

interface SharePageMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl?: string;
}

function escapeHtmlAttr(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resolvePublicBaseUrl(req: express.Request): string {
  const configured = (process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || '').trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        !LOCALHOST_HOSTNAMES.has(parsed.hostname.toLowerCase())
      ) {
        return parsed.origin.replace(/\/+$/, '');
      }
    } catch {
      // Fall through to request origin
    }
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const proto = forwardedProto || req.protocol || 'http';
  const fallbackPort = Number(process.env.PORT) || 3000;
  const host = req.get('host') || `localhost:${fallbackPort}`;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

async function resolveShareMetadata(
  req: express.Request,
  baseUrl: string
): Promise<SharePageMetadata> {
  const cleanPath = req.path || '/';
  const defaultImage = `${baseUrl}/pwa-512x512.png`;
  const defaults: SharePageMetadata = {
    title: 'MaidanLive — Live Sports Streaming & Real-Time Scoreboards',
    description:
      'Watch live grassroots and tournament sports on MaidanLive with real-time Cricket, Kabaddi, Football, and Volleyball scoreboards.',
    canonicalUrl: `${baseUrl}${cleanPath === '/' ? '' : cleanPath}`,
    imageUrl: defaultImage,
  };

  try {
    const tournamentMatch = cleanPath.match(/^\/tournaments\/([^/]+)$/);
    if (tournamentMatch) {
      const tourId = decodeURIComponent(tournamentMatch[1]);
      const t: any = await Tournament.findById(tourId).catch(() => null);
      if (t) {
        const prizeSummary =
          t.prizes?.first?.amount?.trim() ||
          t.prizes?.first?.label?.trim() ||
          t.prizeMoney?.trim() ||
          '';
        const parts = [
          t.sportType ? `${t.sportType} Tournament` : 'Tournament',
          t.status || '',
          t.location || '',
          prizeSummary ? `Prize: ${prizeSummary}` : '',
        ].filter(Boolean);
        return {
          title: `${t.name} | MaidanLive`,
          description: `${parts.join(' · ')} — Live fixtures, standings, and broadcasts on MaidanLive.`,
          canonicalUrl: `${baseUrl}/tournaments/${encodeURIComponent(tourId)}`,
          imageUrl: t.logoUrl?.trim() || defaultImage,
        };
      }
    }

    const matchRoute = cleanPath.match(/^\/live\/([^/]+)$/);
    if (matchRoute) {
      const streamId = decodeURIComponent(matchRoute[1]);
      const isReplayMode = String(req.query.mode || '').toLowerCase() === 'replay';
      const stream: any = await LiveStream.findById(streamId).catch(() => null);
      if (stream) {
        const score: any = await LiveScore.findOne({ liveStreamId: stream._id || streamId }).catch(
          () => null
        );
        const matchName =
          stream.matchTitle ||
          (stream.teamAName && stream.teamBName
            ? `${stream.teamAName} vs ${stream.teamBName}`
            : stream.teamAName || stream.teamBName || 'Live Sports Match');
        const videoId =
          isReplayMode && stream.replayVideoId ? stream.replayVideoId : stream.youtubeVideoId;
        const thumbImage = videoId
          ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          : defaultImage;

        let scoreNote = '';
        if (score) {
          if (score.resultStatus && score.resultStatus !== 'NOT_DECLARED') {
            scoreNote = score.resultDescription || score.winnerTeamName || '';
          } else if (stream.teamAName && stream.teamBName) {
            scoreNote = `${stream.teamAName} ${score.teamAScore ?? 0} - ${score.teamBScore ?? 0} ${stream.teamBName}`;
          }
        }
        const prefix = isReplayMode && stream.replayPublished ? 'Full Replay' : stream.status || 'Live';
        const descParts = [
          stream.gameName || 'Sports',
          stream.tournamentName || '',
          scoreNote,
          stream.location || '',
        ].filter(Boolean);

        return {
          title: `${matchName} (${prefix}) | MaidanLive`,
          description: `${descParts.join(' · ')} on MaidanLive.`,
          canonicalUrl: `${baseUrl}/live/${encodeURIComponent(streamId)}${isReplayMode ? '?mode=replay' : ''}`,
          imageUrl: thumbImage,
        };
      }
    }

    const teamMatch = cleanPath.match(/^\/teams\/([^/]+)$/);
    if (teamMatch) {
      const teamId = decodeURIComponent(teamMatch[1]);
      const team: any = await Team.findById(teamId).catch(() => null);
      if (team) {
        const squadCount = await Player.countDocuments({ teamId: team._id || teamId }).catch(() => 0);
        const parts = [
          team.sportType ? `${team.sportType} Squad` : 'Team Squad',
          team.city || '',
          team.captainName ? `Captain: ${team.captainName}` : '',
          squadCount > 0 ? `${squadCount} Players` : '',
        ].filter(Boolean);
        return {
          title: `${team.name} | MaidanLive`,
          description: `${parts.join(' · ')} — Squad profile, fixtures, and live broadcasts on MaidanLive.`,
          canonicalUrl: `${baseUrl}/teams/${encodeURIComponent(teamId)}`,
          imageUrl: team.logoUrl?.trim() || defaultImage,
        };
      }
    }

    const playerMatch = cleanPath.match(/^\/players\/([^/]+)$/);
    if (playerMatch) {
      const playerId = decodeURIComponent(playerMatch[1]);
      const player: any = await Player.findById(playerId)
        .select('name sportType role jerseyNumber teamId avatarUrl')
        .catch(() => null);
      if (player) {
        let teamName = '';
        if (player.teamId) {
          const team: any = await Team.findById(player.teamId).catch(() => null);
          if (team?.name) teamName = team.name;
        }
        const parts = [
          player.sportType || 'Player',
          player.role || '',
          player.jerseyNumber !== null && player.jerseyNumber !== undefined
            ? `#${player.jerseyNumber}`
            : '',
          teamName,
        ].filter(Boolean);
        return {
          title: `${player.name} | MaidanLive`,
          description: `${parts.join(' · ')} — Official career stats and match history on MaidanLive.`,
          canonicalUrl: `${baseUrl}/players/${encodeURIComponent(playerId)}`,
          imageUrl: player.avatarUrl?.trim() || defaultImage,
        };
      }
    }

    const staticSections: Record<string, { title: string; description: string }> = {
      '/tournaments': {
        title: 'Tournaments | MaidanLive',
        description:
          'Explore active, upcoming, and completed grassroots sports tournaments on MaidanLive.',
      },
      '/replays': {
        title: 'Verified Match Replays | MaidanLive',
        description:
          'Watch full-match grassroots sports replays with preserved scoreboards and highlights on MaidanLive.',
      },
      '/teams': {
        title: 'Teams & Squads | MaidanLive',
        description: 'Browse registered teams, official squads, and match records on MaidanLive.',
      },
      '/players': {
        title: 'Players | MaidanLive',
        description: 'Discover grassroots athletes, verified stats, and MVP honours on MaidanLive.',
      },
      '/leaderboards': {
        title: 'Tournament Leaderboards | MaidanLive',
        description:
          'Top runs, wickets, raid points, tackle points, goals, and MVPs across MaidanLive.',
      },
      '/calendar': {
        title: 'Match Calendar & Schedule | MaidanLive',
        description: 'View upcoming fixtures, live matches, and tournament schedules on MaidanLive.',
      },
    };
    const staticMeta = staticSections[cleanPath];
    if (staticMeta) {
      return {
        ...staticMeta,
        canonicalUrl: `${baseUrl}${cleanPath}`,
        imageUrl: defaultImage,
      };
    }
  } catch {
    // Non-blocking fallback to default metadata
  }

  return defaults;
}

function injectMetaIntoHtml(rawHtml: string, meta: SharePageMetadata): string {
  const safeTitle = escapeHtmlText(meta.title);
  const safeAttrTitle = escapeHtmlAttr(meta.title);
  const safeDesc = escapeHtmlAttr(meta.description);
  const safeUrl = escapeHtmlAttr(meta.canonicalUrl);
  const safeImg = escapeHtmlAttr(meta.imageUrl || '');

  let html = rawHtml;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  html = html.replace(
    /<meta\s+name=["']description["'][^>]*>/i,
    `<meta name="description" content="${safeDesc}" />`
  );
  html = html.replace(
    /<meta\s+property=["']og:title["'][^>]*>/i,
    `<meta property="og:title" content="${safeAttrTitle}" />`
  );
  html = html.replace(
    /<meta\s+property=["']og:description["'][^>]*>/i,
    `<meta property="og:description" content="${safeDesc}" />`
  );

  const extraTags = [
    `<link rel="canonical" href="${safeUrl}" />`,
    `<meta property="og:site_name" content="MaidanLive" />`,
    `<meta property="og:url" content="${safeUrl}" />`,
    safeImg ? `<meta property="og:image" content="${safeImg}" />` : '',
    `<meta name="twitter:title" content="${safeAttrTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    safeImg ? `<meta name="twitter:image" content="${safeImg}" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ');

  return html.replace('</head>', `    ${extraTags}\n  </head>`);
}

async function startServer() {
  const dbInfo = await connectDatabase();
  await ensureEnvSuperAdminIfConfigured();

  const app = express();
  app.set('trust proxy', 2);
  const httpServer = http.createServer(app);
  // Keep long-lived WebSocket / reverse-proxy keepalive connections open well past proxy idle windows
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;
  httpServer.requestTimeout = 0;
  initObsControllerBridge();
  initSocketServer(httpServer);
  initAdScheduleEngine().catch((err) => {
    console.warn('[AdSchedule] Engine init warning:', err);
  });

  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET?.trim()) {
    console.warn('[Auth] WARNING: JWT_SECRET is not set in production — active tokens will reset on server restart.');
  }

  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        const accept = String(req.headers.accept || '');
        if (accept.includes('text/event-stream')) return false;
        return compression.filter(req, res);
      },
    })
  );
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );
  app.use(cors(expressCorsOptionsDelegate));
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  // Never allow proxies or browsers to serve stale live match scores or overlay state
  app.use('/api/live', (req, res, next) => {
    if (
      req.method === 'GET' &&
      /\/(?:score(?:\/history|\/result)?|detail|overlay)(?:$|\?)/.test(req.path)
    ) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication requests. Please wait a few minutes.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.method === 'GET' ||
      req.method === 'HEAD' ||
      req.method === 'OPTIONS' ||
      req.path === '/health' ||
      req.path === '/viewers/track' ||
      /^\/obs\/matches\/[^/]+\/preview$/.test(req.path) ||
      /^\/obs\/camera-connect\/[^/]+\/heartbeat$/.test(req.path),
    message: { message: 'Too many API requests. Please wait a moment and try again.' },
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/admin/login', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api', apiLimiter);

  let cachedHealthDiag: { at: number; value: ReturnType<typeof getDatabaseDiagnostics> | null } = {
    at: 0,
    value: null,
  };
  app.get('/api/health', async (req, res) => {
    const brandLogoUrl =
      (process.env.VITE_BRAND_LOGO_URL || process.env.BRAND_LOGO_URL || '').trim();
    if (req.query.lite === '1') {
      res.json({
        ok: true,
        dbMode: dbInfo.mode,
        brandLogoUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const now = Date.now();
    if (!cachedHealthDiag.value || now - cachedHealthDiag.at > 5000) {
      try {
        cachedHealthDiag = { at: now, value: getDatabaseDiagnostics() };
      } catch {
        cachedHealthDiag = { at: now, value: null };
      }
    }
    res.json({
      ok: true,
      dbMode: cachedHealthDiag.value?.engine || dbInfo.mode,
      brandLogoUrl,
      diagnostics: cachedHealthDiag.value,
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
  app.use('/api/obs/graphics', broadcastGraphicsRoutes);
  app.use('/api/obs', obsBroadcastRoutes);

  // API 404 handler (never return index.html for unknown /api routes)
  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'API endpoint not found.' });
  });

  // Global error handler for unexpected DB/Mongoose errors
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (
      err?.name === 'MongooseError' ||
      err?.name === 'MongoNetworkError' ||
      err?.message?.includes('buffering timed out')
    ) {
      console.warn('[MaidanLive] Database offline — returning 503 unavailable');
      return res.status(503).json({
        message: 'Service temporarily unavailable (database offline).',
        error: 'Service temporarily unavailable (database offline)',
      });
    }
    next(err);
  });

  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const isProd =
    process.env.NODE_ENV === 'production' ||
    (process.env.NODE_ENV !== 'development' &&
      process.env.DISABLE_HMR !== 'true' &&
      fs.existsSync(distIndex));

  if (!isProd) {
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });

    app.use(async (req, res, next) => {
      const accept = String(req.headers.accept || '');
      const wantsHtml =
        accept.includes('text/html') || accept === '' || accept === '*/*' || accept.includes('*/*');
      if (
        req.method !== 'GET' ||
        req.path.startsWith('/api') ||
        req.path.startsWith('/assets/') ||
        req.path.startsWith('/@') ||
        req.path.startsWith('/src/') ||
        req.path.startsWith('/node_modules/') ||
        req.path.includes('.') ||
        STATIC_FILE_EXT_RE.test(req.path) ||
        !wantsHtml
      ) {
        next();
        return;
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        const template = fs.readFileSync(indexPath, 'utf8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, template);
        const baseUrl = resolvePublicBaseUrl(req);
        const meta = await resolveShareMetadata(req, baseUrl);
        res
          .status(200)
          .set({
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache, no-store, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          })
          .end(injectMetaIntoHtml(transformed, meta));
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next();
      }
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
    app.get('*', async (req, res) => {
      if (req.path.startsWith('/assets/') || STATIC_FILE_EXT_RE.test(req.path)) {
        res.status(404).send('Static resource not found.');
        return;
      }
      if (fs.existsSync(distIndex)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        try {
          const rawHtml = fs.readFileSync(distIndex, 'utf8');
          const baseUrl = resolvePublicBaseUrl(req);
          const meta = await resolveShareMetadata(req, baseUrl);
          res.type('text/html').send(injectMetaIntoHtml(rawHtml, meta));
        } catch {
          res.sendFile(distIndex);
        }
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const cliPortIdx = process.argv.findIndex((a) => a === '--port' || a.startsWith('--port='));
  let cliPort = 0;
  if (cliPortIdx !== -1) {
    const raw = process.argv[cliPortIdx].startsWith('--port=')
      ? process.argv[cliPortIdx].split('=')[1]
      : process.argv[cliPortIdx + 1];
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) cliPort = parsed;
  }
  const PORT = cliPort || Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[MaidanLive] Server listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'}, db=${dbInfo.mode})`
    );
  });

  const shutdown = async () => {
    stopAdScheduleEngine();
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
