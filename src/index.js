#!/usr/bin/env node

import { program } from 'commander';
import logger from './logger.js';
import config from './config.js';
import { notify } from './notify.js';
import {
  interactiveLogin,
  ensureAuthenticated,
  clearSession,
  hasSession,
  saveSession,
} from './auth.js';
import {
  collectFuel,
  completeBrowsingTasks,
  browseStorePages,
  runAllDailyTasks,
  getStatus,
} from './points.js';

const VERSION = '1.0.0';

program
  .name('xiaomi-points')
  .description('Automated daily Mi Points collector for Xiaomi UK')
  .version(VERSION);

program
  .command('login')
  .description('Open a browser window to log in to your Xiaomi UK account')
  .action(async () => {
    await runLogin();
  });

program
  .command('collect')
  .description('Run all daily point collection tasks')
  .action(async () => {
    await runCollect();
  });

program
  .command('fuel')
  .description('Collect daily fuel only')
  .action(async () => {
    await runFuelOnly();
  });

program
  .command('status')
  .description('Check current points balance and today\'s collection status')
  .action(async () => {
    await runStatus();
  });

program
  .command('logout')
  .description('Clear saved session data')
  .action(async () => {
    clearSession();
    logger.info('Logged out. Run "login" to start a new session.');
  });

// Support legacy --flag syntax for backwards compatibility
program
  .option('--login', 'Open browser for interactive login')
  .option('--collect', 'Run all daily collection tasks')
  .option('--status', 'Show current points status')
  .option('--fuel', 'Collect daily fuel only')
  .option('--logout', 'Clear saved session');

program.parse();

const opts = program.opts();

// Handle --flag invocations (when no subcommand is used)
if (opts.login) {
  await runLogin();
} else if (opts.collect) {
  await runCollect();
} else if (opts.fuel) {
  await runFuelOnly();
} else if (opts.status) {
  await runStatus();
} else if (opts.logout) {
  clearSession();
  logger.info('Logged out. Run "login" to start a new session.');
} else if (!process.argv.slice(2).some(a => ['login', 'collect', 'fuel', 'status', 'logout'].includes(a))) {
  // Default action: run collect if session exists, otherwise prompt login
  if (hasSession()) {
    await runCollect();
  } else {
    logger.info('No session found. Starting interactive login...');
    logger.info('(Tip: You can also run specific commands: login, collect, fuel, status, logout)');
    const success = await runLogin();
    if (success) {
      logger.info('Login successful! Now running daily collection...');
      await runCollect();
    }
  }
}

// ── Command Implementations ──

async function runLogin() {
  logger.separator();
  logger.info('Xiaomi Points Collector - Interactive Login');
  logger.info(`Region: ${config.region.toUpperCase()}`);
  logger.separator();

  const success = await interactiveLogin();
  if (success) {
    notify('Xiaomi Points', 'Login successful! Session saved.');
  } else {
    notify('Xiaomi Points', 'Login failed. Please try again.');
  }
  return success;
}

async function runCollect() {
  logger.separator();
  logger.info('Xiaomi Points Collector - Daily Collection');
  logger.info(`Region: ${config.region.toUpperCase()}`);
  logger.info(`Date: ${new Date().toLocaleDateString('en-GB')}`);
  logger.separator();

  const session = await ensureAuthenticated();
  if (!session) {
    notify('Xiaomi Points', 'Session expired. Please run login again.');
    process.exit(1);
  }

  const { browser, context, page } = session;

  try {
    const results = await runAllDailyTasks(page);

    // Save refreshed session
    await saveSession(context);

    // Send notification with summary
    const fuelStatus = results.fuel?.success
      ? (results.fuel.alreadyCollected ? 'already done' : 'collected!')
      : 'failed';
    const balance = results.finalBalance !== null ? `${results.finalBalance} pts` : 'unknown';

    notify(
      'Xiaomi Points - Daily Collection',
      `Fuel: ${fuelStatus} | Balance: ${balance}`,
    );
  } catch (err) {
    logger.error('Fatal error during collection:', err.message);
    logger.error(err.stack);
    notify('Xiaomi Points', `Error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

async function runFuelOnly() {
  logger.separator();
  logger.info('Xiaomi Points Collector - Fuel Collection Only');
  logger.separator();

  const session = await ensureAuthenticated();
  if (!session) {
    notify('Xiaomi Points', 'Session expired. Please run login again.');
    process.exit(1);
  }

  const { browser, context, page } = session;

  try {
    const result = await collectFuel(page);
    await saveSession(context);

    if (result.success) {
      notify('Xiaomi Points', result.alreadyCollected ? 'Fuel already collected today.' : 'Fuel collected!');
    } else {
      notify('Xiaomi Points', `Fuel collection failed: ${result.reason}`);
    }
  } catch (err) {
    logger.error('Error during fuel collection:', err.message);
    notify('Xiaomi Points', `Error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

async function runStatus() {
  logger.separator();
  logger.info('Xiaomi Points Collector - Status Check');
  logger.separator();

  const session = await ensureAuthenticated();
  if (!session) {
    process.exit(1);
  }

  const { browser, context, page } = session;

  try {
    const status = await getStatus(page);
    await saveSession(context);

    if (status) {
      logger.separator();
      logger.info('POINTS STATUS');
      logger.separator();
      logger.info(`Balance: ${status.balance !== null ? `${status.balance} Mi Points` : 'Unable to read'}`);
      logger.info(`Fuel today: ${status.fuelCollectedToday ? 'Collected' : 'Not yet collected'}`);
      if (status.streak) logger.info(`Streak: ${status.streak}`);
      logger.info(`Page URL: ${status.url}`);
      logger.separator();
    }
  } catch (err) {
    logger.error('Error checking status:', err.message);
  } finally {
    await browser.close();
  }
}
