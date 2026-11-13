import { Global, Module } from '@nestjs/common';
import { APP_ENVIRONMENT, parseEnvironment } from './environment.js';

@Global()
@Module({
  providers: [
    {
      provide: APP_ENVIRONMENT,
      useFactory: () => parseEnvironment(process.env),
    },
  ],
  exports: [APP_ENVIRONMENT],
})
export class EnvironmentModule {}
