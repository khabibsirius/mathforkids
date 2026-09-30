import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { ChildTokenResponse } from '../auth/auth.dto';
import { Auth, CurrentPrincipal, Principal } from '../auth/principal';
import { ChildView, CreateChildDto, UpdateChildDto } from './children.dto';
import { ChildrenService } from './children.service';

@ApiTags('children')
@ApiBearerAuth()
@Controller('children')
@UseGuards(AuthGuard)
export class ChildrenController {
  constructor(
    private readonly children: ChildrenService,
    private readonly auth: AuthService,
  ) {}

  /** Every profile under the signed-in parent. */
  @Get()
  @Auth('parent')
  @ApiOperation({ summary: 'List child profiles' })
  list(@CurrentPrincipal() principal: Principal): Promise<ChildView[]> {
    return this.children.list(principal.id);
  }

  /** Create a profile. Starting levels are seeded from the age. */
  @Post()
  @Auth('parent')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a child profile' })
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateChildDto,
  ): Promise<ChildView> {
    return this.children.create(principal.id, dto);
  }

  /**
   * Mint a child-scoped token.
   *
   * This is the whole of "child login" — the parent is already authenticated
   * and the child taps their picture.
   */
  @Post(':id/token')
  @Auth('parent')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start a session as this child' })
  token(
    @CurrentPrincipal() principal: Principal,
    @Param('id') childId: string,
  ): Promise<ChildTokenResponse> {
    return this.auth.childToken(principal.id, childId);
  }

  /** Readable by the parent who owns it, or by the child themselves. */
  @Get(':id')
  @Auth()
  @ApiOperation({ summary: 'Read one child profile' })
  get(@CurrentPrincipal() principal: Principal, @Param('id') childId: string): Promise<ChildView> {
    return this.children.get(principal, childId);
  }

  @Patch(':id')
  @Auth('parent')
  @ApiOperation({ summary: 'Rename a child or change their avatar' })
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') childId: string,
    @Body() dto: UpdateChildDto,
  ): Promise<ChildView> {
    return this.children.update(principal.id, childId, dto);
  }
}
