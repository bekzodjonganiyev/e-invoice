import { Controller, Get, Headers, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';

/**
 * forward-auth endpoint called by APISIX on EVERY proxied request.
 * Returns 200 (allow) with identity headers, or a deny status (401/403/429)
 * that APISIX relays to the client. Reachable only by APISIX (private network
 * + shared X-Gateway-Secret).
 */
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('auth')
  async authorize(
    @Headers('x-gateway-secret') secret: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Headers('apikey') apikey: string | undefined,
    @Headers('x-forwarded-method') method: string | undefined,
    @Headers('x-forwarded-uri') uri: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const result = await this.auth.authorize({
      secret,
      authorization,
      apikey,
      method: method ?? 'GET',
      uri: uri ?? '/',
      requestId,
    });
    // Allowed: expose identity to downstream (APISIX can forward these to Mustang).
    res.setHeader('X-User-Id', result.userId);
    res.setHeader('X-Api-Key-Id', result.apiKeyId);
    res.status(200);
  }
}
