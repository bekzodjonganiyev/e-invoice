import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { S3Service } from './s3.service';

@ApiTags('s3')
@Controller('s3')
export class S3Controller {
  constructor(private readonly s3: S3Service) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file, returns its storage key' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Headers('USERNAME') _user?: string,
  ) {
    return this.s3.upload(file);
  }

  @Get('list')
  @ApiOperation({ summary: 'List stored objects' })
  list(@Headers('USERNAME') _user?: string) {
    return this.s3.list();
  }

  @Get('download/:key')
  @ApiOperation({ summary: 'Download a stored object by key' })
  download(
    @Param('key') key: string,
    @Res() res: Response,
    @Headers('USERNAME') _user?: string,
  ) {
    const obj = this.s3.get(key);
    res.set({
      'Content-Type': obj.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${obj.filename}"`,
      'Content-Length': String(obj.size),
    });
    res.end(obj.data);
  }

  @Get('delete/:key')
  @ApiOperation({ summary: 'Delete a stored object by key' })
  delete(@Param('key') key: string, @Headers('USERNAME') _user?: string) {
    return this.s3.delete(key);
  }
}
