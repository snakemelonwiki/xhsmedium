import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Account } from '../../entities/account.entity';
import { makeId } from '../../shared/utils/id-generator';
import { normalizeExternalUrl } from '../../shared/utils/normalize';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async findAll(keyword = '', platform = ''): Promise<any[]> {
    const rows = await this.accountRepository.find({
      order: { createdAt: 'DESC' },
      where: this.buildWhere(keyword, platform),
    });
    return this.attachEmployeeNames(rows.map((r) => this.mapAccount(r)));
  }

  async findAllPaged(limit: number, offset: number, keyword = '', platform = ''): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const [rows, total] = await this.accountRepository.findAndCount({
      order: { createdAt: 'DESC' },
      where: this.buildWhere(keyword, platform),
      take: limit,
      skip: offset,
    });
    const items = await this.attachEmployeeNames(rows.map((r) => this.mapAccount(r)));
    return {
      items,
      total,
      limit,
      offset,
    };
  }

  private mapAccount(r: Account): any {
    return {
      id: r.id,
      employeeId: r.employeeId,
      platform: r.platform,
      profileUrl: r.profileUrl,
      accountName: r.accountName,
      accountUid: r.accountUid,
      persona: r.persona,
      positioning: r.positioning,
      postingPlan: r.postingPlan || '',
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  /**
   * 把 employeeName 注入到账号列表项上，employeeId 保持不变，
   * 前端"所属员工"列优先展示姓名，找不到时再回退到 employee_code 或 ID。
   */
  private async attachEmployeeNames(items: any[]): Promise<any[]> {
    if (!items.length) return items;
    const ids = Array.from(new Set(items.map((i) => i.employeeId).filter(Boolean)));
    if (!ids.length) return items.map((i) => ({ ...i, employeeName: '' }));

    const placeholders = ids.map(() => '?').join(',');
    const rows: Array<{ id: string; name: string | null; employee_code: string | null }> = await this.accountRepository.manager.query(
      `SELECT id, name, employee_code FROM employees WHERE id IN (${placeholders})`,
      ids,
    );
    const nameMap = new Map<string, string>();
    for (const r of rows) nameMap.set(r.id, (r.name || r.employee_code || '').trim());

    return items.map((i) => ({ ...i, employeeName: nameMap.get(i.employeeId) || '' }));
  }

  async create(dto: Partial<Account>): Promise<any> {
    const account = this.accountRepository.create({
      ...dto,
      profileUrl: dto.profileUrl ? normalizeExternalUrl(dto.profileUrl) : null,
      postingPlan: dto.postingPlan || '',
      id: makeId(),
    } as any);
    return this.accountRepository.save(account);
  }

  async update(id: string, dto: Partial<Account>): Promise<void> {
    const updates: any = {};
    if (dto.profileUrl !== undefined) updates.profileUrl = dto.profileUrl ? normalizeExternalUrl(dto.profileUrl) : null;
    if (dto.employeeId !== undefined) updates.employeeId = dto.employeeId;
    if (dto.platform !== undefined) updates.platform = dto.platform;
    if (dto.accountName !== undefined) updates.accountName = dto.accountName;
    if (dto.accountUid !== undefined) updates.accountUid = dto.accountUid;
    if (dto.persona !== undefined) updates.persona = dto.persona;
    if (dto.positioning !== undefined) updates.positioning = dto.positioning;
    if (dto.postingPlan !== undefined) updates.postingPlan = dto.postingPlan;
    if (dto.status !== undefined) updates.status = dto.status;
    await this.accountRepository.update(id, updates);
  }

  async updatePostingPlan(id: string, postingPlan: string): Promise<void> {
    await this.accountRepository.update(id, { postingPlan: postingPlan || '' });
  }

  async remove(id: string): Promise<void> {
    await this.accountRepository.delete(id);
  }

  private buildWhere(keyword: string, platform: string) {
    const kw = String(keyword || '').trim();
    const pf = String(platform || '').trim();
    const platformFilter = pf ? { platform: pf } : null;

    if (!kw) {
      return platformFilter ?? undefined;
    }

    const like = Like(`%${kw}%`);
    const fields = ['accountName', 'accountUid', 'employeeId', 'persona', 'positioning', 'status'] as const;
    return fields.map((field) => ({
      ...(platformFilter ?? {}),
      [field]: like,
    }));
  }
}
