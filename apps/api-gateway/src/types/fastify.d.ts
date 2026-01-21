import 'fastify';
import { Session } from '@fastify/session';

declare module 'fastify' {
  interface FastifyRequest {
    session: Session & {
      userId?: string;
      save: (callback?: (err?: any) => void) => void;
      destroy: (callback?: (err?: any) => void) => void;
    };
  }
}
