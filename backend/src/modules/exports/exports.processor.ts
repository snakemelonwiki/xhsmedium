import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ExportsService } from './exports.service';

/**
 * BullMQ Worker — 消费 'exports' 队列里的导出 job。
 *
 * 设计要点（P-P1-02）：
 * - 与 ExportsService 配对：service 端 queue.add('export', { exportId })，
 *   本类负责从同一个 queue 拉取并执行 runExport。
 * - REDIS_URL 未配置 → 不启动 Worker；此时 service 已经走 setImmediate 兜底，
 *   不会出现"有 job 没人处理"的孤儿。
 * - Worker 启动失败（连接 / 鉴权问题）→ warn 后降级；不影响 HTTP 服务启动。
 * - 单实例部署：Worker 与 Queue 同进程；水平扩展需后续补 Redis 适配（v1.2 P2-B 文档说明）。
 * - 失败处理：BullMQ 自身的 'failed' 事件 + 我们主动写 status='failed'（双保险）。
 */

export interface ExportJobData {
  exportId: string;
  userId?: string;
  userRole?: string;
}

@Injectable()
export class ExportsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportsProcessor.name);
  private worker: Worker | null = null;
  private readonly redisUrl: string | null = (process.env.REDIS_URL || '').trim() || null;

  constructor(private readonly exportsService: ExportsService) {}

  async onModuleInit(): Promise<void> {
    if (!this.redisUrl) {
      this.logger.log('REDIS_URL not set, exports processor disabled (service uses in-process fallback)');
      return;
    }
    try {
      this.worker = new Worker<ExportJobData>(
        'exports',
        async (job: Job<ExportJobData>) => this.handleJob(job),
        {
          connection: { url: this.redisUrl },
          concurrency: 2, // 单进程下并发 2，避免大数据量占用太多 DB 连接
        },
      );

      this.worker.on('completed', (job) => {
        this.logger.log(`export job completed: ${job?.data?.exportId} (jobId=${job?.id})`);
      });
      this.worker.on('failed', (job, err) => {
        const exportId = (job?.data as ExportJobData | undefined)?.exportId;
        this.logger.warn(
          `export job failed: exportId=${exportId} jobId=${job?.id} err=${err?.message || err}`,
        );
        if (exportId) {
          // 即便 BullMQ 已记录失败，也主动回写 status='failed'，保证前端 status 字段一致
          this.exportsService
            .markFailed(exportId, err?.message || String(err))
            .catch(() => {
              /* swallow */
            });
        }
      });
      this.worker.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.warn('[exports.processor] worker error:', err?.message || err);
      });

      this.logger.log(`exports processor started (redis: ${this.redisUrl}, concurrency=2)`);
    } catch (err: any) {
      this.worker = null;
      // eslint-disable-next-line no-console
      console.warn('[exports.processor] failed to start worker:', err?.message || err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.close();
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[exports.processor] worker close failed:', err?.message || err);
      }
    }
  }

  /**
   * 单个 job 的处理：直接调用 ExportsService.runExport（与 setImmediate 路径共用）。
   * 抛错会触发 BullMQ 的 'failed' 事件，从而走到 onModuleInit 里注册的回调。
   */
  private async handleJob(job: Job<ExportJobData>): Promise<void> {
    const data = job.data;
    if (!data || !data.exportId) {
      throw new Error('export job missing exportId');
    }
    await this.exportsService.executeFromQueue(data.exportId);
  }
}
