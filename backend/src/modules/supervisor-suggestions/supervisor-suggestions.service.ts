import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';

interface SuggestionDto {
  targetType?: string;
  targetId?: string;
  content?: string;
}

interface SuggestionQuery {
  targetType?: string;
  employeeId?: string;
}

@Injectable()
export class SupervisorSuggestionsService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
  ) {}

  /**
   * 保存作品主管建议并返回前端需要展示的建议摘要。
   */
  async create(dto: SuggestionDto): Promise<any> {
    const targetType = String(dto.targetType || '').trim();
    const targetId = String(dto.targetId || '').trim();
    const content = String(dto.content || '').trim();
    if (!targetType || !targetId || !content) {
      throw new Error('targetType、targetId、content 不能为空');
    }
    if (targetType !== 'post') {
      throw new Error('当前版本仅支持作品主管建议');
    }

    const post = await this.postRepo.findOne({ where: { id: targetId } });
    if (!post) {
      throw new Error('关联作品不存在');
    }

    await this.postRepo.update(targetId, { supervisorSuggestion: content });
    return {
      targetType,
      targetId,
      employeeId: post.employeeId,
      content,
      read: false,
      createdAt: new Date(),
    };
  }

  /**
   * 查询已保存的作品主管建议。
   */
  async list(query: SuggestionQuery = {}): Promise<any[]> {
    const targetType = query.targetType || 'post';
    if (targetType !== 'post') {
      return [];
    }

    const qb = this.postRepo
      .createQueryBuilder('p')
      .where("p.supervisor_suggestion IS NOT NULL AND p.supervisor_suggestion <> ''")
      .orderBy('p.updated_at', 'DESC')
      .limit(200);

    if (query.employeeId) {
      qb.andWhere('p.employee_id = :employeeId', { employeeId: query.employeeId });
    }

    const rows = await qb.getMany();
    return rows.map((row) => ({
      targetType: 'post',
      targetId: row.id,
      employeeId: row.employeeId,
      title: row.title,
      content: row.supervisorSuggestion || '',
      read: false,
      updatedAt: row.updatedAt,
    }));
  }
}
