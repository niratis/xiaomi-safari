import logger from './logger.js';
import config from './config.js';

/**
 * Points collection module for Xiaomi UK Mi Points.
 *
 * Handles:
 * - Daily fuel collection (main daily task)
 * - Page browsing tasks
 * - Status checking
 */

// Common selectors used across the points center page.
// Xiaomi's frontend uses various class naming patterns, so we try multiple selectors.
const SELECTORS = {
  // Fuel / check-in button variants
  fuelButton: [
    'button:has-text("Collect")',
    'button:has-text("collect")',
    'button:has-text("Check in")',
    'button:has-text("Sign in")',
    'button:has-text("Fuel")',
    '[class*="fuel"] button',
    '[class*="check-in"] button',
    '[class*="sign-in"] button',
    '[class*="checkin"] button',
    '[class*="signin"] button',
    '[class*="collect-btn"]',
    '[class*="fuel-btn"]',
    '[class*="fuel-collect"]',
    '[class*="fuel-button"]',
    '[class*="sign-btn"]',
    '[data-action="collect"]',
    '[data-action="checkin"]',
    '.task-btn:has-text("Collect")',
    '.task-btn:has-text("GO")',
  ],

  // Points balance display
  pointsBalance: [
    '[class*="points-num"]',
    '[class*="point-num"]',
    '[class*="balance"]',
    '[class*="total-points"]',
    '[class*="my-points"] [class*="num"]',
    '[class*="points-value"]',
  ],

  // Fuel streak / consecutive days
  fuelStreak: [
    '[class*="continuous"]',
    '[class*="consecutive"]',
    '[class*="streak"]',
    '[class*="fuel-day"]',
    '[class*="check-day"]',
  ],

  // "Already collected" indicators
  alreadyCollected: [
    'text=Collected',
    'text=collected',
    'text=Signed',
    'text=signed',
    'text=Checked',
    'text=checked',
    '[class*="collected"]',
    '[class*="checked"]',
    '[class*="signed"]',
    '[class*="completed"]',
    '[class*="done"]',
  ],

  // Task list items
  taskItems: [
    '[class*="task-item"]',
    '[class*="task-list"] > *',
    '[class*="mission-item"]',
    '[class*="daily-task"] > *',
  ],

  // "GO" buttons for individual tasks
  taskGoButton: [
    'button:has-text("GO")',
    'button:has-text("Go")',
    'button:has-text("go")',
    'a:has-text("GO")',
    '[class*="go-btn"]',
    '[class*="task-go"]',
  ],
};

/**
 * Try to find an element using multiple selector strategies.
 * Returns the first match or null.
 */
async function findElement(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible().catch(() => true);
        if (visible) {
          logger.debug(`Found element with selector: ${sel}`);
          return el;
        }
      }
    } catch {
      // selector didn't match
    }
  }
  return null;
}

/**
 * Try to find all elements matching any of the selectors.
 */
async function findElements(page, selectors) {
  const results = [];
  for (const sel of selectors) {
    try {
      const els = await page.$$(sel);
      if (els.length > 0) {
        results.push(...els);
        logger.debug(`Found ${els.length} elements with selector: ${sel}`);
      }
    } catch {
      // continue
    }
  }
  return results;
}

/**
 * Get the text content of the first matching element.
 */
async function getElementText(page, selectors) {
  const el = await findElement(page, selectors);
  if (el) {
    return (await el.textContent())?.trim() || null;
  }
  return null;
}

/**
 * Navigate to the Points Center page and wait for it to load.
 */
async function navigateToPointsCenter(page) {
  logger.info('Navigating to Points Center...');

  await page.goto(config.urls.pointsCenter, {
    waitUntil: 'domcontentloaded',
    timeout: config.pageTimeout,
  });

  // Wait for dynamic content to render
  await page.waitForTimeout(3000);

  const url = page.url();
  logger.debug(`Points Center URL: ${url}`);

  if (url.includes('account.xiaomi.com') || url.includes('serviceLogin')) {
    logger.error('Not logged in - redirected to login page.');
    return false;
  }

  return true;
}

/**
 * Try to read the current points balance from the page.
 */
export async function getPointsBalance(page) {
  const text = await getElementText(page, SELECTORS.pointsBalance);
  if (text) {
    const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) {
      logger.info(`Current points balance: ${num} Mi Points`);
      return num;
    }
  }
  logger.debug('Could not read points balance from page.');
  return null;
}

/**
 * Check if fuel has already been collected today.
 */
async function isFuelAlreadyCollected(page) {
  const el = await findElement(page, SELECTORS.alreadyCollected);
  return el !== null;
}

/**
 * Collect daily fuel points.
 * This is the main daily task - clicking the fuel/check-in button.
 */
