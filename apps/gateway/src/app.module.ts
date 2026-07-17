import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GatewayConfigModule } from './config/config.module';
import { RedisModule } from './redis/redis.module';
import { SupabaseModule } from './supabase/supabase.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { KeysModule } from './keys/keys.module';
import { AuthModule } from './auth/auth.module';
import { RateLimitModule } from './ratelimit/rate-limit.module';
import { UsageModule } from './usage/usage.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    GatewayConfigModule,
    RedisModule,
    SupabaseModule,
    BootstrapModule,
    KeysModule,
    RateLimitModule,
    AuthModule,
    UsageModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
