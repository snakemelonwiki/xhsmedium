import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Employee } from '../../entities/employee.entity';
import { makeId } from '../../shared/utils/id-generator';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  /**
   * 查询员工列表。
   */
  async findAll(keyword = ''): Promise<any[]> {
    return this.employeeRepository.find({
      order: { createdAt: 'DESC' },
      where: this.keywordWhere(keyword),
    });
  }

  /**
   * 分页查询员工列表。
   */
  async findAllPaged(limit: number, offset: number, keyword = ''): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const [items, total] = await this.employeeRepository.findAndCount({
      order: { createdAt: 'DESC' },
      where: this.keywordWhere(keyword),
      take: limit,
      skip: offset,
    });
    return { items, total, limit, offset };
  }

  /**
   * 查询全部员工编号用于生成下一个编号。
   */
  async findAllCodes(): Promise<string[]> {
    const rows = await this.employeeRepository.find({ select: { employeeCode: true } });
    return rows.map((e) => String(e.employeeCode || ''));
  }

  /**
   * 按 id 查单条员工，供 controller 写日志前取 before 快照。
   * 不存在时返回 null，由 controller 自行决定要不要记日志。
   */
  async findById(id: string): Promise<Employee | null> {
    if (!id) return null;
    return this.employeeRepository.findOne({ where: { id } });
  }

  /**
   * 创建员工资料。
   */
  async create(dto: Partial<Employee>): Promise<any> {
    // 必填字段校验
    if (!dto.name || !String(dto.name).trim()) {
      throw new BadRequestException('name (姓名) 为必填字段');
    }
    if (!dto.employeeCode || !String(dto.employeeCode).trim()) {
      throw new BadRequestException('employeeCode (员工编号) 为必填字段');
    }

    const employee = this.employeeRepository.create({
      ...dto,
      id: makeId(),
    } as any);

    try {
      return await this.employeeRepository.save(employee);
    } catch (err: any) {
      // 唯一约束冲突 (employee_code 重复)
      if (err.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`员工编号 ${dto.employeeCode} 已存在`);
      }
      // 打印详细日志便于排查
      console.error('[employees.create] save failed:', {
        dto,
        error: err.message,
        code: err.code,
        errno: err.errno,
      });
      throw err;
    }
  }

  /**
   * 更新员工资料。
   */
  async update(id: string, dto: Partial<Employee>): Promise<void> {
    await this.employeeRepository.update(id, dto);
  }

  /**
   * 更新员工启停状态。
   */
  async updateStatus(id: string, status: string): Promise<void> {
    await this.employeeRepository.update(id, { status });
  }

  /**
   * 删除员工。
   */
  async remove(id: string): Promise<void> {
    await this.employeeRepository.delete(id);
  }

  /**
   * 组装员工关键字查询条件。
   */
  private keywordWhere(keyword: string) {
    const value = String(keyword || '').trim();
    if (!value) return undefined;
    const like = Like(`%${value}%`);
    return [
      { name: like },
      { employeeCode: like },
      { phone: like },
      { status: like },
    ];
  }
}
