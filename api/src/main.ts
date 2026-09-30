// Loads .env when one is present, for running outside Docker. In a container
// there is no .env file (.dockerignore excludes it) and this is a silent
// no-op — compose supplies the environment directly.
import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppError } from './common/errors';
import { AppConfig, CONFIG } from './config/env';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(CONFIG);

  // Health sits at the root so Compose and a curl can reach it without
  // knowing the API version.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/llm'] });

  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Validation failures come out in the same envelope as everything else,
      // with a kidMessage the interface is allowed to render.
      exceptionFactory: (errors) =>
        new AppError('VALIDATION_FAILED', 'Request body failed validation', {
          fields: errors.map((e) => ({
            field: e.property,
            problems: Object.values(e.constraints ?? {}),
          })),
        }),
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle('Kids Math Learning API')
    .setDescription(
      'Math practice for children aged 5-10. Exercises are generated and graded ' +
        'server-side: the correct answer is never serialised to a client. The AI ' +
        'tutor runs against a local Ollama model and every response it produces ' +
        'passes a seven-check safety gate before a child can see it.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addTag('auth', 'Parent accounts and child-scoped tokens')
    .addTag('children', 'Child profiles')
    .addTag('topics', 'The four topics with this child’s level in each')
    .addTag('sessions', 'Rounds of ten questions')
    .addTag('attempts', 'Answer submission and grading')
    .addTag('tutor', 'AI explanations')
    .addTag('progress', 'Derived progress and badges')
    .addTag('health', 'Liveness, database and AI status')
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc), {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(config.port, '0.0.0.0');
  logger.log(`api listening on http://localhost:${config.port}`);
  logger.log(`docs at http://localhost:${config.port}/api/docs`);
}

void bootstrap();
