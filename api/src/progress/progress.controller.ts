import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Auth, CurrentPrincipal, Principal } from '../auth/principal';
import { ProgressView } from './progress.dto';
import { ProgressService } from './progress.service';

@ApiTags('progress')
@ApiBearerAuth()
@Controller('children/:id/progress')
@UseGuards(AuthGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /**
   * Everything the parent dashboard and the child's own trophy shelf need, in
   * one call. Readable by the owning parent or by the child themselves — the
   * authorisation check is the same one every other child-scoped route uses.
   */
  @Get()
  @Auth()
  @ApiOperation({ summary: 'Progress, per-topic mastery, badges and a 14-day series' })
  overview(
    @CurrentPrincipal() principal: Principal,
    @Param('id') childId: string,
  ): Promise<ProgressView> {
    return this.progress.overview(principal, childId);
  }
}
