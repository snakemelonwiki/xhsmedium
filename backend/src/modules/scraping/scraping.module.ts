import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScrapingAlert } from './scraping-alert.entity';
import { ScrapingAlertService } from './scraping-alert.service';
import { ScrapingLockService } from './scraping-lock.service';
import { ScrapingAlertsController } from './scraping.controller';

/**
 * 抓取子模块：全局抓取锁 + 失败告警（owner-only）。
 *
 * 暴露给 ParserModule 的是：
 *   - ScrapingLockService.run(fn)        串行化抓取任务
 *   - ScrapingAlertService.record*       失败/成功计数与告警写库
 *
 * 暴露给前端的是 /api/scraping-alerts 一组 owner 端点。
 */
@Module({
  imports: [TypeOrmModule.forFeature([ScrapingAlert])],
  controllers: [ScrapingAlertsController],
  providers: [ScrapingAlertService, ScrapingLockService],
  exports: [ScrapingAlertService, ScrapingLockService],
})
export class ScrapingModule {}
