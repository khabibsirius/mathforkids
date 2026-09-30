import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  /** Parent's email. The only identifier in the system. */
  @IsEmail({}, { message: 'That does not look like an email address' })
  @MaxLength(254)
  email: string;

  /** Minimum eight characters. Length beats composition rules. */
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'That does not look like an email address' })
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

export class TokenPairResponse {
  accessToken: string;
  refreshToken: string;
  /** Seconds until accessToken expires. */
  expiresIn: number;
  parent: { id: string; email: string };
}

export class ChildTokenResponse {
  childToken: string;
  expiresIn: number;
  child: { id: string; name: string; age: number; avatar: string };
}
