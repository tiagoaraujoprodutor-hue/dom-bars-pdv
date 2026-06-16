import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors();
  // Validação de entrada é feita por ZodValidationPipe em cada rota (ver PLAN §5 / CLAUDE.md).

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PDV Eventos & Bares — API')
    .setDescription('API multiempresa/multievento do PDV. Auth Bearer (JWT).')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  Logger.log(`API no ar em http://0.0.0.0:${port} (Swagger em /docs)`, 'Bootstrap');
}

void bootstrap();
