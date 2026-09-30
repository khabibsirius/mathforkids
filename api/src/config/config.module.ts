import { Global, Logger, Module } from '@nestjs/common';
import { AppConfig, CONFIG, loadConfig } from './env';

/**
 * Global so that CONFIG is injectable anywhere without every module importing
 * a config module. loadConfig throws on a bad environment, so a misconfigured
 * deployment fails at boot with one readable list rather than at the first
 * request that happens to need the missing value.
 */
@Global()
@Module({
  providers: [
    {
      provide: CONFIG,
      useFactory: (): AppConfig => {
        const config = loadConfig();
        const logger = new Logger('Config');
        logger.log(`env=${config.nodeEnv} port=${config.port}`);
        logger.log(
          config.tutor.enabled
            ? `tutor=on model=${config.tutor.model} at ${config.tutor.baseUrl}`
            : 'tutor=off — static hints only (this is a complete product)',
        );
        return config;
      },
    },
  ],
  exports: [CONFIG],
})
export class AppConfigModule {}
