import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { Logger } from '@betting-exchange/shared-config';
import { createClient } from 'redis';

/** Build a @fastify/session-compatible store backed by Redis */
function buildRedisStore(redisUrl: string, ttlSeconds: number) {
  const client = createClient({ url: redisUrl });
  client.on('error', (err) => console.error('[RedisSessionStore] Redis error:', err));
  // connect is async but we'll resolve it before registering the session plugin
  const connectPromise = client.connect();

  const KEY = (id: string) => `sess:${id}`;

  return {
    connectPromise,
    store: {
      get: async (sessionId: string, callback: (err: any, session: any) => void) => {
        try {
          const raw = await client.get(KEY(sessionId));
          callback(null, raw ? JSON.parse(raw) : null);
        } catch (err) {
          callback(err, null);
        }
      },
      set: async (sessionId: string, session: any, callback: (err: any) => void) => {
        try {
          await client.setEx(KEY(sessionId), ttlSeconds, JSON.stringify(session));
          callback(null);
        } catch (err) {
          callback(err);
        }
      },
      destroy: async (sessionId: string, callback: (err: any) => void) => {
        try {
          await client.del(KEY(sessionId));
          callback(null);
        } catch (err) {
          callback(err);
        }
      },
    },
  };
}

async function bootstrap() {
  const logger = new Logger('ApiGateway');

  // Use a dedicated flag so localhost (HTTP) and Cloudflare-tunnelled prod work
  // from the same .env file. Set COOKIE_SECURE=true on the server only.
  const secureCookies = process.env.COOKIE_SECURE === 'true';

  // Create NestJS app with Fastify adapter
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: secureCookies }),
    {
      logger: ['error', 'warn', 'log'],
    }
  );

  // Get Fastify instance
  const fastifyInstance = app.getHttpAdapter().getInstance();

  // Build Redis session store (survives server restarts)
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours
  const { connectPromise, store: redisSessionStore } = buildRedisStore(redisUrl, SESSION_TTL_SECONDS);
  await connectPromise;
  logger.info('Redis session store connected');

  // Register cookie and session plugins dynamically
  const fastifyCookie = await import('@fastify/cookie');
  const fastifySession = await import('@fastify/session');

  // @ts-ignore - Type incompatibility with Fastify plugins
  await fastifyInstance.register(fastifyCookie.default);
  // @ts-ignore - Type incompatibility with Fastify plugins
  await fastifyInstance.register(fastifySession.default, {
    secret: process.env.SESSION_SECRET || 'replace-with-secure-secret-in-production',
    store: redisSessionStore as any,
    cookie: {
      // secure: true requires HTTPS — only set when behind Cloudflare Tunnel (COOKIE_SECURE=true)
      // On localhost HTTP this must be false or the browser silently drops the cookie
      secure: secureCookies,
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS * 1000,
      sameSite: secureCookies ? 'none' : 'lax',
      domain: process.env.COOKIE_DOMAIN || undefined,
    },
    saveUninitialized: false,
    rolling: true,
  });

  // Enable CORS with credentials - accept both ports and AWS S3
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3001',
    'http://betting-exchange-frontend-474668399531.s3-website-us-east-1.amazonaws.com',
    'https://gamefix.fun',
    'http://gamefix.fun',
    'https://www.gamefix.fun',
    'http://www.gamefix.fun',
    process.env.AUTH_SUCCESS_REDIRECT?.replace(/\/app$/, '') || 'http://localhost:3001'
  ];
  
  // Add CORS_ORIGINS from environment if set
  if (process.env.CORS_ORIGINS) {
    allowedOrigins.push(...process.env.CORS_ORIGINS.split(','));
  }
  
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Get port from environment
  const port = process.env.PORT || 3000;

  await app.listen(port, '0.0.0.0');
  logger.info(`API Gateway listening on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start API Gateway:', error);
  process.exit(1);
});
