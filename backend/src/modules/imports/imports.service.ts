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
   * - For tab/pipe: simple split.
   * - For comma: simple split (5 fields). Quoted CSV is NOT supported; users should
   *   use tab/pipe for fields containing commas, or the remark/note will be truncated.
   *   This matches the prior behavior and avoids pulling in a CSV parser.
   */
  splitColumns(rawLine: string): string[] {
    // Strip BOM (U+FEFF) at start of line (Excel-saved UTF-8 files)
    const line = rawLine && rawLine.charCodeAt(0) === 0xFEFF ? rawLine.slice(1) : rawLine;
    if (line.includes('\t')) return line.split('\t').map((s) => s.trim());
    if (line.includes('|')) return line.split('|').map((s) => s.trim());
    if (line.includes(',')) return line.split(',').map((s) => s.trim());
    return [line.trim()];
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
   * 联系人格式：先去除常见前缀（+86 / v / vx / wechat / 微信:），去除空白、括号、连字符，
   * 再尝试 phone / wxid_ / alt 匹配。这样 `+86 138-0013-8001`、`微信:abc123` 等都能通过。
   */
  validate(row: ParsedLeadRow): string | null {
    if (!row.platform) return '平台缺失';
    if (!row.contact) return '联系方式缺失';
    const cleaned = this.normalizeContact(row.contact);
    if (!cleaned) return '联系方式缺失';
    const phoneRe = /^1[3-9]\d{9}$/;
    const wxidRe = /^wxid_[A-Za-z0-9_-]+$/;
    const altRe = /^[A-Za-z0-9_-]{6,}$/;
    if (!phoneRe.test(cleaned) && !wxidRe.test(cleaned) && !altRe.test(cleaned)) {
      return '联系方式格式错误';
    }
    return null;
  }

  /**
   * 把 `+86 138-0013-8001`、`微信:abc123_xyz`、`v信 foo-bar123` 等统一成可校验的 contact。
   * 规则：
   *   1) 去掉 `+86` / `+86-` 等国家码
   *   2) 提取第一个连续 11 位手机号（适用 `+86 xxx-xxxx-xxxx`）
   *   3) 否则去掉 `v:` / `vx:` / `wechat:` / `微信:` / `wx:` 等前缀
   *   4) 去掉所有空白、连字符、括号
   *   5) 至少 6 位才返回，否则交给调用方判 "联系方式缺失"
   */
  private normalizeContact(raw: string): string {
    if (!raw) return '';
    let s = String(raw).trim();
    // 1) 去掉 +86 / 86 国家码
    s = s.replace(/^\+?86[\s\-:：]?/, '');
    // 2) 提取 11 位手机号
    const m = s.match(/1[3-9]\d{9}/);
    if (m) return m[0];
    // 3) 去掉常见前缀（中文/英文，顺序很关键：先匹配长前缀再短前缀）
    s = s.replace(/^(微信号|微信|wechat\s*id|wechat|微信\s*号|vx|v信|v)[\s:：是=]+/i, '');
    // 4) 去掉空白、连字符、括号
    s = s.replace(/[\s\-()（）]+/g, '');
    return s;
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
   *
   * 修复点（T9.1 客资导入不全）：
   *  1) 文件 / 粘贴内容可能含 UTF-8 BOM（Excel 导出的常见现象），splitColumns 已剥除。
   *  2) 同一文件内部可能含重复 contact：在去重循环内用 `batchInserted` Map 缓存本批
   *     已写入的 (contact -> leadCode)，命中时直接记为"本批内已存在"并复用 leadCode，
   *     不再走 DB 查询、也不计入 fail 计数。
   *  3) 联系人格式校验先 normalize（去 +86 / vx / 微信: 等前缀、空白、连字符、括号），
   *     再走 phone / wxid_ / alt 三个正则，覆盖 `+86 138-0013-8001`、`微信:abc123` 这类。
   *  4) 整体在一个 TypeORM 事务里完成，单条 INSERT 失败时整批回滚、错误条数 + 错误信息
   *     通过 errors 数组返回给前端。
   *  5) Header 检测兼容更多模板（大小写不敏感、首尾空白、零宽字符），不再硬编码 3 个串。
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
      if (this.isHeaderCell(firstCell)) {
        startIdx = 1;
      }
    }
    const total = rows.length - startIdx;

    // 本批内已写入的 contact -> leadCode 缓存（in-batch dedup，避免对同一文件内重复
    // contact 第二次 INSERT 时误报"30 天内已存在"）。
    const batchInserted = new Map<string, string>();
    // 本批内已确认重复的 contact（行号列表），用于在第二次出现时只 push 一次错误。
    const batchDupRows = new Map<string, number[]>();

    // W5 修复：改用 savepoint-per-row 模式，避免单条 INSERT 失败后事务被 poison，
    // 导致后续合法行也无法写入。hard error（死锁等）仍回滚整批。
    // T9.1 修复：savepoint 与 INSERT 必须跑在同一个连接上，否则 RELEASE SAVEPOINT
    // 会报 "SAVEPOINT does not exist"。统一使用 manager.queryRunner（事务持有的连接），
    // manager.connection 在连接池场景下可能与事务 queryRunner 不是同一连接。
    await this.leadRepository.manager.transaction(async (manager) => {
      const leadRepo = manager.getRepository(Lead);
      const queryRunner = manager.queryRunner;
      if (!queryRunner) {
        // 防御性：理论不应发生；如发生直接抛错让外层事务回滚
        throw new Error('transactional EntityManager has no queryRunner');
      }
      for (let i = startIdx; i < rows.length; i++) {
        const rowIndex = i + 1; // 1-based 物理行号
        const rawLine = rows[i] == null ? '' : String(rows[i]);
        if (!rawLine.trim()) {
          // 空行：作为 fail 计入"无效数据"，不抛错
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

        // 用规范化后的 contact 做去重 key（与 DB 查询口径一致）
        const contactKey = this.normalizeContact(parsed.contact) || parsed.contact;

        // 1) 先看本批内是否已插入
        if (batchInserted.has(contactKey)) {
          const dupRows = batchDupRows.get(contactKey) || [];
          dupRows.push(rowIndex);
          batchDupRows.set(contactKey, dupRows);
          // 本批内重复：作为 fail 计入，但只记录一次最终汇总
          fail++;
          continue;
        }

        // 2) 查 DB 30 天内是否已存在
        try {
          const dup = await leadRepo.createQueryBuilder('l')
            .where('l.contact_info = :c', { c: contactKey })
            .andWhere('l.created_at >= (NOW() - INTERVAL 30 DAY)')
            .select(['l.id', 'l.leadCode'])
            .limit(1)
            .getOne();
          if (dup) {
            batchInserted.set(contactKey, dup.leadCode || '');
            fail++;
            const codePart = dup.leadCode ? `(${dup.leadCode})` : '';
            errors.push({
              row: rowIndex,
              reason: `30 天内已存在相同联系方式${codePart}`,
              raw: rawLine,
            });
            continue;
          }
        } catch (err: any) {
          fail++;
          errors.push({
            row: rowIndex,
            reason: `去重查询失败: ${err?.message || String(err)}`,
            raw: rawLine,
          });
          continue;
        }

        // 3) 写入（使用 savepoint 隔离，单条失败不影响事务整体）。
        //    SAVEPOINT / RELEASE / ROLLBACK TO 必须全部走 queryRunner，
        //    与 leadRepo.save()（内部走同一 queryRunner）共用同一连接。
        const spName = `sp_row_${rowIndex}`;
        await queryRunner.query(`SAVEPOINT ${spName}`);
        try {
          const lead = leadRepo.create({
            id: makeId(),
            leadCode: this.generateLeadCode(),
            employeeId: actorEmployeeId || '',
            accountId: '',
            postId: null,
            platform: parsed.platform,
            contactInfo: contactKey,
            wechat: contactKey,
            nickname: parsed.nickname || '',
            majorContent: parsed.accountName || null,
            note: parsed.remark || null,
            status: 'new',
            processStatus: 'not_contacted',
            addStatus: 'not_added',
            salesUserName: '',
            assignedSalesUserName: '',
          } as any);
          await leadRepo.save(lead);
          const savedLead = Array.isArray(lead) ? lead[0] : lead;
          batchInserted.set(contactKey, (savedLead as Lead).leadCode || '');
          await queryRunner.query(`RELEASE SAVEPOINT ${spName}`);
          success++;
        } catch (err: any) {
          // 回滚到 savepoint，事务仍然有效，后续行可以继续插入
          await queryRunner.query(`ROLLBACK TO SAVEPOINT ${spName}`).catch(() => {});
          const msg = (err?.message || String(err)) + '';
          const isHardError = /deadlock|lock wait timeout|connection lost|ER_LOCK_WAIT_TIMEOUT|ER_LOCK_DEADLOCK/i.test(msg);
          fail++;
          errors.push({
            row: rowIndex,
            reason: `写入失败: ${msg.slice(0, 200)}`,
            raw: rawLine,
          });
          if (isHardError) {
            // 真硬错：整批回滚，避免半成功
            throw err;
          }
        }
      }
    });

    // 把本批内重复 contact 汇总成一条错误（避免每个重复行各占一条 errors，污染 fail 计数）
    for (const [contact, dupRows] of batchDupRows.entries()) {
      const code = batchInserted.get(contact) || '';
      const codePart = code ? `(${code})` : '';
      const rowsList = dupRows.join(', ');
      // 注意：fail 已在循环里 ++ 过了，这里只补充 errors 描述，不重复计数
      errors.push({
        row: dupRows[0],
        reason: `本批内已存在相同联系方式${codePart}（重复行: ${rowsList}）`,
        raw: '',
      });
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
   * 识别首行是否为表头。支持：中文模板（"平台"）、英文模板（"platform"）、
   * 大小写不敏感、首尾空白、Excel 的 BOM（splitColumns 已剥除）。
   */
  private isHeaderCell(cell: string): boolean {
    if (!cell) return false;
    const c = cell.trim().toLowerCase();
    if (!c) return false;
    return c === '平台' || c === 'platform' || c === 'plat' || c === '来源平台'
      || c === 'source' || c === 'sourceplatform';
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
      if (this.isHeaderCell(first)) startIdx = 1;
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
