import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { TutorService } from '../tutor/tutor.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly bootedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tutor: TutorService,
  ) {}

  /** Process and database. Unauthenticated so Compose can use it. */
  @Get()
  @ApiOperation({ summary: 'Liveness and database connectivity' })
  async root(): Promise<Record<string, unknown>> {
    const db = await this.prisma.ping();
    return {
      status: db ? 'ok' : 'degraded',
      database: db ? 'up' : 'down',
      uptimeSeconds: Math.round((Date.now() - this.bootedAt) / 1000),
    };
  }

  /**
   * Ollama status, model availability and the safety gate's rejection rate.
   *
   * This endpoint exists because "the AI does not work" is otherwise
   * unfalsifiable from outside the process. A reviewer with no Ollama
   * installed should be able to see exactly that, and see that the product
   * carries on regardless.
   */
  @Get('llm')
  @ApiOperation({ summary: 'AI tutor status, model, and safety gate statistics' })
  llm(): Promise<Record<string, unknown>> {
    return this.tutor.health();
  }
}
