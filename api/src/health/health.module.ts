import { Module } from '@nestjs/common';
import { TutorModule } from '../tutor/tutor.module';
import { HealthController } from './health.controller';

@Module({
  imports: [TutorModule],
  controllers: [HealthController],
})
export class HealthModule {}
