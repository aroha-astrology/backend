import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** The address ChatGPT connects to. Its origin can never change once the plugin is published. */
export const MCP_PATH = '/mcp';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.aroha.astrology';
export const WEB_APP_URL = 'https://app.arohaastrology.in';

/** Hints ChatGPT attaches to a tool call. All optional and best-effort; never used for access decisions. */
export interface ToolCallMeta {
  /** Anonymous, stable per-user id ("openai/subject"), used only to pace requests. */
  subject?: string;
  userAgent?: string;
  /** Coarse location ("openai/userLocation"). */
  location?: { city?: string; region?: string; country?: string; timezone?: string };
}

export function readToolCallMeta(meta: Record<string, unknown> | undefined): ToolCallMeta {
  if (!meta) return {};
  const out: ToolCallMeta = {};
  const subject = meta['openai/subject'];
  if (typeof subject === 'string' && subject) out.subject = subject;

  const userAgent = meta['openai/userAgent'];
  if (typeof userAgent === 'string') out.userAgent = userAgent;
  else if (userAgent && typeof userAgent === 'object') out.userAgent = JSON.stringify(userAgent);

  const loc = meta['openai/userLocation'];
  if (loc && typeof loc === 'object') {
    const l = loc as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    out.location = {
      city: str(l.city),
      region: str(l.region),
      country: str(l.country),
      timezone: str(l.timezone),
    };
  }
  return out;
}

/** Android gets the Play Store listing; every other device (or no hint) gets the web app. */
export function openInArohaUrl(userAgent: string | undefined): string {
  return userAgent && /android/i.test(userAgent) ? PLAY_STORE_URL : WEB_APP_URL;
}

/** What a tool handler knows about the caller. */
export interface ToolContext {
  meta: ToolCallMeta;
  /** Bucket for pacing when ChatGPT sent no anonymous user id. */
  peer: string;
}

export function textResult(structured: Record<string, unknown>, summary: string): CallToolResult {
  return { structuredContent: structured, content: [{ type: 'text', text: summary }] };
}

/** A tool-level failure the model can read and act on (ask the user, try again later). */
export function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** The chart card. The URI is a cache key: change the version when the HTML changes in a breaking way. */
export const BIRTH_CHART_WIDGET_URI = 'ui://aroha/birth-chart-v1.html';
