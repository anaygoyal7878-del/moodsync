import { hashPassword, verifyPassword } from '../auth/password.js';
import { signAccessToken } from '../auth/jwt.js';
import { generateRefreshToken } from '../auth/refreshToken.js';
import { userRepository } from '../repositories/userRepository.js';
import { refreshTokenRepository } from '../repositories/refreshTokenRepository.js';

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('An account with this email already exists');
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
  }
}

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('Refresh token is invalid, expired, or revoked');
  }
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface RequestContext {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

async function issueTokenPair(userId: string, context: RequestContext): Promise<TokenPair> {
  const accessToken = await signAccessToken(userId);
  const { token: refreshToken, expiresAt } = generateRefreshToken();
  await refreshTokenRepository.store({
    userId,
    token: refreshToken,
    expiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });
  return { accessToken, refreshToken };
}

export const authService = {
  async signup(email: string, password: string, context: RequestContext): Promise<TokenPair> {
    const existing = await userRepository.findByEmail(email);
    if (existing) throw new EmailAlreadyRegisteredError();

    const passwordHash = await hashPassword(password);
    const user = await userRepository.create({ email, passwordHash });
    return issueTokenPair(user.id, context);
  },

  async login(email: string, password: string, context: RequestContext): Promise<TokenPair> {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new InvalidCredentialsError();

    const validPassword = await verifyPassword(user.passwordHash, password);
    if (!validPassword) throw new InvalidCredentialsError();

    return issueTokenPair(user.id, context);
  },

  /** Rotates the refresh token on every use: the old one is revoked and a
   * new one issued, so a stolen-but-unused refresh token becomes
   * detectable (reuse of a revoked token is a strong breach signal a
   * production system would alert on). */
  async refresh(refreshToken: string, context: RequestContext): Promise<TokenPair> {
    const record = await refreshTokenRepository.findActive(refreshToken);
    if (!record) throw new InvalidRefreshTokenError();

    await refreshTokenRepository.revoke(refreshToken);
    return issueTokenPair(record.userId, context);
  },

  async logout(refreshToken: string): Promise<void> {
    await refreshTokenRepository.revoke(refreshToken);
  },
};
