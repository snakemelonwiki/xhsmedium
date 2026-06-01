import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 系统用户账号表。
 *
 * 角色（role）与端口/前端路径对应关系：
 * - admin    主管端账号（运营管理）→ 前端 /admin/*，可查看跨员工聚合数据、做员工/账号/订单分配
 * - staff    运营员工账号 → 前端 /operation/*，portType = 'operations'
 * - owner    总后台账号 → 仅可在 OWNER_PORT（默认 3001）登录，禁止从主业务端口登录
 * - sales    销售账号 → 前端 /sales/*，portType = 'sales'
 * - academic 教务账号 → 前端 /academic/*，portType = 'academic'
 *
 * 注意：原 schema 仅有 admin/staff 两值，owner/sales/academic 是通过追加枚举值的方式扩展，
 *      不可删除已有枚举值，不可修改字段类型；调整角色集合时同步 schema.sql 与 M5 迁移。
 */
@Entity('users')
export class User {
  /** 用户唯一 ID（UUID） */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 登录用户名，全局唯一 */
  @Column({ length: 64, unique: true, comment: '登录用户名（全局唯一）' })
  username: string;

  /** 登录密码：新建账号写 bcrypt hash（$2a$/$2b$ 开头），历史明文兼容仍可登录 */
  @Column({ length: 255, comment: '登录密码：bcrypt hash 或历史明文' })
  password: string;

  /**
   * 账号角色，决定可访问的前端入口与接口数据范围：
   * - admin    主管端（运营管理）
   * - staff    运营员工
   * - owner    总后台（仅 OWNER_PORT 入口）
   * - sales    销售
   * - academic 教务
   */
  @Column({
    type: 'enum',
    enum: ['admin', 'staff', 'owner', 'sales', 'academic'],
    comment: '账号角色：admin主管端 | staff运营员工 | owner总后台 | sales销售 | academic教务',
  })
  role: string;

  /** 关联 employees.id；owner 等纯账号可为空 */
  @Column({ name: 'employee_id', length: 64, nullable: true, comment: '关联员工ID（employees.id）；owner 等纯账号可为空' })
  employeeId: string | null;

  /**
   * 账号状态：
   * - active   正常可登录
   * - inactive 已停用，禁止登录但保留历史数据归属
   * - locked   临时锁定（如密码连续失败），需主管端解锁
   */
  @Column({
    length: 32,
    default: 'active',
    comment: '账号状态：active正常 | inactive停用 | locked锁定',
  })
  status: string;

  /** 账号创建时间 */
  @CreateDateColumn({ name: 'created_at', comment: '账号创建时间' })
  createdAt: Date;

  /** 账号最后更新时间（任意字段变更触发） */
  @UpdateDateColumn({ name: 'updated_at', comment: '账号最后更新时间' })
  updatedAt: Date;
}
