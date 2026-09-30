import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Auth, CurrentPrincipal, Principal } from '../auth/principal';
import {
  NextExerciseView,
  SessionResultView,
  SessionStartView,
  StartSessionDto,
} from './sessions.dto';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** Open a round and get the first question in one call. */
  @Post()
  @Auth('child')
  @HttpCode(201)
  @ApiOperation({ summary: 'Start a round and return the first exercise' })
  start(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: StartSessionDto,
  ): Promise<SessionStartView> {
    return this.sessions.start(principal, dto);
  }

  /**
   * The next question, with the difficulty re-evaluated on the way.
   *
   * Safe to call twice — an unanswered question is returned again rather than
   * replaced.
   */
  @Get(':id/next')
  @Auth('child')
  @ApiOperation({ summary: 'Next exercise in the round' })
  next(
    @CurrentPrincipal() principal: Principal,
    @Param('id') sessionId: string,
  ): Promise<NextExerciseView> {
    return this.sessions.next(principal, sessionId);
  }

  /** Close the round, award badges, update the streak, and summarise. */
  @Post(':id/finish')
  @Auth('child')
  @HttpCode(200)
  @ApiOperation({ summary: 'Finish the round and return the summary' })
  finish(
    @CurrentPrincipal() principal: Principal,
    @Param('id') sessionId: string,
  ): Promise<SessionResultView> {
    return this.sessions.finish(principal, sessionId);
  }
}
