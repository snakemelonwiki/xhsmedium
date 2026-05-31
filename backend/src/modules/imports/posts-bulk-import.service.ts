import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { ImportTask } from '../../entities/import-task.entity';
import { Post } from '../../entities/post.entity';
import { Account } from '../../entities/account.entity';
import { makeId } from '../../shared/utils/id-generator';
import {
  normalizePostType,
  normalizeTrafficByType,
  normalizeExternalUrl,
} from '../../shared/utils/normalize';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';
import { getProjectRoot, writeImportErrorFile } from './import-error-file.util';

/**
 * #7 作品批量导入：行级解析失败明细。
 */
export interface PostImportFailedRow {
  rowIndex: number;
  raw: string;
  message: string;
}

/**
 * 批量导入返回结构（与前端约定）。
 */
export interface PostBulkImportResult {
  ok: boolean;
  taskId: string;
  total: number;
  success: number;
  failed: number;
  failedRows: PostImportFailedRow[];
  errorFileUrl?: string | null;
}

/**
 * 表头规范化：中英文表头统一映射到内部 key。
 * 前端模板列名（中文）与 README 列名（英文）任取其一。
 */
const HEADER_ALIASES: Record<string, string> = {
  accountid: 'accountId',
  账号id: 'accountId',
  '账号 id': 'accountId',
  accountname: 'accountName',
  账号名称: 'accountName',
  账号名: 'accountName',
  platform: 'platform',
  平台: 'platform',
  title: 'title',
  标题: 'title',
  copywriting: 'copywriting',
  文案: 'copywriting',
  posturl: 'postUrl',
  作品链接: 'postUrl',
  posttype: 'postType',
  作品类型: 'postType',
  traffic: 'traffic',
  播放量: 'traffic',
  likes: 'likes',
  点赞: 'likes',
  comments: 'comments',
  评论: 'comments',
  favorites: 'favorites',
  收藏: 'favorites',
  shares: 'shares',
  转发: 'shares',
  publishedat: 'publishedAt',
  发布日期: 'publishedAt',
  发布时间: 'publishedAt',
  note: 'note',
  备注: 'note',
};

const ALLOWED_PLATFORMS = ['小红书', '抖音'];
const ALLOWED_DELIMITERS = new Set(['tab', 'comma']);

@Injectable()
export class PostsBulkImportService {
  constructor(
    @InjectRepository(ImportTask)
    private readonly importTaskRepository: Repository<ImportTask>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 入口：把粘贴文本批量导入为作品。
   * 流程：解析表头 → 逐行校验/解析 → 写入 posts → 落库 import_tasks → 通知。
   */
  async importPostsByPaste(
    userId: string,
    employeeId: string,
    raw: string,
    delimiter?: string,
  ): Promise<PostBulkImportResult> {
    // 校验粘贴文本与分隔符
    const normalizedDelimiter = ALLOWED_DELIMITERS.has(String(delimiter ?? 'tab'))
      ? String(delimiter ?? 'tab')
      : 'tab';
    const sep = normalizedDelimiter === 'comma' ? ',' : '\t';

    // 拆分非空行；首行视为表头
    const lines = String(raw ?? '')
      .split(/\r?\n/)
      .map((s) => s.replace(/﻿/g, ''))
      .filter((s) => s.trim().length > 0);
    if (lines.length === 0) {
      return this.buildEmptyResult();
    }
    const header = this.parseHeader(lines[0], sep);
    const dataLines = lines.slice(1);

    // 逐行处理
    const failedRows: PostImportFailedRow[] = [];
    let success = 0;
    for (let i = 0; i < dataLines.length; i++) {
      const rowIndex = i + 2; // 1-based + 跳过表头
      const rawLine = dataLines[i];
      try {
        const ok = await this.tryImportRow(rawLine, sep, header, employeeId, rowIndex, failedRows);
        if (ok) success++;
      } catch (err: any) {
        failedRows.push({
          rowIndex,
          raw: rawLine,
          message: `写入失败: ${err?.message ?? String(err)}`,
        });
      }
    }

    // 落库 import_tasks 并发通知
    const total = dataLines.length;
    const failed = failedRows.length;
    const taskId = makeId();
    const errorFileUrl = writeImportErrorFile(getProjectRoot(), taskId, failedRows);
    await this.persistTask(taskId, userId, total, success, failed, errorFileUrl);
    await this.notifyDone(userId, taskId, total, success, failed);

    return { ok: true, taskId, total, success, failed, failedRows, errorFileUrl };
  }

  /**
   * 列表查询：当前用户的导入任务（默认 type=posts）。
   */
  async listTasksForUser(userId: string, importType: string = 'posts'): Promise<any[]> {
    const rows = await this.importTaskRepository.find({
      where: { userId, importType },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      importType: r.importType,
      userId: r.userId,
      totalCount: r.totalCount,
      successCount: r.successCount,
      failCount: r.failCount,
      errorFileUrl: r.errorFileUrl,
      createdAt: r.createdAt,
    }));
  }

  /**
   * 解析表头：返回列名 → 列下标 的映射，未识别列忽略。
   */
  private parseHeader(line: string, sep: string): Record<string, number> {
    const cols = line.split(sep).map((s) => s.trim());
    const map: Record<string, number> = {};
    for (let i = 0; i < cols.length; i++) {
      const key = cols[i].toLowerCase().replace(/\s+/g, '');
      const std = HEADER_ALIASES[key] ?? HEADER_ALIASES[cols[i]];
      if (std) map[std] = i;
    }
    return map;
  }

