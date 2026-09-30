import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Auth, CurrentPrincipal, Principal } from '../auth/principal';
import { AttemptResultView, SubmitAttemptDto } from './attempts.dto';
import { AttemptsService } from './attempts.service';

@ApiTags('attempts')
@ApiBearerAuth()
@Controller('attempts')
@UseGuards(AuthGuard)
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  /**
   * Submit an answer.
   *
   * Grading happens against the stored exercise row, so the client is never
   * trusted with the answer or with marking itself. Returns immediately with a
   * static hint on a wrong answer; the AI explanation is fetched separately.
   */
  @Post()
  @Auth('child')
  @HttpCode(201)
  @ApiOperation({ summary: 'Submit an answer and get feedback' })
  submit(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: SubmitAttemptDto,
  ): Promise<AttemptResultView> {
    return this.attempts.submit(principal, dto);
  }
}
