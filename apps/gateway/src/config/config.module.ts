import { Global, Module } from '@nestjs/common';
import { CONFIG, loadConfig } from './configuration';

/** Loads and validates gateway config once, exposing it under the CONFIG token. */
@Global()
@Module({
  providers: [
    {
      provide: CONFIG,
      useFactory: () => loadConfig(),
    },
  ],
  exports: [CONFIG],
})
export class GatewayConfigModule {}
