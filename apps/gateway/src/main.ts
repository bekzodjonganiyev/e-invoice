import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { CONFIG, GatewayConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.enableShutdownHooks(); // ensures OnApplicationShutdown flush runs

  const config = app.get<GatewayConfig>(CONFIG);
  await app.listen(config.port);
  new Logger('Gateway').log(`forward-auth gateway listening on :${config.port}`);
}

bootstrap();
