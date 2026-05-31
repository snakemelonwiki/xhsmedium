import { Injectable } from '@nestjs/common';
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

  async findAll(keyword = ''): Promise<any[]> {
    return this.employeeRepository.find({
      order: { createdAt: 'DESC' },
      where: this.keywordWhere(keyword),
    });
  }

  async findAllPaged(limit: number, offset: number, keyword = ''): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const [items, total] = await this.employeeRepository.findAndCount({
      order: { createdAt: 'DESC' },
      where: this.keywordWhere(keyword),
      take: limit,
      skip: offset,
    });
    return { items, total, limit, offset };
  }

  async findAllCodes(): Promise<string[]> {
    const rows = await this.employeeRepository.find({ select: ['employeeCode'] as any });
    return rows.map((e) => e.employeeCode);
  }

  async create(dto: Partial<Employee>): Promise<any> {
    const employee = this.employeeRepository.create({
      ...dto,
      id: makeId(),
    } as any);
    return this.employeeRepository.save(employee);
  }

  async update(id: string, dto: Partial<Employee>): Promise<void> {
    await this.employeeRepository.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    await this.employeeRepository.delete(id);
  }

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
