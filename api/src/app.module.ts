import { Module } from '@nestjs/common';
import { AttemptsModule } from './attempts/attempts.module';
import { AuthModule } from './auth/auth.module';
import { ChildrenModule } from './children/children.module';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { SessionsModule } from './sessions/sessions.module';
import { TopicsModule } from './topics/topics.module';
import { TutorModule } from './tutor/tutor.module';

/**
 * Module boundaries map one-to-one onto the nouns in the BPMN process models
 * in docs/bpmn/ — which is the point of having drawn them before writing any
 * of this.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuthModule,
    ChildrenModule,
    TopicsModule,
    SessionsModule,
    AttemptsModule,
    TutorModule,
    ProgressModule,
    HealthModule,
  ],
})
export class AppModule {}
