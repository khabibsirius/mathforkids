import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from './auth.guard';
import { LoginDto, RefreshDto, RegisterDto, TokenPairResponse } from './auth.dto';
import { AuthService } from './auth.service';
import { Auth, CurrentPrincipal, Principal } from './principal';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Create a parent account. Returns an access and refresh token pair. */
  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a parent account' })
  register(@Body() dto: RegisterDto): Promise<TokenPairResponse> {
    return this.auth.register(dto.email, dto.password);
  }

  /**
   * Exchange email and password for a token pair.
   *
   * Returns the same 401 whether or not the email is registered.
   */
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in as a parent' })
  login(@Body() dto: LoginDto): Promise<TokenPairResponse> {
    return this.auth.login(dto.email, dto.password);
  }

  /** Rotate an expiring access token using the refresh token. */
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the token pair' })
  refresh(@Body() dto: RefreshDto): Promise<TokenPairResponse> {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Echoes back the principal the presented token resolves to. */
  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Auth()
  @ApiOperation({ summary: 'Identify the current token' })
  me(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }
}
