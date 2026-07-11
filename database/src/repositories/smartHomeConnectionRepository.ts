import { prisma } from '../prismaClient.js';
import { ConnectionStatus, type SmartHomeProvider, type Prisma } from '@prisma/client';
import { oauthTokenRepository, type TokenSet } from './oauthTokenRepository.js';

export const smartHomeConnectionRepository = {
  async upsertConnection(params: {
    userId: string;
    provider: SmartHomeProvider;
    providerAccountId?: string | undefined;
    tokens: TokenSet;
    metadata?: Prisma.InputJsonValue;
  }) {
    const existing = await prisma.smartHomeConnection.findUnique({
      where: { userId_provider: { userId: params.userId, provider: params.provider } },
    });

    if (existing?.oauthTokenId) {
      await oauthTokenRepository.update(existing.oauthTokenId, params.tokens);
      return prisma.smartHomeConnection.update({
        where: { id: existing.id },
        data: {
          status: ConnectionStatus.ACTIVE,
          providerAccountId: params.providerAccountId ?? null,
          metadata: params.metadata ?? (existing.metadata as Prisma.InputJsonValue),
        },
      });
    }

    const oauthTokenId = await oauthTokenRepository.create(params.tokens);
    return prisma.smartHomeConnection.upsert({
      where: { userId_provider: { userId: params.userId, provider: params.provider } },
      create: {
        userId: params.userId,
        provider: params.provider,
        providerAccountId: params.providerAccountId ?? null,
        oauthTokenId,
        status: ConnectionStatus.ACTIVE,
        metadata: params.metadata ?? {},
      },
      update: { oauthTokenId, status: ConnectionStatus.ACTIVE, providerAccountId: params.providerAccountId ?? null },
    });
  },

  async findByUserAndProvider(userId: string, provider: SmartHomeProvider) {
    return prisma.smartHomeConnection.findUnique({ where: { userId_provider: { userId, provider } } });
  },

  async listActive(provider: SmartHomeProvider) {
    return prisma.smartHomeConnection.findMany({ where: { provider, status: ConnectionStatus.ACTIVE } });
  },

  /** Includes each connection's synced devices — the dashboard's devices
   * panel is keyed off this, not a separate device query, since a device
   * only ever makes sense in the context of the connection that owns it. */
  async listForUser(userId: string) {
    return prisma.smartHomeConnection.findMany({
      where: { userId },
      orderBy: { provider: 'asc' },
      include: { connectedDevices: true },
    });
  },

  async markStatus(id: string, status: ConnectionStatus): Promise<void> {
    await prisma.smartHomeConnection.update({ where: { id }, data: { status } });
  },

  async disconnect(id: string, userId: string): Promise<boolean> {
    const result = await prisma.smartHomeConnection.updateMany({
      where: { id, userId },
      data: { status: ConnectionStatus.REVOKED },
    });
    return result.count > 0;
  },

  async replaceDevices(
    connectionId: string,
    devices: Array<{ externalDeviceId: string; name: string; deviceType: string; room?: string | undefined }>,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.connectedDevice.deleteMany({ where: { smartHomeConnectionId: connectionId } }),
      prisma.connectedDevice.createMany({
        data: devices.map((d) => ({
          smartHomeConnectionId: connectionId,
          externalDeviceId: d.externalDeviceId,
          name: d.name,
          deviceType: d.deviceType,
          room: d.room ?? null,
        })),
      }),
    ]);
  },
};