export async function collectFuel(page) {
  logger.separator();
  logger.info('DAILY FUEL COLLECTION');
  logger.separator();

  const navigated = await navigateToPointsCenter(page);
  if (!navigated) return { success: false, reason: 'Not authenticated' };

  // Take a screenshot for debugging
  try {
    await page.screenshot({
      path: `${config.logsDir}/points-center-${new Date().toISOString().split('T')[0]}.png`,
      fullPage: true,
    });
    logger.debug('Saved screenshot of Points Center page.');
  } catch {
    // Non-critical
  }

  // Check if already collected
  const alreadyDone = await isFuelAlreadyCollected(page);
  if (alreadyDone) {
    logger.info('Fuel already collected today!');
    const balance = await getPointsBalance(page);
    return { success: true, alreadyCollected: true, balance };
  }

  // Try to find and click the fuel collection button
  const fuelBtn = await findElement(page, SELECTORS.fuelButton);
  if (!fuelBtn) {
    // Maybe the page uses a different structure. Try clicking any prominent button.
    logger.warn('Could not find fuel button with known selectors.');
    logger.info('Attempting to find any clickable collection element...');

    // Try a broader search - look for any button-like element with collection text
    const broadSelectors = [
      'button',
      '[role="button"]',
      '.btn',
      'a.button',
    ];

    for (const sel of broadSelectors) {
      try {
        const buttons = await page.$$(sel);
        for (const btn of buttons) {
          const text = (await btn.textContent())?.toLowerCase() || '';
          if (
            text.includes('collect') ||
            text.includes('fuel') ||
            text.includes('check') ||
            text.includes('sign')
          ) {
            logger.info(`Found potential collection button: "${text.trim()}"`);
            await btn.click();
            await page.waitForTimeout(2000);
            logger.success('Clicked potential fuel button.');
            const balance = await getPointsBalance(page);
            return { success: true, alreadyCollected: false, balance };
          }
        }
      } catch {
        // continue
      }
    }

    logger.error('Could not find any fuel collection button.');
    logger.info('The page structure may have changed. Check the screenshot in the logs directory.');
    return { success: false, reason: 'Fuel button not found' };
  }

  // Click the fuel button
  try {
    logger.info('Clicking fuel collection button...');
    await fuelBtn.click();
    await page.waitForTimeout(3000);

    // Check for success indicators
    const collected = await isFuelAlreadyCollected(page);
    if (collected) {
      logger.success('Fuel collected successfully!');
    } else {
      logger.success('Fuel button clicked. Collection may have succeeded.');
    }

    // Try to read streak info
    const streak = await getElementText(page, SELECTORS.fuelStreak);
    if (streak) {
      logger.info(`Fuel streak: ${streak}`);
    }

    const balance = await getPointsBalance(page);
    return { success: true, alreadyCollected: false, balance, streak };
  } catch (err) {
    logger.error('Error clicking fuel button:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Attempt to complete browsing tasks.
 * Some daily tasks require browsing specific pages for 15+ seconds.
 */
export async function completeBrowsingTasks(page) {
  logger.separator();
  logger.info('BROWSING TASKS');
  logger.separator();

  const navigated = await navigateToPointsCenter(page);
  if (!navigated) return { completed: 0, total: 0 };

  let completed = 0;
  let total = 0;

  // Look for task items with "GO" buttons
  const taskItems = await findElements(page, SELECTORS.taskItems);
  logger.info(`Found ${taskItems.length} task items on the page.`);

  if (taskItems.length === 0) {
    // Try to find GO buttons directly
    const goButtons = await findElements(page, SELECTORS.taskGoButton);
    logger.info(`Found ${goButtons.length} GO buttons.`);

    for (const btn of goButtons) {
      try {
        total++;
        const text = (await btn.textContent())?.trim() || 'GO';
        logger.info(`Clicking task button: "${text}"...`);

        // Some GO buttons open new pages/tabs
        const [newPage] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
          btn.click(),
        ]);

        if (newPage) {
          // A new tab/page opened - browse it for the required time
          logger.info('New page opened. Browsing for 20 seconds...');
          await newPage.waitForLoadState('domcontentloaded').catch(() => {});
          await newPage.waitForTimeout(20000); // Browse for 20 seconds (requirement is 15s)
          await newPage.close();
          completed++;
          logger.success('Browsing task completed.');
        } else {
          // Button might navigate within the same page or show a modal
          await page.waitForTimeout(20000);
          completed++;
          logger.success('Task interaction completed.');
          // Go back to points center
          await page.goto(config.urls.pointsCenter, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
        }
      } catch (err) {
        logger.warn(`Error with task button: ${err.message}`);
      }
    }
  } else {
    // Process each task item
    for (const item of taskItems) {
      try {
        const itemText = (await item.textContent())?.toLowerCase() || '';

        // Skip already completed tasks
        if (itemText.includes('completed') || itemText.includes('done') || itemText.includes('collected')) {
          logger.debug(`Task already completed: ${itemText.substring(0, 50)}...`);
          continue;
        }

        total++;

        // Check if this is a browsing task
        if (itemText.includes('browse') || itemText.includes('visit') || itemText.includes('view')) {
          // Find the GO button within this task item
          const goBtn = await item.$('button, a[class*="go"], [class*="btn"]');
          if (goBtn) {
            logger.info('Found browsing task. Clicking GO...');

            const [newPage] = await Promise.all([
              page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
              goBtn.click(),
            ]);

            if (newPage) {
              logger.info('Browsing page for 20 seconds...');
              await newPage.waitForLoadState('domcontentloaded').catch(() => {});
              await newPage.waitForTimeout(20000);
              await newPage.close();
              completed++;
              logger.success('Browsing task completed.');
            } else {
              await page.waitForTimeout(20000);
              completed++;
              // Navigate back
              await page.goto(config.urls.pointsCenter, { waitUntil: 'domcontentloaded' });
              await page.waitForTimeout(2000);
            }
          }
        }
      } catch (err) {
        logger.warn(`Error processing task item: ${err.message}`);
      }
    }
  }

  logger.info(`Browsing tasks: ${completed}/${total} completed.`);
  return { completed, total };
}

/**
 * Browse specific store pages to potentially earn points.
 * Some point programs reward browsing product pages.
 */
export async function browseStorePages(page) {
  logger.separator();
  logger.info('STORE PAGE BROWSING');
  logger.separator();

  const pagesToBrowse = [
    { name: 'Store Home', url: config.urls.storeHome },
    { name: 'Smartphones', url: `${config.urls.store}/phone/` },
    { name: 'Smart Home', url: `${config.urls.store}/smart-home/` },
    { name: 'Accessories', url: `${config.urls.store}/accessories/` },
  ];

  let browsed = 0;

  for (const pg of pagesToBrowse) {
    try {
      logger.info(`Browsing: ${pg.name} (${pg.url})`);
      await page.goto(pg.url, { waitUntil: 'domcontentloaded', timeout: config.pageTimeout });
      // Scroll down to simulate real browsing
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight / 2);
      });
      await page.waitForTimeout(5000);
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await page.waitForTimeout(12000); // Total ~17 seconds per page (above 15s requirement)
      browsed++;
      logger.debug(`Browsed ${pg.name} for required duration.`);
    } catch (err) {
      logger.warn(`Failed to browse ${pg.name}: ${err.message}`);
    }
  }

  logger.info(`Browsed ${browsed}/${pagesToBrowse.length} store pages.`);
  return browsed;
}

