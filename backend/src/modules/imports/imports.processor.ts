import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ImportsService } from './imports.service';
import { IMPORT_QUEUE_NAME, ImportJobData } from './imports.constants';

/**
 * BullMQ Worker — 消费 'imports' 队列里的导入 job。
 *
 * 设计要点（参考 exports.processor.ts）：
 * - 与 ImportsService 配对：service 端 enqueueImport({ taskId, type, payload })，
 *   本类负责从同一个 queue 拉取并执行 _doImport。
 * - REDIS_URL 未配置 → 不启动 Worker；此时 service 已经走 setImmediate 兜底，
 *   不会出现"有 job 没人处理"的孤儿。
 * - Worker 启动失败（连接 / 鉴权问题）→ warn 后降级；不影响 HTTP 服务启动。
 * - 单实例部署：Worker 与 Queue 同进程；水平扩展需后续补 Redis 适配。
 * - 失败处理：BullMQ 自身的 'failed' 事件 + 我们主动写 status='failed'（双保险）。
 */

@Injectable()
export class ImportsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportsProcessor.name);
  private worker: Worker | null = null;
  private readonly redisUrl: string | null = (process.env.REDIS_URL || '').trim() || null;

  constructor(private readonly importsService: ImportsService) {}

  async onModuleInit(): Promise<void> {
    if (!this.redisUrl) {
      this.logger.log('REDIS_URL not set, imports processor disabled (service uses in-process fallback)');
      return;
    }
    try {
      this.worker = new Worker<ImportJobData>(
        IMPORT_QUEUE_NAME,
        async (job: Job<ImportJobData>) => this.handleJob(job),
        {
          connection: { url: this.redisUrl },
          concurrency: 2,
        },
      );

      this.worker.on('completed', (job) => {
        this.logger.log(`import job completed: ${job?.data?.taskId} (jobId=${job?.id})`);
      });
      this.worker.on('failed', (job, err) => {
        const taskId = (job?.data as ImportJobData | undefined)?.taskId;
        this.logger.warn(
          `import job failed: taskId=${taskId} jobId=${job?.id} err=${err?.message || err}`,
        );
        if (taskId) {
          this.importsService
            .markTaskFailed(taskId, err?.message || String(err))
            .catch(() => {
              /* swallow */
            });
        }
      });
      this.worker.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.warn('[imports.processor] worker error:', err?.message || err);
      });

      this.logger.log(`imports processor started (redis: ${this.redisUrl}, concurrency=2)`);
    } catch (err: any) {
      this.worker = null;
      // eslint-disable-next-line no-console
      console.warn('[imports.processor] failed to start worker:', err?.message || err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.close();
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[imports.processor] worker close failed:', err?.message || err);
      }
    }
  }

  /**
   * 单个 job 的处理：直接调用 ImportsService._doImport（与 setImmediate 路径共用）。
   * 抛错会触发 BullMQ 的 'failed' 事件，从而走到 onModuleInit 里注册的回调。
   */
  private async handleJob(job: Job<ImportJobData>): Promise<void> {
    const data = job.data;
    if (!data || !data.taskId) {
      throw new Error('import job missing taskId');
    }
    await this.importsService.executeFromQueue(data);
  }
}
