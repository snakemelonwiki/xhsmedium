import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as path from 'path';
import { StorageService } from '../../shared/storage/storage.service';

type UploadedMulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
};

@Controller('uploads')
export class UploadsController {
  constructor(private readonly storageService: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: UploadedMulterFile | undefined, @Body('bucket') bucket?: string) {
    if (!file?.buffer) {
      throw new BadRequestException('请上传文件');
    }

    const targetBucket = String(bucket || 'misc').trim();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    const url = await this.storageService.putBuffer(targetBucket, key, file.buffer, {
      contentType: file.mimetype,
    });

    return {
      ok: true,
      url,
      fileType: file.mimetype,
      originalName: file.originalname,
    };
  }
}
