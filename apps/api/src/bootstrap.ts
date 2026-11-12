import { ValidationPipe, type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { APP_CONFIG, type AppConfig } from './config.js';

/** Réglages communs à l'application et aux tests e2e. */
export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: config.corsOrigins, methods: ['GET', 'POST'], maxAge: 600 });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  return config;
}
