import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  fredApiKey: process.env.FRED_API_KEY || '',
  comtradeApiKey: process.env.COMTRADE_API_KEY || '',
  tradeGovApiKey: process.env.TRADE_GOV_API_KEY || '',
  acledApiKey: process.env.ACLED_API_KEY || '',
  acledEmail: process.env.ACLED_EMAIL || '',
  acledPassword: process.env.ACLED_PASSWORD || '',
  acledRefreshToken: process.env.REFRESH_TOKEN || '',
  opencorporatesApiKey: process.env.OPENCORPORATES_API_KEY || '',
  datalasticApiKey: process.env.DATALASTIC_API_KEY || '',
  sayariClientId: process.env.SAYARI_CLIENT_ID || '',
  sayariClientSecret: process.env.SAYARI_CLIENT_SECRET || '',
  buildworkforceApiKey: process.env.BUILDWORKFORCE_API_KEY || '',
  buildworkforceTeamId: process.env.BUILDWORKFORCE_TEAM_ID || '56487d92-a610-4875-8263-07a4d4afb6eb',
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  validate(): string[] {
    const issues: string[] = [];
    if (!this.anthropicApiKey) issues.push('ANTHROPIC_API_KEY is required');
    return issues;
  },
};
