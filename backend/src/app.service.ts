import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return '运营中台 NestJS 后端已启动';
  }
}
