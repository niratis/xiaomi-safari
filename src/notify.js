import { execSync } from 'child_process';
import { platform } from 'os';
import config from './config.js';
import logger from './logger.js';

/**
 * Send a macOS desktop notification using osascript.
 * Falls back silently on other platforms.
 */
export function notify(title, message) {
  if (!config.notifications) return;

  if (platform() !== 'darwin') {
    logger.debug('Notifications only supported on macOS.');
    return;
  }

  try {
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedMessage = message.replace(/"/g, '\\"');
    execSync(
      `osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}"'`,
      { timeout: 5000 },
    );
    logger.debug(`Notification sent: ${title}`);
  } catch {
    logger.debug('Failed to send notification (this is non-critical).');
  }
}
