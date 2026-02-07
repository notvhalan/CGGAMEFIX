import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { Logger } from '@betting-exchange/shared-config';

async function bootstrap() {
  const logger = new Logger('ApiGateway');
  
  // Create NestJS app with Fastify adapter
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    {
      logger: ['error', 'warn', 'log'],
    }
  );

  // Get Fastify instance
  const fastifyInstance = app.getHttpAdapter().getInstance();

  // Register cookie and session plugins dynamically
  const fastifyCookie = await import('@fastify/cookie');
  const fastifySession = await import('@fastify/session');
  
  // @ts-ignore - Type incompatibility with Fastify plugins
  await fastifyInstance.register(fastifyCookie.default);
  // @ts-ignore - Type incompatibility with Fastify plugins
  await fastifyInstance.register(fastifySession.default, {
    secret: process.env.SESSION_SECRET || 'replace-with-secure-secret-in-production',
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax', // Allows cookies on same-site navigation
      // Don't set domain in development to allow cookies across localhost ports
      ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
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
