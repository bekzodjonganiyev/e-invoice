import { Module } from '@nestjs/common';
import { MustangController } from './mustang/mustang.controller';
import { MustangService } from './mustang/mustang.service';
import { S3Controller } from './s3/s3.controller';
import { S3Service } from './s3/s3.service';

@Module({
  controllers: [MustangController, S3Controller],
  providers: [MustangService, S3Service],
})
export class AppModule {}
