import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChildrenModule } from '../children/children.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [AuthModule, ChildrenModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
