import { Injectable } from '@nestjs/common';

export type Platform = 'xhs' | 'douyin' | null;
export type ContactType = 'phone' | 'wechat' | 'douyin' | 'xhs' | 'unknown';
export type HitState = 'matched' | 'guess' | 'unknown';

export interface ParsedLead {
  platform: Platform;
  accountKeyword: string | null;
  nickname: string | null;
  contact: string | null;
  contactType: ContactType;
  ip: string | null;
  sourcePostKeyword: string | null;
  operatorKeyword: string | null;
  status: string | null;
  remark: string | null;
}

export interface ParseHits {
  platform: HitState;
  contact: HitState;
  nickname: HitState;
  accountKeyword: HitState;
  ip: HitState;
  sourcePostKeyword: HitState;
  operatorKeyword: HitState;
  status: HitState;
  remark: HitState;
}

export interface ParseResult {
  parsed: ParsedLead;
  hits: ParseHits;
}

// --- Regex catalog (kept here so route handlers stay clean) ---
const PLATFORM_XHS_RE = /(小红书|红薯|小红薯|xhs|RED)/i;
const PLATFORM_DOUYIN_RE = /(抖音|dy|tiktok)/i;

const PHONE_RE = /\b1[3-9]\d{9}\b/;
const WXID_RE = /wxid_[a-zA-Z0-9_]+/;
const WECHAT_LABEL_RE = /(?:微信|v信|vx|wx)[\s:：是]*([a-zA-Z0-9_-]{4,32})/i;
const DOUYIN_LABEL_RE = /(?:抖音号|dy)[\s:：是]*([a-zA-Z0-9_.-]{3,32})/i;
const XHS_LABEL_RE = /(?:小红书号|xhs号|红薯号)[\s:：是]*([a-zA-Z0-9_-]{3,32})/i;

const NICKNAME_RE = /(?:昵称|姓名|客户)[\s:：是]*([^\s\n]{1,32})/;
const SOURCE_RE = /(?:来源|作品)[\s:：是]*([^\n]{1,64})/;
const OPERATOR_RE = /(?:运营|来源运营)[\s:：是]*([^\s\n]{1,32})/;
const IP_RE = /(?:IP|地区|地域|城市)[\s:：是]*([^\s\n]{1,32})/i;
const STATUS_RE = /(?:状态)[\s:：是]*([^\s\n]{1,16})/;
const REMARK_RE = /(?:备注|说明)[\s:：是]*([^\n]{1,200})/;
const ACCOUNT_RE = /(?:账号|本号|本账号|来源账号)[\s:：是]*([^\s\n]{1,32})/;

interface ContactResult {
  contact: string | null;
  contactType: ContactType;
  hit: HitState;
}

function detectContact(text: string): ContactResult {
  // Priority: phone > wxid_ > wechat-label > douyin-label > xhs-label
  const phoneMatch = text.match(PHONE_RE);
  if (phoneMatch) {
    return { contact: phoneMatch[0], contactType: 'phone', hit: 'matched' };
  }

  const wxidMatch = text.match(WXID_RE);
  if (wxidMatch) {
    return { contact: wxidMatch[0], contactType: 'wechat', hit: 'matched' };
  }

  const wechatLabelMatch = text.match(WECHAT_LABEL_RE);
  if (wechatLabelMatch) {
    return { contact: wechatLabelMatch[1], contactType: 'wechat', hit: 'matched' };
  }

  const douyinLabelMatch = text.match(DOUYIN_LABEL_RE);
  if (douyinLabelMatch) {
    return { contact: douyinLabelMatch[1], contactType: 'douyin', hit: 'matched' };
  }

  const xhsLabelMatch = text.match(XHS_LABEL_RE);
  if (xhsLabelMatch) {
    return { contact: xhsLabelMatch[1], contactType: 'xhs', hit: 'matched' };
  }

  return { contact: null, contactType: 'unknown', hit: 'unknown' };
}

function detectPlatform(
  text: string,
  contactType: ContactType,
): { platform: Platform; hit: HitState } {
  if (PLATFORM_XHS_RE.test(text)) return { platform: 'xhs', hit: 'matched' };
  if (PLATFORM_DOUYIN_RE.test(text)) return { platform: 'douyin', hit: 'matched' };
  if (contactType === 'xhs') return { platform: 'xhs', hit: 'guess' };
  if (contactType === 'douyin') return { platform: 'douyin', hit: 'guess' };
  return { platform: null, hit: 'unknown' };
}

function matchField(text: string, re: RegExp): { value: string | null; hit: HitState } {
  const m = text.match(re);
  if (m && m[1]) {
    const v = m[1].trim();
    if (v) return { value: v, hit: 'matched' };
  }
  return { value: null, hit: 'unknown' };
}

export function parseLeadText(rawText: string, _imageUrls?: string[]): ParseResult {
  const text = String(rawText || '');

  const contactRes = detectContact(text);
  const platformRes = detectPlatform(text, contactRes.contactType);

  const nickname = matchField(text, NICKNAME_RE);
  const source = matchField(text, SOURCE_RE);
  const operator = matchField(text, OPERATOR_RE);
  const ip = matchField(text, IP_RE);
  const status = matchField(text, STATUS_RE);
  const remark = matchField(text, REMARK_RE);
  const account = matchField(text, ACCOUNT_RE);

  const parsed: ParsedLead = {
    platform: platformRes.platform,
    accountKeyword: account.value,
    nickname: nickname.value,
    contact: contactRes.contact,
    contactType: contactRes.contactType,
    ip: ip.value,
    sourcePostKeyword: source.value,
    operatorKeyword: operator.value,
    status: status.value,
    remark: remark.value,
  };

  const hits: ParseHits = {
    platform: platformRes.hit,
    contact: contactRes.hit,
    nickname: nickname.hit,
    accountKeyword: account.hit,
    ip: ip.hit,
    sourcePostKeyword: source.hit,
    operatorKeyword: operator.hit,
    status: status.hit,
    remark: remark.hit,
  };

  return { parsed, hits };
}

@Injectable()
export class LeadsParserService {
  parse(rawText: string, imageUrls?: string[]): ParseResult {
    return parseLeadText(rawText, imageUrls);
  }
}
