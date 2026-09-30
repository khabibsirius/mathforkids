import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Auth, CurrentPrincipal, Principal } from '../auth/principal';
import { DailyChallengeView, DailyClaimView } from './daily.dto';
import { DailyService } from './daily.service';

@ApiTags('daily')
@ApiBearerAuth()
@Controller('children/:id/daily')
@UseGuards(AuthGuard)
export class DailyController {
  constructor(private readonly daily: DailyService) {}

  /**
   * Today's challenge with this child's progress towards it.
   *
   * Readable by the child or by the owning parent, through the same single
   * authorisation check every other child-scoped route uses.
   */
  @Get()
  @Auth()
  @ApiOperation({ summary: 'Today’s challenge and progress towards it' })
  today(
    @CurrentPrincipal() principal: Principal,
    @Param('id') childId: string,
  ): Promise<DailyChallengeView> {
    return this.daily.today(principal, childId);
  }

  /** Collect the reward. Completion is recomputed server-side. */
  @Post('claim')
  @Auth('child')
  @HttpCode(200)
  @ApiOperation({ summary: 'Collect today’s reward' })
  claim(
    @CurrentPrincipal() principal: Principal,
    @Param('id') childId: string,
  ): Promise<DailyClaimView> {
    return this.daily.claim(principal, childId);
  }
}
