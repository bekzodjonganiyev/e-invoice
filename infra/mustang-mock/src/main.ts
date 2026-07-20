import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';

const API_PREFIX = 'api/v1.8.2';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Accept raw XML bodies (ciitoubl / cii2ubl) as a plain string.
  app.use(
    express.text({
      type: ['application/xml', 'text/xml', 'application/*+xml'],
      limit: '25mb',
    }),
  );
  // Larger JSON bodies for invoice payloads.
  app.use(express.json({ limit: '25mb' }));

  // Mirror the real Mustangserver context path.
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('Mustangserver (MOCK)')
    .setDescription(
      'Local mock of the Mustangproject e-invoice REST API. ' +
        'Responses are fake stubs that match the shape of the real service ' +
        '(Factur-X / ZUGFeRD / Order-X, CII<->UBL, validation, S3 file store).',
    )
    .setVersion('1.8.2')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Served at /api/v1.8.2/swagger-ui  (mirrors the original swagger-ui path)
  SwaggerModule.setup(`${API_PREFIX}/swagger-ui`, app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`\n  Mustang mock server running`);
  console.log(`  → API base:   http://localhost:${port}/${API_PREFIX}`);
  console.log(`  → Swagger UI: http://localhost:${port}/${API_PREFIX}/swagger-ui`);
  console.log(`  → Health:     http://localhost:${port}/${API_PREFIX}/mustang/ping\n`);
}
bootstrap();