/**
 * Get a summary of today's points activity.
 */
export async function getStatus(page) {
  const navigated = await navigateToPointsCenter(page);
  if (!navigated) return null;

  const balance = await getPointsBalance(page);
  const streak = await getElementText(page, SELECTORS.fuelStreak);
  const alreadyCollected = await isFuelAlreadyCollected(page);

  // Try to take a screenshot of the current state
  try {
    await page.screenshot({
      path: `${config.logsDir}/status-${new Date().toISOString().split('T')[0]}.png`,
      fullPage: true,
    });
  } catch {
    // Non-critical
  }

  // Try to get page content for analysis
  let pageText = '';
  try {
    pageText = await page.evaluate(() => document.body?.innerText || '');
  } catch {
    // Non-critical
  }

  return {
    balance,
    streak,
    fuelCollectedToday: alreadyCollected,
    url: page.url(),
    pageText: pageText.substring(0, 2000), // First 2000 chars for debugging
  };
}

/**
 * Run all daily collection tasks.
 */
export async function runAllDailyTasks(page) {
  const results = {
    fuel: null,
    browsingTasks: null,
    storeBrowsing: null,
    finalBalance: null,
  };

  // 1. Collect daily fuel
  results.fuel = await collectFuel(page);

  // 2. Complete browsing tasks from points center
  results.browsingTasks = await completeBrowsingTasks(page);

  // 3. Browse store pages
  results.storeBrowsing = await browseStorePages(page);

  // 4. Go back to points center to check final balance
  await navigateToPointsCenter(page);
  results.finalBalance = await getPointsBalance(page);

  // Summary
  logger.separator();
  logger.info('DAILY SUMMARY');
  logger.separator();
  logger.info(`Fuel collection: ${results.fuel?.success ? 'OK' : 'FAILED'}${results.fuel?.alreadyCollected ? ' (already done)' : ''}`);
  logger.info(`Browsing tasks: ${results.browsingTasks?.completed || 0} completed`);
  logger.info(`Store pages browsed: ${results.storeBrowsing || 0}`);
  if (results.finalBalance !== null) {
    logger.info(`Current points balance: ${results.finalBalance} Mi Points`);
  }
  logger.separator();

  return results;
}
