import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import config from './config.js';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[config.logLevel] ?? LOG_LEVELS.info;

function getTimestamp() {
  return new Date().toISOString();
}

function getLogFile() {
  const date = new Date().toISOString().split('T')[0];
  return resolve(config.logsDir, `points-${date}.log`);
}

function formatMessage(level, ...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  return `[${getTimestamp()}] [${level.toUpperCase()}] ${msg}`;
}

function writeToFile(formatted) {
  try {
    appendFileSync(getLogFile(), formatted + '\n');
  } catch {
    // Silently fail file logging - don't crash the app
  }
}

const logger = {
  debug(...args) {
    const formatted = formatMessage('debug', ...args);
    writeToFile(formatted);
    if (currentLevel <= LOG_LEVELS.debug) console.log('\x1b[90m%s\x1b[0m', formatted);
  },

  info(...args) {
    const formatted = formatMessage('info', ...args);
    writeToFile(formatted);
    if (currentLevel <= LOG_LEVELS.info) console.log('\x1b[36m%s\x1b[0m', formatted);
  },

  success(...args) {
    const formatted = formatMessage('info', ...args);
    writeToFile(formatted);
    if (currentLevel <= LOG_LEVELS.info) console.log('\x1b[32m%s\x1b[0m', formatted);
  },

  warn(...args) {
    const formatted = formatMessage('warn', ...args);
    writeToFile(formatted);
    if (currentLevel <= LOG_LEVELS.warn) console.warn('\x1b[33m%s\x1b[0m', formatted);
  },

  error(...args) {
    const formatted = formatMessage('error', ...args);
    writeToFile(formatted);
    if (currentLevel <= LOG_LEVELS.error) console.error('\x1b[31m%s\x1b[0m', formatted);
  },

  separator() {
    const line = '─'.repeat(60);
    this.info(line);
  },
};

export default logger;
