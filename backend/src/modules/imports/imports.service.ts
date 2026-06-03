import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { ImportTask } from '../../entities/import-task.entity';
import { Lead } from '../../entities/lead.entity';
import { Post } from '../../entities/post.entity';
import { makeId } from '../../shared/utils/id-generator';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';
import { StorageService } from '../../shared/storage/storage.service';
import { IMPORT_QUEUE_NAME, ImportJobData } from './imports.constants';

export interface ImportRowError {
  row: number;
  reason: string;
  raw?: string;
}

export interface ImportPasteResult {
  ok: boolean;
  importTaskId: string;
  total: number;
  success: number;
  fail: number;
  errors: ImportRowError[];
  errorFileUrl: string | null;
}

interface ParsedLeadRow {
  platform: string;
  contact: string;
  nickname: string;
  accountName: string;
  remark: string;
}

@Injectable()
export class ImportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportsService.name);
  private importQueue: Queue | null = null;
  private readonly redisUrl: string | null = (process.env.REDIS_URL || '').trim() || null;

  constructor(
    @InjectRepository(ImportTask)
    private readonly importTaskRepository: Repository<ImportTask>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    private readonly notificationsService: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 启动时按需建 bullmq Queue。
   * - REDIS_URL 未配置 → 不建 Queue，导入走 in-process setImmediate（与异步化前行为一致）
   * - REDIS_URL 已配置但连接失败 → 静默回退，记录 warn，不影响主流程
   */
  async onModuleInit(): Promise<void> {
    if (!this.redisUrl) {
      this.logger.log('REDIS_URL not set, imports use in-process setImmediate (fallback)');
      return;
    }
    try {
      this.importQueue = new Queue(IMPORT_QUEUE_NAME, {
        connection: { url: this.redisUrl },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 200,
          attempts: 1,
        },
      });
      this.importQueue.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.warn('[imports] queue error:', err?.message || err);
      });
      this.logger.log(`imports queue initialized (redis: ${this.redisUrl})`);
    } catch (err: any) {
      this.importQueue = null;
      // eslint-disable-next-line no-console
      console.warn('[imports] failed to init bullmq queue, falling back to in-process:', err?.message || err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.importQueue) {
      try {
        await this.importQueue.close();
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[imports] queue close failed:', err?.message || err);
      }
    }
  }

  /**
   * 创建导入任务并入队（异步入口）。
   * 返回 taskId，前端轮询 GET /import-tasks/:id 获取状态。
   */
  async enqueueImport(params: {
    type: 'leads-import' | 'posts-import' | 'leads-paste' | 'posts-paste';
    userId: string;
    employeeId: string;
    rows?: string[];
    fileBuffer?: Buffer;
  }): Promise<{ taskId: string; status: string }> {
    const taskId = makeId();
    const { type, userId, employeeId, rows, fileBuffer } = params;

    // 存储原始数据到 payload_json
    const payload: Record<string, any> = {
      type,
      rows: rows || [],
    };
    if (fileBuffer) {
      // 文件模式：存储文件内容
      payload.fileContent = fileBuffer.toString('utf8');
    }

    // 创建任务记录
    await this.importTaskRepository.save(this.importTaskRepository.create({
      id: taskId,
      importType: type.replace('-paste', '').replace('-import', ''),
      userId: userId || 'anonymous',
      totalCount: 0,
      successCount: 0,
      failCount: 0,
      status: 'pending',
      payloadJson: payload,
    } as Partial<ImportTask>));

    const jobData: ImportJobData = {
      taskId,
      type,
      userId,
      employeeId,
      payload,
    };

    if (this.importQueue) {
      try {
        await this.importQueue.add(type, jobData);
        // 更新状态为 processing
        await this.importTaskRepository.update(taskId, { status: 'processing' });
        return { taskId, status: 'processing' };
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[imports] queue.add failed, fallback to setImmediate:', err?.message || err);
      }
    }

    // 后台执行（fallback 路径）
    await this.importTaskRepository.update(taskId, { status: 'processing' });
    setImmediate(() => {
      this.executeFromQueue(jobData).catch(async (e: any) => {
        // eslint-disable-next-line no-console
        console.error('[imports] executeFromQueue failed', e?.message || e);
        try {
          await this.markTaskFailed(taskId, e?.message || String(e));
        } catch (_e) {
          // 忽略二次失败
        }
      });
    });
    return { taskId, status: 'processing' };
  }

  /**
   * Processor 调用入口：消费队列里的导入 job。
   */
  async executeFromQueue(jobData: ImportJobData): Promise<void> {
    const { taskId, type, userId, employeeId, payload } = jobData;
    try {
      switch (type) {
        case 'leads-paste':
          await this._doImportLeadsPaste(taskId, userId, employeeId, payload.rows || []);
          break;
        case 'posts-paste':
          await this._doImportPostsPaste(taskId, userId, employeeId, payload.rows || []);
          break;
        case 'leads-import':
          await this._doImportLeadsPaste(taskId, userId, employeeId, (payload.fileContent || '').split(/\r?\n/).filter(Boolean));
          break;
        case 'posts-import':
          await this._doImportPostsPaste(taskId, userId, employeeId, (payload.fileContent || '').split(/\r?\n/).filter(Boolean));
          break;
        default:
          throw new Error(`unknown import type: ${type}`);
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[imports] _doImport failed', err?.message || err);
      await this.markTaskFailed(taskId, err?.message || String(err));
    }
  }

  /**
   * 显式标记任务失败（processor / setImmediate 兜底共用）。
   */
  async markTaskFailed(taskId: string, reason?: string): Promise<void> {
    try {
      await this.importTaskRepository.update(taskId, {
        status: 'failed',
        errorMessage: reason || null,
        finishedAt: new Date(),
      });
      if (reason) {
        // eslint-disable-next-line no-console
        console.warn(`[imports] task ${taskId} failed: ${reason}`);
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('[imports] markTaskFailed update failed:', err?.message || err);
    }
  }

  /**
   * Split a raw text row into columns. Order: Tab > Pipe > Comma.
   */
  splitColumns(rawLine: string): string[] {
    if (rawLine.includes('\t')) return rawLine.split('\t').map((s) => s.trim());
    if (rawLine.includes('|')) return rawLine.split('|').map((s) => s.trim());
    if (rawLine.includes(',')) return rawLine.split(',').map((s) => s.trim());
    return [rawLine.trim()];
  }

  parseRow(rawLine: string): ParsedLeadRow {
    const cols = this.splitColumns(rawLine);
    return {
      platform: cols[0] || '',
      contact: cols[1] || '',
      nickname: cols[2] || '',
      accountName: cols[3] || '',
      remark: cols[4] || '',
    };
  }

  /**
   * §8.3 validation. Returns reason on failure, null on success.
   */
  validate(row: ParsedLeadRow): string | null {
    if (!row.platform) return '平台缺失';
    if (!row.contact) return '联系方式缺失';
    const phoneRe = /^1[3-9]\d{9}$/;
    const wxidRe = /^wxid_[A-Za-z0-9_-]+$/;
    const altRe = /^[A-Za-z0-9_-]{6,}$/;
    if (!phoneRe.test(row.contact) && !wxidRe.test(row.contact) && !altRe.test(row.contact)) {
      return '联系方式格式错误';
    }
    return null;
  }

  /**
   * 30-day duplicate detection by contact_info. Returns the existing leadCode (if any)
   * or empty string when a duplicate exists without leadCode, or null when no dup.
   */
  async findRecentDuplicate(contact: string): Promise<{ existed: boolean; leadCode: string | null }> {
    const row = await this.leadRepository.createQueryBuilder('l')
      .where('l.contact_info = :c', { c: contact })
      .andWhere('l.created_at >= (NOW() - INTERVAL 30 DAY)')
      .select(['l.id', 'l.leadCode'])
      .limit(1)
      .getOne();
    if (!row) return { existed: false, leadCode: null };
    return { existed: true, leadCode: row.leadCode || null };
  }

  async createTask(importType: string, userId: string): Promise<ImportTask> {
    const task = this.importTaskRepository.create({
      id: makeId(),
      importType,
      userId: userId || 'anonymous',
      totalCount: 0,
      successCount: 0,
      failCount: 0,
      status: 'processing',
    });
    return this.importTaskRepository.save(task);
  }

  async finishTask(id: string, patch: {
    totalCount: number;
    successCount: number;
    failCount: number;
    status: string;
    errorFileUrl?: string | null;
    errors?: ImportRowError[];
  }): Promise<void> {
    // 构建 result_json
    const resultJson: Record<string, any> = {
      total: patch.totalCount,
      success: patch.successCount,
      fail: patch.failCount,
    };
    if (patch.errors) {
      resultJson.errors = patch.errors;
    }

    await this.importTaskRepository.update(id, {
      totalCount: patch.totalCount,
      successCount: patch.successCount,
      failCount: patch.failCount,
      status: patch.status,
      errorFileUrl: patch.errorFileUrl ?? null,
      resultJson,
      finishedAt: new Date(),
    });
  }

  async getTask(id: string): Promise<any | null> {
    const row = await this.importTaskRepository.findOne({ where: { id } });
    if (!row) return null;
    return this.mapTask(row);
  }

  async listTasks(userId: string, importType?: string): Promise<any[]> {
    const where: any = { userId };
    if (importType) where.importType = importType;
    const rows = await this.importTaskRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => this.mapTask(r));
  }

  // ---- §9 / AC-10.2 导入任务列表分页 ----
  // 控制器有 limit/offset 时改走该方法，统一返回 { items, total, limit, offset }；
  // 老接口（listTasks）保留，前端无分页参数时直接返回数组以保持兼容。
  async listTasksPaged(
    userId: string,
    importType: string | undefined,
    limit: number,
    offset: number,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const where: any = { userId };
    if (importType) where.importType = importType;
    const [rows, total] = await this.importTaskRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    return {
      items: rows.map((r) => this.mapTask(r)),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  private clampLimit(limit: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  /**
   * 私有方法：实际执行客资导入（processor 调用或 setImmediate 兜底）。
   * 任务记录已在 enqueueImport 中创建，taskId 由调用方传入。
   */
  async _doImportLeadsPaste(taskId: string, actorUserId: string, actorEmployeeId: string, rows: string[]): Promise<void> {
    const errors: ImportRowError[] = [];
    let success = 0;
    let fail = 0;

    // 跳过模板/粘贴内容的第一行 header（中文或英文均识别），不计入 total/success/fail。
    // 行号继续用物理行号 (i + 1) 以便用户对照原文件。
    let startIdx = 0;
    if (rows.length > 0) {
      const firstRaw = rows[0] == null ? '' : String(rows[0]);
      const firstCols = this.splitColumns(firstRaw);
      const firstCell = (firstCols[0] || '').trim();
      if (['平台', 'platform', 'Platform'].includes(firstCell)) {
        startIdx = 1;
      }
    }
    const total = rows.length - startIdx;

    for (let i = startIdx; i < rows.length; i++) {
      const rowIndex = i + 1; // 1-based 物理行号
      const rawLine = rows[i] == null ? '' : String(rows[i]);
      if (!rawLine.trim()) {
        fail++;
        errors.push({ row: rowIndex, reason: '空行', raw: rawLine });
        continue;
      }

      const parsed = this.parseRow(rawLine);
      const validationError = this.validate(parsed);
      if (validationError) {
        fail++;
        errors.push({ row: rowIndex, reason: validationError, raw: rawLine });
        continue;
      }

      try {
        const dup = await this.findRecentDuplicate(parsed.contact);
        if (dup.existed) {
          fail++;
          const codePart = dup.leadCode ? `(${dup.leadCode})` : '';
          errors.push({
            row: rowIndex,
            reason: `30 天内已存在相同联系方式${codePart}`,
            raw: rawLine,
          });
          continue;
        }

        const lead = this.leadRepository.create({
          id: makeId(),
          leadCode: this.generateLeadCode(),
          employeeId: actorEmployeeId || '',
          accountId: '',
          postId: null,
          platform: parsed.platform,
          contactInfo: parsed.contact,
          nickname: parsed.nickname || '',
          majorContent: parsed.accountName || null,
          note: parsed.remark || null,
          status: 'new',
          processStatus: 'not_contacted',
          addStatus: 'not_added',
          salesUserName: '',
          assignedSalesUserName: '',
        } as any);
        await this.leadRepository.save(lead);
        success++;
      } catch (err: any) {
        fail++;
        errors.push({
          row: rowIndex,
          reason: `写入失败: ${err?.message || String(err)}`,
          raw: rawLine,
        });
      }
    }

    // §8 错误文件下载：fail > 0 时写一份 CSV 到对象存储 (T-22 走 StorageService)。
    let errorFileUrl: string | null = null;
    if (fail > 0 && errors.length > 0) {
      errorFileUrl = await this.writeErrorCsv(taskId, errors);
    }

    // 写入 result_json 和完成状态
    await this.finishTask(taskId, {
      totalCount: total,
      successCount: success,
      failCount: fail,
      status: 'done',
      errorFileUrl,
      errors,
    });

    // §11.1 import_done: 批量导入任务结束，通知发起人。
    if (actorUserId && actorUserId !== 'anonymous') {
      await this.notificationsService.create({
        receiverIds: [actorUserId],
        senderId: null,
        portType: 'operations',
        typeCode: NOTIFICATION_TYPES.IMPORT_DONE,
        title: '客资批量导入完成',
        content: `共 ${total} 行，成功 ${success}，失败 ${fail}`,
        relatedId: taskId,
        relatedType: 'import_task',
      });
    }
  }

  /**
   * 私有方法：实际执行作品导入（processor 调用或 setImmediate 兜底）。
   */
  async _doImportPostsPaste(taskId: string, actorUserId: string, actorEmployeeId: string, rows: string[]): Promise<void> {
    const errors: ImportRowError[] = [];
    let success = 0;
    let fail = 0;
    let startIdx = 0;
    if (rows.length > 0) {
      const first = (this.splitColumns(String(rows[0] || ''))[0] || '').trim();
      if (['平台', 'platform', 'Platform'].includes(first)) startIdx = 1;
    }
    const total = rows.length - startIdx;

    for (let i = startIdx; i < rows.length; i++) {
      const rowIndex = i + 1;
      const rawLine = rows[i] == null ? '' : String(rows[i]);
      if (!rawLine.trim()) {
        fail++;
        errors.push({ row: rowIndex, reason: '空行', raw: rawLine });
        continue;
      }
      const cols = this.splitColumns(rawLine);
      const platform = cols[0] || '';
      const title = cols[1] || '';
      const postType = cols[2] || '获客贴';
      const postUrl = cols[3] || '';
      const accountId = cols[4] || '';
      const publishedAt = cols[5] || new Date().toISOString().slice(0, 10);
      if (!platform || !title) {
        fail++;
        errors.push({ row: rowIndex, reason: '平台或标题缺失', raw: rawLine });
        continue;
      }
      try {
        await this.postRepository.save(this.postRepository.create({
          id: makeId(),
          employeeId: actorEmployeeId || '',
          accountId,
          platform,
          title,
          copywriting: cols[6] || '',
          coverImageUrl: cols[7] || null,
          postUrl: postUrl || null,
          postType,
          traffic: Number(cols[8] || 0),
          likes: Number(cols[9] || 0),
          comments: Number(cols[10] || 0),
          favorites: Number(cols[11] || 0),
          publishedAt,
          note: cols[12] || null,
        } as any));
        success++;
      } catch (err: any) {
        fail++;
        errors.push({ row: rowIndex, reason: `写入失败: ${err?.message || String(err)}`, raw: rawLine });
      }
    }

    const errorFileUrl = fail > 0 && errors.length > 0 ? await this.writeErrorCsv(taskId, errors) : null;
    await this.finishTask(taskId, {
      totalCount: total,
      successCount: success,
      failCount: fail,
      status: 'done',
      errorFileUrl,
      errors,
    });

    if (actorUserId && actorUserId !== 'anonymous') {
      await this.notificationsService.create({
        receiverIds: [actorUserId],
        senderId: null,
        portType: 'operations',
        typeCode: NOTIFICATION_TYPES.IMPORT_DONE,
        title: '作品批量导入完成',
        content: `共 ${total} 行，成功 ${success}，失败 ${fail}`,
        relatedId: taskId,
        relatedType: 'import_task',
      });
    }
  }

  private mapTask(row: ImportTask): any {
    return {
      id: row.id,
      importType: row.importType,
      userId: row.userId,
      totalCount: row.totalCount,
      successCount: row.successCount,
      failCount: row.failCount,
      errorFileUrl: row.errorFileUrl,
      errorMessage: row.errorMessage,
      resultJson: row.resultJson,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      finishedAt: row.finishedAt,
    };
  }

  /**
   * §8 错误文件生成：通过 StorageService 写到 imports bucket。
   * 列：row, raw_line, reason。BOM + CRLF 让 Excel 不乱码。
   * 返回前端可访问的相对 URL（/uploads/imports/...）；写失败则返回 null。
   */
  private async writeErrorCsv(taskId: string, errors: ImportRowError[]): Promise<string | null> {
    try {
      const escapeCsv = (v: string): string => {
        const s = v == null ? '' : String(v);
        if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const lines: string[] = ['row,raw_line,reason'];
      for (const e of errors) {
        lines.push([escapeCsv(String(e.row)), escapeCsv(e.raw || ''), escapeCsv(e.reason || '')].join(','));
      }
      const csv = lines.join('\r\n');
      return await this.storage.putCsv('imports', `${taskId}-errors.csv`, csv);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[imports] writeErrorCsv failed:', (err as any)?.message || err);
      return null;
    }
  }

  private generateLeadCode(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `L${ymd}-${random}`;
  }
}