  /**
   * 单行处理：校验 + 反查 account + 写入 posts。
   * 失败时把明细 push 到 failedRows，返回 false；成功返回 true。
   */
  private async tryImportRow(
    rawLine: string,
    sep: string,
    header: Record<string, number>,
    employeeId: string,
    rowIndex: number,
    failedRows: PostImportFailedRow[],
  ): Promise<boolean> {
    const cols = rawLine.split(sep);
    const get = (k: string): string =>
      header[k] !== undefined ? String(cols[header[k]] ?? '').trim() : '';

    // 字段抽取
    const accountIdRaw = get('accountId');
    const accountName = get('accountName');
    const platform = get('platform');
    const title = get('title');
    const copywriting = get('copywriting');
    const postUrl = get('postUrl');
    const postTypeRaw = get('postType');
    const traffic = get('traffic');
    const likes = get('likes');
    const comments = get('comments');
    const favorites = get('favorites');
    const shares = get('shares');
    const publishedAt = get('publishedAt');
    const note = get('note');

    // 必填校验
    if (!accountIdRaw && !accountName) {
      failedRows.push({ rowIndex, raw: rawLine, message: '账号缺失（accountId / accountName 至少填一个）' });
      return false;
    }
    if (!platform) {
      failedRows.push({ rowIndex, raw: rawLine, message: '平台缺失' });
      return false;
    }
    if (!ALLOWED_PLATFORMS.includes(platform)) {
      failedRows.push({ rowIndex, raw: rawLine, message: `平台非法（仅支持 ${ALLOWED_PLATFORMS.join('/')}）` });
      return false;
    }
    if (!postTypeRaw) {
      failedRows.push({ rowIndex, raw: rawLine, message: '作品类型缺失' });
      return false;
    }

    // 反查账号（按 employeeId 隔离）
    const accountId = await this.resolveAccountId(employeeId, accountIdRaw, accountName);
    if (!accountId) {
      failedRows.push({
        rowIndex,
        raw: rawLine,
        message: accountIdRaw
          ? `账号不存在或不属于当前员工（accountId=${accountIdRaw}）`
          : `账号名称未匹配到记录（accountName=${accountName}）`,
      });
      return false;
    }

    // 规范化 + 写入 posts
    const normalizedPostType = normalizePostType(postTypeRaw);
    const post = this.postRepository.create({
      id: makeId(),
      employeeId,
      accountId,
      platform,
      title: title || '',
      copywriting: copywriting || null,
      coverImageUrl: null,
      postUrl: postUrl ? normalizeExternalUrl(postUrl) : null,
      postType: normalizedPostType,
      traffic: normalizeTrafficByType(normalizedPostType, traffic),
      likes: this.toNumber(likes),
      comments: this.toNumber(comments),
      favorites: this.toNumber(favorites),
      shares: this.toNumber(shares),
      metricsUpdatedAt: null,
      publishedAt: publishedAt || this.todayString(),
      note: note || null,
      supervisorSuggestion: null,
    } as any);
    await this.postRepository.save(post);
    return true;
  }

  /**
   * 反查 account：优先按 id 精确匹配，其次按 accountName LIKE。
   */
  private async resolveAccountId(
    employeeId: string,
    accountIdRaw: string,
    accountName: string,
  ): Promise<string | null> {
    if (accountIdRaw) {
      const found = await this.accountRepository.findOne({
        where: { id: accountIdRaw, employeeId },
      });
      if (found) return found.id;
      return null;
    }
    if (accountName) {
      const found = await this.accountRepository.findOne({
        where: { accountName: Like(`%${accountName}%`), employeeId },
      });
      return found ? found.id : null;
    }
    return null;
  }

  /**
   * 写入 import_tasks 一条记录，返回 taskId。
   * 注：当前 import_tasks 表无 status / finished_at / error_detail 列，失败明细仅在 HTTP 响应里返回。
   */
  private async persistTask(
    taskId: string,
    userId: string,
    total: number,
    success: number,
    failed: number,
    errorFileUrl: string | null,
  ): Promise<string> {
    const task = this.importTaskRepository.create({
      id: taskId,
      importType: 'posts',
      userId: userId || 'anonymous',
      totalCount: total,
      successCount: success,
      failCount: failed,
      errorFileUrl,
    } as any);
    await this.importTaskRepository.save(task);
    return taskId;
  }

  /**
   * §11.1 import_done：批量导入完成通知发起人。
   */
  private async notifyDone(
    userId: string,
    taskId: string,
    total: number,
    success: number,
    failed: number,
  ): Promise<void> {
    if (!userId || userId === 'anonymous') return;
    await this.notificationsService.create({
      receiverIds: [userId],
      senderId: null,
      portType: 'operations',
      typeCode: NOTIFICATION_TYPES.IMPORT_DONE,
      title: '作品批量导入完成',
      content: `共 ${total} 行，成功 ${success}，失败 ${failed}`,
      relatedId: taskId,
      relatedType: 'import_task',
    });
  }

  private buildEmptyResult(): PostBulkImportResult {
    return { ok: true, taskId: '', total: 0, success: 0, failed: 0, failedRows: [], errorFileUrl: null };
  }

  private toNumber(v: unknown): number {
    const n = Number(String(v ?? '').replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  private todayString(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
