import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { LeadsParserService } from './leads-parser.service';

@Controller('leads')
export class LeadsParserController {
  constructor(private readonly leadsParserService: LeadsParserService) {}

  @Post('parse')
  async parse(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    // session is read for parity with other lead routes; parsing itself is stateless
    const _session = (req as any).session;
    const rawText = typeof body?.rawText === 'string' ? body.rawText : '';
    const imageUrls = Array.isArray(body?.imageUrls) ? body.imageUrls : undefined;

    if (!rawText.trim()) {
      return res.status(400).json({ ok: false, message: 'rawText required' });
    }

    const result = this.leadsParserService.parse(rawText, imageUrls);
    return res.json(result);
  }
}
