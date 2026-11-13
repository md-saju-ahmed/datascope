import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { APP_ENVIRONMENT, EnvironmentError } from './config/environment.js';
import type { AppEnvironment } from './config/environment.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const environment = app.get<AppEnvironment>(APP_ENVIRONMENT);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(environment.PORT, environment.API_HOST);
}

bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof EnvironmentError ? error.message : 'API startup failed',
  );
  process.exitCode = 1;
});
