import { Injectable, NotFoundException } from '@nestjs/common';

interface StoredObject {
  key: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  data: Buffer;
}

/** In-memory stand-in for the real S3-backed file store. */
@Injectable()
export class S3Service {
  private readonly store = new Map<string, StoredObject>();
  private seq = 0;

  upload(file: Express.Multer.File) {
    if (!file) {
      return { error: 'no file provided (field name must be "file")' };
    }
    this.seq += 1;
    const key = `mock-${String(this.seq).padStart(6, '0')}-${file.originalname}`;
    this.store.set(key, {
      key,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      data: file.buffer,
    });
    return { key, filename: file.originalname, size: file.size };
  }

  list() {
    return Array.from(this.store.values()).map(
      ({ data, ...meta }) => meta, // eslint-disable-line @typescript-eslint/no-unused-vars
    );
  }

  get(key: string): StoredObject {
    const obj = this.store.get(key);
    if (!obj) {
      throw new NotFoundException(`No object with key "${key}"`);
    }
    return obj;
  }

  delete(key: string) {
    const existed = this.store.delete(key);
    if (!existed) {
      throw new NotFoundException(`No object with key "${key}"`);
    }
    return { key, deleted: true };
  }
}
