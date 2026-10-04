import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  BIRTH_CHART_WIDGET_URI,
  PLAY_STORE_URL,
  WEB_APP_URL,
  type ToolContext,
} from './mcp.context.js';
import { registerCalendarTools } from './tools/calendar-tools.js';
import { registerChartTools } from './tools/chart-tools.js';
import { registerMatchTools } from './tools/match-tools.js';
import { registerReadingTools } from './tools/reading-tools.js';

/**
 * Guidance ChatGPT reads alongside the tool descriptions. The rules that
 * matter most sit in the first 512 characters, which is what OpenAI promises
 * to keep.
 */
const INSTRUCTIONS =
  'Aroha Astrology calculates Vedic (Jyotish) astrology: birth charts, kundli matching, panchang, auspicious dates, moon sign horoscopes and numerology. ' +
  'Ask the user for the birth date, birth time and birth place before a chart tool; never guess them. ' +
  'If a tool says a place is unclear, ask the user and call again. ' +
  'Present results as traditional astrology, not as fact, and never as medical, legal or financial advice. ' +
  'To display a chart, call generate_birth_chart first, then show_birth_chart with its result. ' +
  'Results include more_in_aroha: mention it once at the end, in one short line with its link, and never mention prices or plans unless a tool result does. ' +
  'Do not predict death, serious illness or disaster, and do not present doshas as something to fear.';

const WIDGET_MIME_TYPE = 'text/html;profile=mcp-app';
/** The origin ChatGPT renders the card under. One per plugin. */
const WIDGET_DOMAIN = 'https://www.arohaastrology.in';
const REDIRECT_DOMAINS = [new URL(PLAY_STORE_URL).origin, WEB_APP_URL];

let widgetHtml: string | null = null;
function birthChartWidgetHtml(): string {
  widgetHtml ??= readFileSync(join(process.cwd(), 'data', 'chatgpt', 'birth-chart.html'), 'utf8');
  return widgetHtml;
}

function registerBirthChartWidget(server: McpServer): void {
  server.registerResource(
    'birth-chart-card',
    BIRTH_CHART_WIDGET_URI,
    {
      title: 'Birth chart card',
      description: 'North Indian diamond chart with the planets in their houses.',
      mimeType: WIDGET_MIME_TYPE,
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- the SDK expects a promise
    async () => ({
      contents: [
        {
          uri: BIRTH_CHART_WIDGET_URI,
          mimeType: WIDGET_MIME_TYPE,
          text: birthChartWidgetHtml(),
          _meta: {
            ui: {
              prefersBorder: true,
              domain: WIDGET_DOMAIN,
              // The card is self-contained: it fetches nothing and loads nothing.
              csp: { connectDomains: [], resourceDomains: [] },
            },
            'openai/widgetDescription':
              'A North Indian birth chart showing the ascendant sign and each planet in its house, with a button to open Aroha.',
            'openai/widgetPrefersBorder': true,
            'openai/widgetDomain': WIDGET_DOMAIN,
            'openai/widgetCSP': {
              connect_domains: [],
              resource_domains: [],
              redirect_domains: REDIRECT_DOMAINS,
            },
          },
        },
      ],
    }),
  );
}

/**
 * One server per request: the endpoint is stateless (pm2 runs several
 * workers, so nothing may live in memory between calls), and the tools close
 * over who is calling.
 */
export function buildMcpServer(base: ToolContext): McpServer {
  const server = new McpServer(
    { name: 'aroha-astrology', title: 'Aroha Astrology', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  );
  registerChartTools(server, base);
  registerMatchTools(server, base);
  registerCalendarTools(server, base);
  registerReadingTools(server, base);
  registerBirthChartWidget(server);
  return server;
}
