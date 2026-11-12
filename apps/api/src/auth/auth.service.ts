import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getAddress, type Address, type Hex } from 'viem';
import { generateSiweNonce, parseSiweMessage, verifySiweMessage } from 'viem/siwe';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { ChainService, type Role } from '../chain/chain.service.js';
import { DatabaseService } from '../db/database.service.js';

export type AuthUser = { address: Address };

const NONCE_TTL_SECONDS = 600;

/** Connexion « Sign-In with Ethereum » (EIP-4361) puis jeton d'accès court (§11). */
@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ChainService) private readonly chain: ChainService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async createNonce(): Promise<{ nonce: string; expiresAt: string }> {
    const nonce = generateSiweNonce();
    const expiresAt = new Date(Date.now() + NONCE_TTL_SECONDS * 1000);
    await this.db.query('delete from siwe_nonces where expires_at < now()');
    await this.db.query('insert into siwe_nonces (nonce, expires_at) values ($1, $2)', [nonce, expiresAt]);
    return { nonce, expiresAt: expiresAt.toISOString() };
  }

  async verify(message: string, signature: Hex) {
    const fields = parseSiweMessage(message);
    if (!fields.address || !fields.nonce || !fields.domain) throw new UnauthorizedException('Message SIWE incomplet.');
    if (!this.config.siweDomains.includes(fields.domain)) throw new UnauthorizedException('Domaine non autorisé.');
    if (fields.chainId !== this.config.chainId) throw new UnauthorizedException('Mauvais réseau.');

    // Nonce à usage unique : consommé avant même la vérification de signature (anti-rejeu)
    const { rowCount } = await this.db.query('delete from siwe_nonces where nonce = $1 and expires_at > now()', [
      fields.nonce,
    ]);
    if (!rowCount) throw new UnauthorizedException('Nonce inconnu ou expiré.');

    // Vérifie aussi expiration / notBefore du message ; supporte les smart wallets (ERC-1271 / ERC-6492)
    const valid = await verifySiweMessage(this.chain.client, {
      message,
      signature,
      domain: fields.domain,
      nonce: fields.nonce,
    });
    if (!valid) throw new UnauthorizedException('Signature invalide.');

    const address = getAddress(fields.address);
    const token = await this.jwt.signAsync({ sub: address }, { expiresIn: this.config.jwtTtl });
    const roles = await this.chain.rolesOf(address);
    return {
      token,
      address,
      roles,
      expiresAt: new Date(Date.now() + this.config.jwtTtl * 1000).toISOString(),
    };
  }

  async userFromToken(token: string): Promise<AuthUser> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      return { address: getAddress(payload.sub) };
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré.');
    }
  }

  rolesOf(address: Address): Promise<Role[]> {
    return this.chain.rolesOf(address);
  }
}
