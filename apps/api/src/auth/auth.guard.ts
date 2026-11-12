import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../chain/chain.service.js';
import { AuthService, type AuthUser } from './auth.service.js';

export const ROLES_KEY = 'donchain:roles';
/** Exige au moins un de ces rôles attestés on-chain (vérifiés à chaque requête, cache 30 s). */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export type AuthedRequest = Request & { user: AuthUser };

/** Authentifie par jeton Bearer, puis vérifie les rôles demandés via @RequireRoles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Connexion requise.');
    req.user = await this.auth.userFromToken(token);

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles && roles.length > 0) {
      const held = await this.auth.rolesOf(req.user.address);
      if (!roles.some((r) => held.includes(r))) {
        throw new ForbiddenException(`Rôle attesté requis : ${roles.join(' ou ')}.`);
      }
    }
    return true;
  }
}
