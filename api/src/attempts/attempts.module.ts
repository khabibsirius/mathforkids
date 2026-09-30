import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChildrenModule } from '../children/children.module';
import { TutorModule } from '../tutor/tutor.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';

@Module({
  imports: [AuthModule, ChildrenModule, TutorModule],
  controllers: [AttemptsController],
  providers: [AttemptsService],
})
export class AttemptsModule {}
