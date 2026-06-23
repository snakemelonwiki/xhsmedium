import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScrapingAlert } from './scraping-alert.entity';
import { ScrapingAlertService } from './scraping-alert.service';
import { ScrapingLockService } from './scraping-lock.service';
import { ScrapingAlertsController } from './scraping.controller';
import { BrowserPoolService } from './core/browser-pool.service';
import { ScraperService } from './core/scraper.service';

/**
 * Scraping V2 模块
 *
 * 重构后暴露的核心服务：
 *   - ScrapingLockService:  抓取串行化锁（内存级，单进程互斥）
 *   - ScrapingAlertService:  失败告警计数与写库
 *   - BrowserPoolService:    Playwright 浏览器上下文池
 *   - ScraperService:        统一抓取入口（URL → HAR → 数据提取 → 封面截图）
 *
 * 旧版依赖（scripts/parser-core.js → metricsFetcher.js）被完全替代，
 * 不再通过 require('../../../scripts/parser-core') 跨模块调用。
 */
@Module({
  imports: [TypeOrmModule.forFeature([ScrapingAlert])],
  controllers: [ScrapingAlertsController],
  providers: [
    // V1 服务（向后兼容）
    ScrapingAlertService,
    ScrapingLockService,
    // V2 服务（新架构）
    BrowserPoolService,
    ScraperService,
  ],
  exports: [
    // V1 兼容导出（ParserService 仍依赖这些）
    ScrapingAlertService,
    ScrapingLockService,
    // V2 核心导出（供 ParserService 使用）
    BrowserPoolService,
    ScraperService,
  ],
})
export class ScrapingModule {}
