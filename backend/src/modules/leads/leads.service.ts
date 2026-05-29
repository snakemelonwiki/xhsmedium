import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../entities/lead.entity';
import { makeId } from '../../shared/utils/id-generator';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
  ) {}

  async findAll(): Promise<any[]> {
    const rows = await this.leadRepository.find({ order: { createdAt: 'DESC' } });
    return rows.map(this.mapLead);
  }

  async findByEmployee(employeeId: string): Promise<any[]> {
    const rows = await this.leadRepository.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(this.mapLead);
  }

  async create(dto: Partial<Lead>): Promise<void> {
    const lead = this.leadRepository.create({
      ...dto,
      id: makeId(),
      nickname: dto.nickname || '',
      salesUserName: dto.salesUserName || '',
      processStatus: dto.processStatus || '未接',
      addStatus: dto.addStatus || '未添加',
    } as any);
    await this.leadRepository.save(lead);
  }

  async update(id: string, dto: Partial<Lead>): Promise<void> {
    await this.leadRepository.update(id, dto);
  }

  async updateBoard(id: string, dto: {
    assignedSalesUserId?: string | null;
    assignedSalesUserName?: string;
    processStatus?: string;
    addStatus?: string;
    intention?: string | null;
  }): Promise<void> {
    await this.leadRepository.update(id, {
      assignedSalesUserId: dto.assignedSalesUserId || null,
      assignedSalesUserName: dto.assignedSalesUserName || '',
      processStatus: dto.processStatus || '未接',
      addStatus: dto.addStatus || '未添加',
      intention: dto.intention || null,
    });
  }

  async remove(id: string): Promise<void> {
    await this.leadRepository.delete(id);
  }

  private mapLead(row: Lead): any {
    return {
      id: row.id,
      employeeId: row.employeeId,
      accountId: row.accountId,
      postId: row.postId,
      platform: row.platform,
      contactInfo: row.contactInfo,
      nickname: row.nickname,
      budget: row.budget,
      majorContent: row.majorContent,
      ip: row.ip,
      status: row.status,
      dealAmount: row.dealAmount,
      note: row.note,
      captureImageUrl: row.captureImageUrl,
      salesFeedback: row.salesFeedback,
      salesUpdatedAt: row.salesUpdatedAt,
      salesUserName: row.salesUserName,
      assignedSalesUserId: row.assignedSalesUserId,
      assignedSalesUserName: row.assignedSalesUserName,
      processStatus: row.processStatus,
      addStatus: row.addStatus,
      intention: row.intention,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
