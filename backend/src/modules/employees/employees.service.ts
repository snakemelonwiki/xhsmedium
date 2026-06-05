import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Employee } from '../../entities/employee.entity';
import { User } from '../../entities/user.entity';
import { makeId } from '../../shared/utils/id-generator';
import * as bcrypt from 'bcrypt';

export interface CreateEmployeeWithLoginInput {
  // 员工基础字段
  name: string;
  phone?: string | null;
  hireDate?: string | null;
  status?: string;

  // 登录账号字段（可选）
  loginUsername?: string | null;
  loginPassword?: string | null;
  loginRole?: string | null;
  createLoginAccount?: boolean;
  // 双向回写：service 不直接读此字段，由 controller 透传当前操作人
  actorUserId?: string;
}

export interface UpdateEmployeeWithLoginInput {
  name?: string;
  phone?: string | null;
  hireDate?: string | null;
  status?: string;
  /** v1.4 主管端-员工管理：部门名称（简单字符串，不另建表） */
  department?: string | null;
  // 登录账号字段（可选，缺省保持不变）
  loginPassword?: string | null;
  loginRole?: string | null;
}

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
   * 创建员工资料（不带登录账号）。
   * 仍保留向后兼容；新代码应使用 createWithLogin。
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
   * 创建员工并自动生成登录账号（B 端 1.2 P0-A5 修复）。
   *
   * 默认行为（createLoginAccount !== false）：
   *   - 用户名：loginUsername ?? <name>_<phone后4位> ?? <name>_<random4>
   *   - 密码  ：loginPassword ?? 8 位随机大小写+数字
   *   - 角色  ：loginRole ?? 'operation'
   *   - 状态  ：'active'
   *   - 双向外键：user.employeeId = employee.id
   *
   * 初始明文密码仅在返回结果中返回一次（不落库明文，仅落 bcrypt 哈希）。
   */
  async createWithLogin(
    employeeCode: string,
    input: CreateEmployeeWithLoginInput,
  ): Promise<{
    employee: Employee;
    loginAccount: { userId: string; username: string; role: string; initialPassword: string } | null;
  }> {
    const name = String(input.name || '').trim();
    if (!name) {
      throw new BadRequestException('name (姓名) 为必填字段');
    }
    if (!employeeCode || !String(employeeCode).trim()) {
      throw new BadRequestException('employeeCode (员工编号) 为必填字段');
    }

    // 1) 唯一性预校验（username）
    const shouldCreate = input.createLoginAccount !== false;
    let username: string | null = null;
    if (shouldCreate) {
      username = String(input.loginUsername || '').trim() || this.generateDefaultUsername(name, input.phone);
      const existing = await this.userRepository.findOne({ where: { username } });
      if (existing) {
        throw new ConflictException(`用户名 ${username} 已存在`);
      }
    }

    // 2) 创建 employee
    const employee = this.employeeRepository.create({
      employeeCode,
      name,
      phone: input.phone || null,
      hireDate: input.hireDate || null,
      status: input.status || '在职',
      id: makeId(),
    } as any);

    let saved: Employee;
    try {
      const out = await this.employeeRepository.save(employee);
      saved = Array.isArray(out) ? (out[0] as Employee) : (out as Employee);
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`员工编号 ${employeeCode} 已存在`);
      }
      console.error('[employees.createWithLogin] save employee failed:', {
        employeeCode,
        error: err.message,
        code: err.code,
      });
      throw err;
    }

    // 3) 自动创建登录账号
    if (!shouldCreate) {
      return { employee: saved, loginAccount: null };
    }

    const password = String(input.loginPassword || '').trim() || this.generateRandomPassword();
    const role = String(input.loginRole || 'operation').trim() || 'operation';
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = this.userRepository.create({
      id: makeId(),
      username: username as string,
      password: hashedPassword,
      role,
      employeeId: saved.id,
      status: 'active',
    } as any);

    let savedUser: User;
    try {
      const out = await this.userRepository.save(user);
      savedUser = Array.isArray(out) ? (out[0] as User) : (out as User);
    } catch (err: any) {
      // user 创建失败：尝试回滚 employee（尽力而为）
      try {
        await this.employeeRepository.delete(saved.id);
      } catch (cleanupErr) {
        console.error('[employees.createWithLogin] rollback employee failed:', (cleanupErr as any)?.message || cleanupErr);
      }
      if (err.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`用户名 ${username} 已存在`);
      }
      console.error('[employees.createWithLogin] save user failed:', {
        username,
        error: err.message,
        code: err.code,
      });
      throw err;
    }

    return {
      employee: saved,
      loginAccount: {
        userId: savedUser.id,
        username: savedUser.username,
        role: savedUser.role,
        initialPassword: password, // 仅首次返回，不落库
      },
    };
  }

  /**
   * 更新员工资料（不带登录账号同步）。
   * 仍保留向后兼容；新代码应使用 updateWithLogin。
   */
  async update(id: string, dto: Partial<Employee>): Promise<void> {
    await this.employeeRepository.update(id, dto);
  }

  /**
   * 更新员工资料 + 同步更新关联 user（B 端 1.2 P0-A5 修复）。
   *
   * 若该员工已绑定 user（user.employeeId == id），则同步：
   *   - loginPassword：bcrypt 哈希后写回 user.password
   *   - loginRole    ：写回 user.role
   */
  async updateWithLogin(
    id: string,
    input: UpdateEmployeeWithLoginInput,
  ): Promise<Employee> {
    const before = await this.findById(id);
    if (!before) {
      throw new NotFoundException('员工不存在');
    }

    const updates: Partial<Employee> = {};
    if (input.name !== undefined) updates.name = String(input.name);
    if (input.phone !== undefined) updates.phone = input.phone || null;
    if (input.hireDate !== undefined) updates.hireDate = input.hireDate || null;
    if (input.status !== undefined) updates.status = input.status;
    if (input.department !== undefined) updates.department = input.department || null;

    if (Object.keys(updates).length > 0) {
      await this.employeeRepository.update(id, updates);
    }

    // 同步更新关联 user
    const linkedUser = await this.userRepository.findOne({ where: { employeeId: id } });
    if (linkedUser) {
      const userUpdates: Partial<User> = {};
      if (input.loginPassword !== undefined && input.loginPassword !== null && String(input.loginPassword).length > 0) {
        userUpdates.password = await bcrypt.hash(String(input.loginPassword), 10);
      }
      if (input.loginRole !== undefined && input.loginRole !== null && String(input.loginRole).length > 0) {
        userUpdates.role = String(input.loginRole);
      }
      if (Object.keys(userUpdates).length > 0) {
        await this.userRepository.update(linkedUser.id, userUpdates);
      }
    }

    const after = await this.findById(id);
    return after as Employee;
  }

  /**
   * 更新员工启停状态。
   */
  async updateStatus(id: string, status: string): Promise<void> {
    await this.employeeRepository.update(id, { status });
  }

  /**
   * 删除员工（不带关联 user 处理）。
   * 仍保留向后兼容；新代码应使用 disable / softDelete。
   */
  async remove(id: string): Promise<void> {
    await this.employeeRepository.delete(id);
  }

  /**
   * 软删除（=停用）员工 + 同步停用关联 user（B 端 1.2 P0-A5 修复）。
   * - 不物理删除 employee
   * - 同步将 user.status 设为 'inactive'（保留历史数据归属）
   */
  async softDelete(id: string): Promise<Employee> {
    const before = await this.findById(id);
    if (!before) {
      throw new NotFoundException('员工不存在');
    }
    await this.employeeRepository.update(id, { status: '离职' });
    const linkedUser = await this.userRepository.findOne({ where: { employeeId: id } });
    if (linkedUser) {
      await this.userRepository.update(linkedUser.id, { status: 'inactive' });
    }
    const after = await this.findById(id);
    return after as Employee;
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

  /**
   * 生成默认用户名：name_手机号后4位（不足4位则用随机4位）。
   * 小写化以满足 username 列 utf8mb4_general_ci 兼容性。
   */
  private generateDefaultUsername(name: string, phone?: string | null): string {
    const safeName = String(name || 'user').replace(/[^a-zA-Z0-9_一-龥]/g, '');
    const phoneStr = String(phone || '').replace(/\D/g, '');
    if (phoneStr.length >= 4) {
      return `${safeName}_${phoneStr.slice(-4)}`.toLowerCase();
    }
    const rand = Math.random().toString(36).slice(-4);
    return `${safeName}_${rand}`.toLowerCase();
  }

  /**
   * 生成 8~12 位随机密码（大小写字母 + 数字）。
   */
  private generateRandomPassword(): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const all = upper + lower + digits;
    const pick = (src: string) => src[Math.floor(Math.random() * src.length)];
    // 保证 1 大写 + 1 小写 + 1 数字
    let pwd = pick(upper) + pick(lower) + pick(digits);
    for (let i = 0; i < 5; i++) pwd += pick(all);
    return pwd;
  }
}
