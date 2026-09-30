import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChildrenModule } from '../children/children.module';
import { TopicsController } from './topics.controller';

@Module({
  imports: [AuthModule, ChildrenModule],
  controllers: [TopicsController],
})
export class TopicsModule {}
