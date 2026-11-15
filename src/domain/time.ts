import type { CampaignTime } from './types';

/** Parse SAVE / Session / Day markers out of a short piece of text. Returns undefined if none. */
export function parseTime(text: string): CampaignTime | undefined {
  const t: CampaignTime = {};
  const save = /\bSAVE\s+(\d+)\b/.exec(text);
  if (save) t.save = Number(save[1]);
  const session = /\bSession\s+(\d+)\b/i.exec(text);
  if (session) t.session = Number(session[1]);
  const day = /\bDays?\s+(?:~|about\s+)?(\d+)(?:\s*[-–—]\s*(\d+))?/.exec(text);
  if (day) {
    t.dayStart = Number(day[1]);
    t.dayEnd = day[2] ? Number(day[2]) : Number(day[1]);
  }
  return Object.keys(t).length ? t : undefined;
}

/** Later arguments override earlier ones field by field. */
export function mergeTime(...times: (CampaignTime | undefined)[]): CampaignTime | undefined {
  const out: CampaignTime = {};
  for (const t of times) {
    if (!t) continue;
    if (t.session !== undefined) out.session = t.session;
    if (t.save !== undefined) out.save = t.save;
    if (t.dayStart !== undefined) {
      out.dayStart = t.dayStart;
      out.dayEnd = t.dayEnd ?? t.dayStart;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export interface TimeContext {
  saves: Record<number, { dayStart: number; dayEnd: number }>;
  maxSession: number | null;
}

/**
 * A single comparable number for "how late is this", or null when it cannot be known.
 *  - a stated day wins;
 *  - else a SAVE number whose day range the documents state;
 *  - else a session earlier than the latest one (ordered before every dated day);
 *  - the latest session with no day is genuinely unknown -> null.
 */
export function timeOrder(t: CampaignTime | undefined, ctx: TimeContext): number | null {
  if (!t) return null;
  if (t.dayEnd !== undefined) return t.dayEnd;
  if (t.dayStart !== undefined) return t.dayStart;
  if (t.save !== undefined && ctx.saves[t.save]) return ctx.saves[t.save].dayEnd;
  if (t.session !== undefined && ctx.maxSession !== null && t.session < ctx.maxSession) {
    return -(ctx.maxSession - t.session) * 1000;
  }
  return null;
}

export function formatTime(t: CampaignTime | undefined): string {
  if (!t) return 'undated';
  const parts: string[] = [];
  if (t.save !== undefined) parts.push(`SAVE ${t.save}`);
  if (t.dayStart !== undefined) {
    parts.push(t.dayEnd !== undefined && t.dayEnd !== t.dayStart ? `Days ${t.dayStart}–${t.dayEnd}` : `Day ${t.dayStart}`);
  }
  if (!parts.length && t.session !== undefined) parts.push(`Session ${t.session}`);
  return parts.length ? parts.join(', ') : 'undated';
}
