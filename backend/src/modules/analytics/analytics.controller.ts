import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

@Controller('analytics')
export class AnalyticsController {
  @Get('snapshots')
  async getSnapshots(@Query('date') date: string, @Res() res: Response) {
    // Legacy: returns daily snapshots from JSON
    const fs = require('fs');
    const path = require('path');
    const snapshotFile = path.join(__dirname, '..', '..', '..', 'daily-snapshots.json');
    if (!fs.existsSync(snapshotFile)) {
      return res.json({ snapshots: {} });
    }
    try {
      const raw = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
      return res.json(raw.snapshots || {});
    } catch {
      return res.json({ snapshots: {} });
    }
  }
}
