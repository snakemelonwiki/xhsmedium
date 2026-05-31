import { BadRequestException, Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
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

  /**
   * 将数据库里的稳定图片路径重定向到实际可读地址。
   * 本地模式重定向到 /uploads，OSS 私有模式重定向到短期签名 URL。
   */
  @Get('view/:bucket/:key')
  async view(@Param('bucket') bucket: string, @Param('key') key: string, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(this.storageService.getReadableUrl(bucket, key));
  }
}
