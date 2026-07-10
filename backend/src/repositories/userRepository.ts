import { prisma, type User } from '@moodsync/database';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export const userRepository = {
  async create(input: CreateUserInput): Promise<User> {
    return prisma.user.create({ data: { email: input.email.toLowerCase(), passwordHash: input.passwordHash } });
  },

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },
};
