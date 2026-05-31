import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../entities/user.entity';
import { Employee } from '../../entities/employee.entity';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

const sessions = new Map<string, any>();

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(username: string, password: string, requestPort: number): Promise<any> {
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({ message: '用户名或密码错误' });
    }
    // Support both bcrypt hashed and plain text passwords
    let passwordValid = false;
    if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
      passwordValid = await bcrypt.compare(password, user.password);
    } else {
      passwordValid = user.password === password;
    }
    if (!passwordValid) {
      throw new UnauthorizedException({ message: '用户名或密码错误' });
    }

    const ownerPort = Number(this.configService.get('OWNER_PORT', 3001));
    if (requestPort === ownerPort && user.role !== 'owner') {
      throw new UnauthorizedException({ message: '这个入口是总后台，请使用总后台账号登录' });
    }
    if (requestPort !== ownerPort && user.role === 'owner') {
      throw new UnauthorizedException({ message: '总后台账号请从 3001 端口登录' });
    }

    const employees = await this.employeeRepository.find();
    const employee = user.employeeId ? employees.find((e) => e.id === user.employeeId) : null;

    // Legacy: store in-memory session for backward compatibility
    const legacyToken = require('crypto').randomUUID();
    sessions.set(legacyToken, {
      userId: user.id,
      role: user.role,
      employeeId: user.employeeId,
      username: user.username,
    });

    // Also issue JWT
    const jwtToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
    });

    return {
      token: jwtToken,
      legacyToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.employeeId,
        employeeName: employee?.name || '',
      },
    };
  }

  async getMe(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return null;
    const employees = await this.employeeRepository.find();
    const employee = user.employeeId ? employees.find((e) => e.id === user.employeeId) : null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId || null,
      employeeName: employee?.name || '',
    };
  }

  /**
   * 根据当前有效 JWT 重新签发长会话 token，并返回最新用户信息。
   */
  async refreshToken(token: string): Promise<any> {
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch (_error) {
      throw new UnauthorizedException({ message: '登录已失效，请重新登录' });
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({ message: '登录已失效，请重新登录' });
    }

    const employee = user.employeeId
      ? (await this.employeeRepository.find()).find((item) => item.id === user.employeeId)
      : null;
    const jwtToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
    });

    return {
      token: jwtToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.employeeId || null,
        employeeName: employee?.name || '',
      },
    };
  }

  logout(token: string): void {
    sessions.delete(token);
  }
}
