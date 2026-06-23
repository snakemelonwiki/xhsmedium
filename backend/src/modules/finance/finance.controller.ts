import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionUserId, getSessionRole } from '../../common/session.utils';
import { FinanceService } from './finance.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

const FINANCE_ROLES = ['owner', 'admin'];

/** 财务系统：owner / admin 可访问。 */
function assertFinanceAccess(req: any): void {
  const role = getSessionRole(req);
  if (!FINANCE_ROLES.includes(role)) {
    throw new ForbiddenException('forbidden: 无权访问财务系统');
  }
}

@Controller('finance')
@UseGuards(AuthGuard)
export class FinanceController {
  constructor(
    private readonly service: FinanceService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  /**
   * Best-effort 写一条操作日志，try/catch 包住避免日志失败影响主流程。
   */
  private async logSafe(args: {
    userId: string;
    action: OPERATION_LOG_ACTIONS;
    targetType: OPERATION_LOG_TARGET_TYPES;
    targetId: string;
    detail?: any;
    req?: Request;
  }): Promise<void> {
    try {
      await this.operationLogs.log({
        userId: args.userId || '',
        action: args.action,
        targetType: args.targetType,
        targetId: args.targetId,
        detail: stringifyDetail(args.detail),
        ip: parseIp(args.req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[finance] operation log failed', (logErr as any)?.message || logErr);
    }
  }

  // === 订单收入 ===

  @Get('order-income')
  async listOrderIncome(@Query() query: any, @Req() req: Request) {
    assertFinanceAccess(req);
    return this.service.listOrderIncome(query);
  }

  // === 订单支出（老师付款） ===

  @Get('teacher-payments')
  async listTeacherPayments(@Query() query: any, @Req() req: Request) {
    assertFinanceAccess(req);
    return this.service.listTeacherPayments(query);
  }

  @Post('teacher-payments')
  async createTeacherPayment(@Body() body: any, @Req() req: Request) {
    assertFinanceAccess(req);
    const userId = getSessionUserId(req) || '';
    const created = await this.service.createTeacherPayment(body, userId);
    await this.logSafe({
      userId,
      action: OPERATION_LOG_ACTIONS.CREATE,
      targetType: OPERATION_LOG_TARGET_TYPES.TEACHER_PAYMENT,
      targetId: created.id,
      detail: {
        orderId: created.orderId,
        teacherId: created.teacherId,
        stageCode: created.stageCode,
        amount: created.amount,
      },
      req,
    });
    return { ok: true, data: created };
  }

  @Patch('teacher-payments/:id')
  async updateTeacherPayment(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    assertFinanceAccess(req);
    const userId = getSessionUserId(req) || '';
    const updated = await this.service.updateTeacherPayment(id, body, userId);
    await this.logSafe({
      userId,
      action: OPERATION_LOG_ACTIONS.UPDATE,
      targetType: OPERATION_LOG_TARGET_TYPES.TEACHER_PAYMENT,
      targetId: id,
      detail: {
        changes: body,
        after: {
          orderId: updated.orderId,
          stageCode: updated.stageCode,
          amount: updated.amount,
        },
      },
      req,
    });
    return { ok: true, data: updated };
  }

  @Delete('teacher-payments/:id')
  async deleteTeacherPayment(@Param('id') id: string, @Req() req: Request) {
    assertFinanceAccess(req);
    const userId = getSessionUserId(req) || '';
    await this.service.deleteTeacherPayment(id);
    await this.logSafe({
      userId,
      action: OPERATION_LOG_ACTIONS.DELETE,
      targetType: OPERATION_LOG_TARGET_TYPES.TEACHER_PAYMENT,
      targetId: id,
      req,
    });
    return { ok: true };
  }

  // === 其他支出 ===

  @Get('other-expenses')
  async listOtherExpenses(@Query() query: any, @Req() req: Request) {
    assertFinanceAccess(req);
    return this.service.listOtherExpenses(query);
  }

  @Post('other-expenses')
  async createOtherExpense(@Body() body: any, @Req() req: Request) {
    assertFinanceAccess(req);
    const userId = getSessionUserId(req) || '';
    const created = await this.service.createOtherExpense(body, userId);
    await this.logSafe({
      userId,
      action: OPERATION_LOG_ACTIONS.CREATE,
      targetType: OPERATION_LOG_TARGET_TYPES.OTHER_EXPENSE,
      targetId: created.id,
      detail: {
        category: created.category,
        amount: created.amount,
        relatedOrderId: created.relatedOrderId,
      },
      req,
    });
    return { ok: true, data: created };
  }

  @Patch('other-expenses/:id')
  async updateOtherExpense(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    assertFinanceAccess(req);
    const userId = getSessionUserId(req) || '';
    const updated = await this.service.updateOtherExpense(id, body, userId);
    await this.logSafe({
      userId,
      action: OPERATION_LOG_ACTIONS.UPDATE,
      targetType: OPERATION_LOG_TARGET_TYPES.OTHER_EXPENSE,
      targetId: id,
      detail: {
        changes: body,
        after: {
          category: updated.category,
          amount: updated.amount,
        },
      },
      req,
    });
    return { ok: true, data: updated };
  }

  @Delete('other-expenses/:id')
  async deleteOtherExpense(@Param('id') id: string, @Req() req: Request) {
    assertFinanceAccess(req);
    const userId = getSessionUserId(req) || '';
    await this.service.deleteOtherExpense(id);
    await this.logSafe({
      userId,
      action: OPERATION_LOG_ACTIONS.DELETE,
      targetType: OPERATION_LOG_TARGET_TYPES.OTHER_EXPENSE,
      targetId: id,
      req,
    });
    return { ok: true };
  }
}
