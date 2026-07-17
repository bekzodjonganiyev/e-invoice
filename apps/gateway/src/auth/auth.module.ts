import { Module } from '@nestjs/common';
import { RateLimitModule } from '../ratelimit/rate-limit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [RateLimitModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
