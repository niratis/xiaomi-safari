import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

dotenvConfig({ path: resolve(PROJECT_ROOT, '.env') });

const REGIONS = {
  uk: { domain: 'mi.com/uk', pointsCenter: 'https://ams.buy.mi.com/uk/user/points-center', store: 'https://www.mi.com/uk' },
  de: { domain: 'mi.com/de', pointsCenter: 'https://ams.buy.mi.com/de/user/points-center', store: 'https://www.mi.com/de' },
  fr: { domain: 'mi.com/fr', pointsCenter: 'https://ams.buy.mi.com/fr/user/points-center', store: 'https://www.mi.com/fr' },
  es: { domain: 'mi.com/es', pointsCenter: 'https://ams.buy.mi.com/es/user/points-center', store: 'https://www.mi.com/es' },
  it: { domain: 'mi.com/it', pointsCenter: 'https://ams.buy.mi.com/it/user/points-center', store: 'https://www.mi.com/it' },
  nl: { domain: 'mi.com/nl', pointsCenter: 'https://ams.buy.mi.com/nl/user/points-center', store: 'https://www.mi.com/nl' },
};

const region = (process.env.XIAOMI_REGION || 'uk').toLowerCase();
const regionConfig = REGIONS[region] || REGIONS.uk;
const dataDir = resolve(process.env.DATA_DIR || PROJECT_ROOT);
const sessionDir = resolve(dataDir, 'session-data');
const logsDir = resolve(dataDir, 'logs');

// Ensure directories exist
for (const dir of [sessionDir, logsDir]) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const config = {
  // Credentials (optional - interactive login used as primary method)
  email: process.env.XIAOMI_EMAIL || '',
  password: process.env.XIAOMI_PASSWORD || '',

  // Region
  region,
  regionConfig,

  // URLs
  urls: {
    accountLogin: 'https://account.xiaomi.com/pass/serviceLogin',
    pointsCenter: regionConfig.pointsCenter,
    store: regionConfig.store,
    storeHome: `${regionConfig.store}/store/`,
  },

  // Browser settings
  headless: process.env.HEADLESS !== 'false',
  pageTimeout: parseInt(process.env.PAGE_TIMEOUT || '30000', 10),

  // Paths
  projectRoot: PROJECT_ROOT,
  sessionDir,
  logsDir,
  sessionFile: resolve(sessionDir, 'browser-state.json'),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Notifications
  notifications: process.env.NOTIFICATIONS !== 'false',

  // Browser user agent (mimic real Safari on macOS)
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
};

export default config;
export { REGIONS, PROJECT_ROOT };
