import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('connected to postgres');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Used by GET /health to prove the connection is live, not just configured. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      this.logger.error(`database ping failed: ${(err as Error).message}`);
      return false;
    }
  }
}
