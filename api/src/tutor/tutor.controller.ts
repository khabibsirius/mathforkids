import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Auth } from '../auth/principal';
import { AppError } from '../common/errors';
import { TicketView, TutorService } from './tutor.service';

@ApiTags('tutor')
@ApiBearerAuth()
@Controller('hints')
@UseGuards(AuthGuard)
export class TutorController {
  constructor(private readonly tutor: TutorService) {}

  /**
   * Poll for the tutor's explanation.
   *
   * The client shows the static hint straight away and calls this twice, about
   * 1.5 seconds apart. `pending` or `failed` both mean "keep the static hint" —
   * there is no state in which the child is left staring at nothing.
   */
  @Get(':ticket')
  @Auth('child')
  @ApiOperation({ summary: 'Fetch the AI explanation for a wrong answer' })
  get(@Param('ticket') ticket: string): TicketView {
    const view = this.tutor.peek(ticket);
    if (!view) throw new AppError('HINT_NOT_FOUND', `No ticket ${ticket}`);
    return view;
  }
}
