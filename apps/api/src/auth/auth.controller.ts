import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Hex } from 'viem';
import { AuthGuard, type AuthedRequest } from './auth.guard.js';
import { VerifyDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /** Étape 1 : nonce à inclure dans le message SIWE. */
  @Post('nonce')
  @HttpCode(200)
  nonce() {
    return this.auth.createNonce();
  }

  /** Étape 2 : message SIWE signé -> jeton d'accès court. */
  @Post('verify')
  @HttpCode(200)
  verify(@Body() body: VerifyDto) {
    return this.auth.verify(body.message, body.signature as Hex);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthedRequest) {
    return { address: req.user.address, roles: await this.auth.rolesOf(req.user.address) };
  }
}
