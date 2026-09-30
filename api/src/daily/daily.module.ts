import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChildrenModule } from '../children/children.module';
import { DailyController } from './daily.controller';
import { DailyService } from './daily.service';

@Module({
  imports: [AuthModule, ChildrenModule],
  controllers: [DailyController],
  providers: [DailyService],
  exports: [DailyService],
})
export class DailyModule {}
