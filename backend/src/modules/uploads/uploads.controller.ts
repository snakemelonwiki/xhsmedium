import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, Res, UnsupportedMediaTypeException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import * as path from 'path';
import { StorageService } from '../../shared/storage/storage.service';
import { getSessionUserId } from '../../common/session.utils';

type UploadedMulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size?: number;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function imageMimeOnly(_req: any, file: UploadedMulterFile, cb: (err: any, ok?: boolean) => void) {
  const mime = String(file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime) && !ALLOWED_EXT.has(ext)) {
    return cb(new UnsupportedMediaTypeException(`仅支持图片 (jpeg/png/webp/gif)，收到 ${mime || ext || 'unknown'}`), false);
  }
  cb(null, true);
}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly storageService: StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE, files: 1 },
      fileFilter: imageMimeOnly,
    }),
  )
  async upload(
    @UploadedFile() file: UploadedMulterFile | undefined,
    @Body('bucket') bucket?: string,
    @Body('keyPrefix') keyPrefix?: string,
    @Query('storage') storage?: 'local' | 'oss',
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('请上传文件');
    }
    if (file.size && file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`文件超过 ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB 上限`);
    }

    const targetBucket = String(bucket || 'misc').trim();
    const safePrefix = String(keyPrefix || '').replace(/[^\w\-]/g, '').slice(0, 32);
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const key = `${safePrefix}${stamp}${ext}`;

    const driverOverride = storage === 'oss' || storage === 'local' ? storage : undefined;
    const url = await this.storageService.putBuffer(targetBucket, key, file.buffer, {
      contentType: file.mimetype,
      driverOverride,
    });

    return {
      ok: true,
      url,
      key,
      bucket: targetBucket,
      storage: this.storageService.resolveEffectiveDriver({ driverOverride }),
      fileType: file.mimetype,
      originalName: file.originalname,
      size: file.size,
    };
  }

  /**
   * 上传配置：前端 mount 时拉一次，用于显示默认 driver、上限、bucket。
   */
  @Get('config')
  async config(@Req() req: Request) {
    const driver = this.storageService.getDriver() === 'oss' ? 'oss' : 'local';
    return {
      driver,
      defaultStorage: driver,
      bucket: 'post-covers',
      maxFileSize: MAX_FILE_SIZE,
      allowedMimeTypes: Array.from(ALLOWED_MIME),
      allowedExt: Array.from(ALLOWED_EXT),
      // 仅为前端诊断；token 解析不强制
      session: getSessionUserId(req) ? 'authenticated' : 'anonymous',
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
