import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig, CONFIG } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtSecret,
        // Per-token expiry is set at sign time: 15m for access, 7d for
        // refresh, 12h for a child session.
        signOptions: { issuer: 'mathforkids' },
        verifyOptions: { issuer: 'mathforkids' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, AuthGuard],
  exports: [AuthService, AuthGuard, JwtModule],
})
export class AuthModule {}
