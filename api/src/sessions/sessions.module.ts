import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChildrenModule } from '../children/children.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [AuthModule, ChildrenModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
