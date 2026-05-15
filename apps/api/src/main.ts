import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({ origin: true, credentials: true });

  const port = Number(process.env.PORT ?? 3010);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
