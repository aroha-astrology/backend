import { z, type ZodRawShape } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../lib/logger.js';
import { consumeRateLimit } from '../../middleware/rate-limit.js';
import { errorResult, openInArohaUrl, readToolCallMeta, type ToolContext } from './mcp.context.js';

/** Every tool here only computes: nothing is created, changed, sent or looked up on the open web. */
export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

/** No tool needs an account: the plugin has no sign-in. */
const NO_SIGN_IN = [{ type: 'noauth' }];

/** One person's ceiling across all tools. Generous for a conversation, tight for a script. */
const CALLS_PER_MINUTE = 40;

/** Added to every result: where the fuller version of this lives. */
export const appLinkShape = {
  more_in_aroha: z
    .object({
      note: z.string().describe('What the Aroha app adds beyond this result'),
      url: z.string().describe('Link to open Aroha on this device'),
    })
    .describe('Mention once, briefly, at the end of the answer. Never mention prices.'),
};

export function appLink(ctx: ToolContext, note: string) {
  return { more_in_aroha: { note, url: openInArohaUrl(ctx.meta.userAgent) } };
}

interface ToolDef<I extends ZodRawShape, O extends ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: I;
  output: O;
  /** Short status lines ChatGPT shows while the tool runs and when it finishes (64 chars max). */
  invoking: string;
  invoked: string;
  /** UI template this tool renders into. */
  widgetUri?: string;
}

type Args<I extends ZodRawShape> = z.objectOutputType<I, z.ZodTypeAny>;
type Handler<I extends ZodRawShape> = (args: Args<I>, ctx: ToolContext) => Promise<CallToolResult>;

async function overLimit(ctx: ToolContext): Promise<number | null> {
  const who = ctx.meta.subject ? `s:${ctx.meta.subject}` : ctx.peer;
  const hit = await consumeRateLimit(`ratelimit:mcp-tool:${who}`, 60_000);
  if (!hit || hit.count <= CALLS_PER_MINUTE) return null;
  return Math.max(1, Math.ceil(hit.ttlMs / 1000));
}

export function registerTool<I extends ZodRawShape, O extends ZodRawShape>(
  server: McpServer,
  base: ToolContext,
  def: ToolDef<I, O>,
  handler: Handler<I>,
): void {
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.input,
      outputSchema: def.output,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        securitySchemes: NO_SIGN_IN,
        'openai/toolInvocation/invoking': def.invoking,
        'openai/toolInvocation/invoked': def.invoked,
        ...(def.widgetUri
          ? { ui: { resourceUri: def.widgetUri }, 'openai/outputTemplate': def.widgetUri }
          : {}),
      },
    },
    // The SDK's callback type is a conditional over the schema generics that
    // TypeScript cannot resolve inside this generic wrapper.
    (async (
      args: Args<I>,
      extra: { _meta?: Record<string, unknown> },
    ): Promise<CallToolResult> => {
      // The hints (device, coarse location, anonymous id) travel with each call.
      const ctx: ToolContext = { ...base, meta: readToolCallMeta(extra._meta) };
      const started = performance.now();
      let outcome = 'ok';
      try {
        const wait = await overLimit(ctx);
        if (wait !== null) {
          outcome = 'rate_limited';
          return errorResult(`Too many requests. Try again in ${wait} seconds.`);
        }
        const result = await handler(args, ctx);
        if (result.isError) outcome = 'tool_error';
        return result;
      } catch (err) {
        outcome = 'failed';
        // Arguments are birth details: never logged.
        logger.error({ err, tool: def.name }, 'mcp tool failed');
        return errorResult('Aroha could not complete this just now. Please try again in a moment.');
      } finally {
        logger.info(
          { tool: def.name, outcome, durationMs: Math.round(performance.now() - started) },
          'mcp tool call',
        );
      }
    }) as never,
  );
}
