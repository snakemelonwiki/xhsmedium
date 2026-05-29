import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../../entities/employee.entity';
import { makeId } from '../../shared/utils/id-generator';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async findAll(): Promise<any[]> {
    return this.employeeRepository.find({ order: { createdAt: 'DESC' } });
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
}
