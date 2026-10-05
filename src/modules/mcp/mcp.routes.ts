import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { env } from '../../config/env.js';
import { CLAUDE_MCP_PATH, MCP_PATH, type McpHost, type ToolContext } from './mcp.context.js';
import { buildMcpServer } from './mcp.server.js';

/**
 * The ChatGPT plugin's endpoint (MCP over streamable HTTP), the same tools
 * for Claude on their own path, and the OpenAI domain-verification file.
 * Mounted at the app root, outside /v1: the /v1
 * baseline limiter buckets by network peer, and every ChatGPT request comes
 * from OpenAI's addresses, so it would pace all ChatGPT users as one. The
 * tools pace per person instead (mcp.tools.ts).
 */
export const mcpRouter = new Hono();

/** Network peer, used to pace callers that send no ChatGPT user id. */
function peerOf(c: Context): string {
  if (env.TRUST_PROXY) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return `ip:${forwarded}`;
  }
  try {
    const address = getConnInfo(c).remote.address;
    if (address) return `ip:${address}`;
  } catch {
    /* no socket under this runtime/test harness */
  }
  return 'unknown';
}

type ToolListing = { _meta?: { securitySchemes?: unknown }; securitySchemes?: unknown };
type RpcMessage = { result?: { tools?: ToolListing[] } };

/**
 * ChatGPT reads each tool's sign-in rule from a top-level `securitySchemes`
 * field. The MCP SDK only emits the fields it knows, so the rule is declared
 * under `_meta` (the documented fallback) and copied up here.
 */
function liftSecuritySchemes(payload: unknown): void {
  for (const message of (Array.isArray(payload) ? payload : [payload]) as RpcMessage[]) {
    for (const tool of message?.result?.tools ?? []) {
      if (tool._meta?.securitySchemes) tool.securitySchemes = tool._meta.securitySchemes;
    }
  }
}

async function handleMcp(c: Context, host: McpHost): Promise<Response> {
  const base: ToolContext = { host, meta: {}, peer: peerOf(c) };

  const server = buildMcpServer(base);
  // No session id and a plain JSON reply: any worker can answer any request.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(c.req.raw);
    if (!response.headers.get('content-type')?.includes('application/json')) return response;

    const payload: unknown = await response.json();
    liftSecuritySchemes(payload);
    return c.json(payload as object, response.status as 200);
  } finally {
    void transport.close();
    void server.close();
  }
}

mcpRouter.post(MCP_PATH, (c) => handleMcp(c, 'chatgpt'));
mcpRouter.post(CLAUDE_MCP_PATH, (c) => handleMcp(c, 'claude'));

// Stateless: there is no server-to-client stream to open and no session to end.
mcpRouter.on(['GET', 'DELETE'], [MCP_PATH, CLAUDE_MCP_PATH], (c) =>
  c.json(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null },
    405,
    { Allow: 'POST' },
  ),
);

/**
 * OpenAI's domain check: the plugin dashboard shows a token and fetches this
 * URL expecting exactly that token as plain text.
 */
mcpRouter.get('/.well-known/openai-apps-challenge', (c) =>
  env.OPENAI_APPS_CHALLENGE_TOKEN ? c.text(env.OPENAI_APPS_CHALLENGE_TOKEN) : c.notFound(),
);

/**
 * The public help page for the Claude connector. Anthropic's directory asks
 * for setup and usage instructions at a public address; it lives here so the
 * connector needs nothing from the website or the apps.
 */
let claudeHelpHtml: string | null = null;
mcpRouter.get('/connectors/claude', (c) => {
  claudeHelpHtml ??= readFileSync(
    join(process.cwd(), 'data', 'chatgpt', 'claude-connector.html'),
    'utf8',
  );
  return c.html(claudeHelpHtml, 200, { 'Cache-Control': 'public, max-age=3600' });
});
