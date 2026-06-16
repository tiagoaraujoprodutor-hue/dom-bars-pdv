import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors();
  // Validação de entrada é feita por ZodValidationPipe em cada rota (ver PLAN §5 / CLAUDE.md).

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  Logger.log(`API no ar em http://0.0.0.0:${port}`, 'Bootstrap');
}

void bootstrap();
