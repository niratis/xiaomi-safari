#!/usr/bin/env node

/**
 * macOS launchd scheduler for Xiaomi Points Collector.
 *
 * Installs/uninstalls a LaunchAgent that runs the collector daily.
 * Works on macOS only (Apple Silicon / M4 Mac Mini supported).
 *
 * Usage:
 *   node src/schedule.js install   - Install the daily schedule
 *   node src/schedule.js uninstall - Remove the daily schedule
 *   node src/schedule.js status    - Check if schedule is installed
 */

import { existsSync, writeFileSync, unlinkSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { homedir, platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const PLIST_NAME = 'com.xiaomi.points-collector';
const PLIST_FILE = `${PLIST_NAME}.plist`;

function getPlistDir() {
  return resolve(homedir(), 'Library', 'LaunchAgents');
}

function getPlistPath() {
  return resolve(getPlistDir(), PLIST_FILE);
}

function getNodePath() {
  try {
    return execSync('which node', { encoding: 'utf-8' }).trim();
  } catch {
    // Fallback for common Apple Silicon locations
    const fallbacks = [
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
      `${homedir()}/.nvm/versions/node/current/bin/node`,
    ];
    for (const p of fallbacks) {
      if (existsSync(p)) return p;
    }
    return 'node'; // hope it's in PATH
  }
}

function generatePlist(hour = 9, minute = 0) {
  const nodePath = getNodePath();
  const scriptPath = resolve(PROJECT_ROOT, 'src', 'index.js');
  const logDir = resolve(PROJECT_ROOT, 'logs');

  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${scriptPath}</string>
        <string>collect</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${PROJECT_ROOT}</string>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${hour}</integer>
        <key>Minute</key>
        <integer>${minute}</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>${logDir}/launchd-stdout.log</string>

    <key>StandardErrorPath</key>
    <string>${logDir}/launchd-stderr.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>${homedir()}</string>
    </dict>

    <key>RunAtLoad</key>
    <false/>

    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>`;
}

function install() {
  if (platform() !== 'darwin') {
    console.error('Error: launchd scheduling is only available on macOS.');
    console.log('For Linux, use crontab instead:');
    console.log(`  crontab -e`);
    console.log(`  # Add: 0 9 * * * cd ${PROJECT_ROOT} && node src/index.js collect`);
    process.exit(1);
  }

  // Parse optional time argument
  let hour = 9;
  let minute = 0;
  const timeArg = process.argv[3];
  if (timeArg && timeArg.includes(':')) {
    const parts = timeArg.split(':');
    hour = parseInt(parts[0], 10);
    minute = parseInt(parts[1], 10);
    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      console.error('Invalid time format. Use HH:MM (e.g., 09:00)');
      process.exit(1);
    }
  }

  const plistDir = getPlistDir();
  const plistPath = getPlistPath();

  // Ensure LaunchAgents directory exists
  if (!existsSync(plistDir)) {
    mkdirSync(plistDir, { recursive: true });
  }

  // Unload existing plist if present
  if (existsSync(plistPath)) {
    try {
      execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' });
    } catch {
      // Might not be loaded
    }
  }

  // Write the plist
  const plistContent = generatePlist(hour, minute);
  writeFileSync(plistPath, plistContent);
  console.log(`Plist written to: ${plistPath}`);

  // Load the plist
  try {
    execSync(`launchctl load "${plistPath}"`);
    console.log(`\nSchedule installed successfully!`);
    console.log(`The collector will run daily at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}.`);
    console.log(`\nTo change the time, run: npm run schedule:install -- HH:MM`);
    console.log(`To uninstall: npm run schedule:uninstall`);
    console.log(`To test immediately: launchctl start ${PLIST_NAME}`);
  } catch (err) {
    console.error('Failed to load plist:', err.message);
    console.log(`You can manually load it: launchctl load "${plistPath}"`);
  }
}

function uninstall() {
  if (platform() !== 'darwin') {
    console.error('Error: launchd scheduling is only available on macOS.');
    process.exit(1);
  }

  const plistPath = getPlistPath();

  if (!existsSync(plistPath)) {
    console.log('No schedule is currently installed.');
    return;
  }

  try {
    execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' });
  } catch {
    // Might not be loaded
  }

  unlinkSync(plistPath);
  console.log('Schedule uninstalled successfully.');
}

function status() {
  if (platform() !== 'darwin') {
    console.log('launchd is only available on macOS.');
    return;
  }

  const plistPath = getPlistPath();

  if (!existsSync(plistPath)) {
    console.log('No schedule is currently installed.');
    console.log(`To install: npm run schedule:install`);
    return;
  }

  console.log(`Plist file: ${plistPath}`);

  // Read the plist to show the schedule time
  try {
    const content = readFileSync(plistPath, 'utf-8');
    const hourMatch = content.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/);
    const minMatch = content.match(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/);
    if (hourMatch && minMatch) {
      const h = String(hourMatch[1]).padStart(2, '0');
      const m = String(minMatch[1]).padStart(2, '0');
      console.log(`Scheduled time: ${h}:${m} daily`);
    }
  } catch {
    // Non-critical
  }

  // Check if it's actually loaded
  try {
    const output = execSync(`launchctl list | grep ${PLIST_NAME}`, { encoding: 'utf-8' });
    if (output.trim()) {
      console.log('Status: Loaded and active');
      console.log(output.trim());
    }
  } catch {
    console.log('Status: Plist exists but may not be loaded. Run: npm run schedule:install');
  }
}

// Main
const command = process.argv[2];

switch (command) {
  case 'install':
    install();
    break;
  case 'uninstall':
  case 'remove':
    uninstall();
    break;
  case 'status':
    status();
    break;
  default:
    console.log('Xiaomi Points Collector - Schedule Manager');
    console.log('');
    console.log('Usage:');
    console.log('  node src/schedule.js install [HH:MM]  - Install daily schedule (default: 09:00)');
    console.log('  node src/schedule.js uninstall         - Remove daily schedule');
    console.log('  node src/schedule.js status            - Check schedule status');
    console.log('');
    console.log('Examples:');
    console.log('  node src/schedule.js install 08:30     - Run daily at 8:30 AM');
    console.log('  node src/schedule.js install 14:00     - Run daily at 2:00 PM');
}
