import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import config from './config.js';
import logger from './logger.js';

/**
 * Manages browser sessions and authentication for mi.com.
 *
 * Strategy:
 * 1. First run: Opens a visible browser for the user to log in manually.
 *    Saves the browser session (cookies, localStorage) to disk.
 * 2. Subsequent runs: Loads saved session and runs headless.
 *    If the session has expired, falls back to interactive login.
 */

const SESSION_CHECK_URL = config.urls.pointsCenter;
const LOGIN_SUCCESS_INDICATORS = [
  '[class*="user-info"]',
  '[class*="UserInfo"]',
  '[class*="points-center"]',
  '[class*="my-points"]',
  '[class*="fuel"]',
  '[class*="sign-in"]',
  '[class*="check-in"]',
  'text=Mi Points',
  'text=My Points',
];

const NOT_LOGGED_IN_INDICATORS = [
  'text=Sign in',
  'text=Log in',
  'text=Register',
  '[class*="login-btn"]',
];

/**
 * Check if a saved session exists on disk.
 */
export function hasSession() {
  return existsSync(config.sessionFile);
}

/**
 * Clear the saved session.
 */
export function clearSession() {
  if (existsSync(config.sessionFile)) {
    unlinkSync(config.sessionFile);
    logger.info('Session cleared.');
  }
}

/**
 * Launch a browser with optional saved state.
 * Returns { browser, context, page }.
 */
export async function launchBrowser({ headed = false, loadSession = true } = {}) {
  const headless = headed ? false : config.headless;

  const launchOptions = {
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  };

  logger.debug(`Launching browser (headless: ${headless})`);

  const browser = await chromium.launch(launchOptions);

  const contextOptions = {
    userAgent: config.userAgent,
    viewport: { width: 1440, height: 900 },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  };

  // Load saved session if available
  if (loadSession && hasSession()) {
    try {
      const stateData = JSON.parse(readFileSync(config.sessionFile, 'utf-8'));
      contextOptions.storageState = stateData;
      logger.debug('Loaded saved session state.');
    } catch (err) {
      logger.warn('Failed to load saved session, starting fresh:', err.message);
    }
  }

  const context = await browser.newContext(contextOptions);

  // Mask automation detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // Remove Playwright-specific properties
    delete window.__playwright;
    delete window.__pw_manual;
  });

  const page = await context.newPage();
  page.setDefaultTimeout(config.pageTimeout);

  return { browser, context, page };
}

/**
 * Save the current browser session (cookies + storage) to disk.
 */
export async function saveSession(context) {
  try {
    const state = await context.storageState();
    writeFileSync(config.sessionFile, JSON.stringify(state, null, 2));
    logger.info('Session saved to disk.');
  } catch (err) {
    logger.error('Failed to save session:', err.message);
  }
}

/**
 * Check if the current session is authenticated by navigating
 * to the points center and checking for logged-in indicators.
 */
export async function isAuthenticated(page) {
  try {
    logger.debug('Checking authentication status...');

    await page.goto(SESSION_CHECK_URL, { waitUntil: 'domcontentloaded', timeout: config.pageTimeout });

    // Wait a bit for JS to render
    await page.waitForTimeout(3000);

    const url = page.url();
    logger.debug(`Current URL after navigation: ${url}`);

    // If we got redirected to a login page, we're not authenticated
    if (url.includes('account.xiaomi.com') || url.includes('passport') || url.includes('serviceLogin')) {
      logger.debug('Redirected to login page - not authenticated.');
      return false;
    }

    // Check for logged-in page content
    for (const selector of LOGIN_SUCCESS_INDICATORS) {
      try {
        const el = await page.$(selector);
        if (el) {
          logger.debug(`Found logged-in indicator: ${selector}`);
          return true;
        }
      } catch {
        // selector didn't match, continue
      }
    }

    // Check for NOT logged in indicators
    for (const selector of NOT_LOGGED_IN_INDICATORS) {
      try {
        const el = await page.$(selector);
        if (el) {
          logger.debug(`Found not-logged-in indicator: ${selector}`);
          return false;
        }
      } catch {
        // continue
      }
    }

    // If we stayed on the points center URL (or a related page) without redirect,
    // assume we're logged in
    if (url.includes('points-center') || url.includes('ams.buy.mi.com')) {
      logger.debug('On points center page - assuming authenticated.');
      return true;
    }

    logger.debug('Could not determine auth status, assuming not authenticated.');
    return false;
  } catch (err) {
    logger.error('Error checking authentication:', err.message);
    return false;
  }
}

/**
 * Interactive login: Opens a visible browser window for the user to log in manually.
 * Waits for the user to complete login, then saves the session.
 */
export async function interactiveLogin() {
  logger.separator();
  logger.info('INTERACTIVE LOGIN MODE');
  logger.info('A browser window will open. Please log in to your Xiaomi UK account.');
  logger.info('After logging in, the session will be saved automatically.');
  logger.separator();

  const { browser, context, page } = await launchBrowser({ headed: true, loadSession: false });

  try {
    // Navigate to the points center - it will redirect to login if needed
    await page.goto(config.urls.pointsCenter, { waitUntil: 'domcontentloaded' });

    logger.info('Waiting for you to complete login...');
    logger.info('(The browser will close automatically once login is detected)');

    // Wait for the user to complete login - poll every 3 seconds for up to 5 minutes
    const maxWait = 5 * 60 * 1000; // 5 minutes
    const pollInterval = 3000;
    const startTime = Date.now();
    let authenticated = false;

    while (Date.now() - startTime < maxWait) {
      await page.waitForTimeout(pollInterval);

      const url = page.url();
      // Check if we're back on a mi.com page (not login page)
      if (
        (url.includes('mi.com') || url.includes('ams.buy.mi.com')) &&
        !url.includes('account.xiaomi.com') &&
        !url.includes('passport') &&
        !url.includes('serviceLogin')
      ) {
        // Give the page a moment to fully load
        await page.waitForTimeout(2000);
        authenticated = true;
        break;
      }
    }

    if (authenticated) {
      // Navigate to points center to make sure we have the right cookies
      await page.goto(config.urls.pointsCenter, { waitUntil: 'networkidle', timeout: config.pageTimeout });
      await page.waitForTimeout(2000);

      await saveSession(context);
      logger.success('Login successful! Session saved.');
      logger.info('Future runs will use the saved session automatically.');
    } else {
      logger.error('Login timed out after 5 minutes. Please try again.');
    }

    return authenticated;
  } finally {
    await browser.close();
  }
}

/**
 * Attempt automated login using saved credentials from .env.
 * This is a fallback when the session expires and interactive login isn't possible.
 */
export async function automatedLogin(page) {
  if (!config.email || !config.password) {
    logger.warn('No credentials in .env file. Cannot attempt automated login.');
    return false;
  }

  logger.info('Attempting automated login with saved credentials...');

  try {
    // Navigate to the Xiaomi login page
    await page.goto('https://account.xiaomi.com/pass/serviceLogin?sid=milogin&_locale=en', {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForTimeout(2000);

    // Try to find and fill the email/phone field
    const emailSelectors = [
      'input[type="email"]',
      'input[type="tel"]',
      'input[name="user"]',
      'input[name="account"]',
      'input[placeholder*="email"]',
      'input[placeholder*="phone"]',
      '#username',
      'input.input-text',
    ];

    let emailField = null;
    for (const sel of emailSelectors) {
      emailField = await page.$(sel);
      if (emailField) break;
    }

    if (!emailField) {
      logger.warn('Could not find email input field. Login page structure may have changed.');
      return false;
    }

    await emailField.click();
    await emailField.fill(config.email);

    // Find and fill password
    const passSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      '#password',
    ];

    let passField = null;
    for (const sel of passSelectors) {
      passField = await page.$(sel);
      if (passField) break;
    }

    if (!passField) {
      // Might need to click "next" first (some login flows are multi-step)
      const nextBtn = await page.$('button[type="submit"], input[type="submit"], .next-btn, .submit-btn');
      if (nextBtn) {
        await nextBtn.click();
        await page.waitForTimeout(2000);
        for (const sel of passSelectors) {
          passField = await page.$(sel);
          if (passField) break;
        }
      }
    }

    if (!passField) {
      logger.warn('Could not find password input field.');
      return false;
    }

    await passField.click();
    await passField.fill(config.password);

    // Submit the form
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '.submit-btn',
      '#login-button',
      'button.primary',
    ];

    let submitBtn = null;
    for (const sel of submitSelectors) {
      submitBtn = await page.$(sel);
      if (submitBtn) break;
    }

    if (submitBtn) {
      await submitBtn.click();
    } else {
      await passField.press('Enter');
    }

    // Wait for redirect after login
    await page.waitForTimeout(5000);

    const url = page.url();
    if (url.includes('account.xiaomi.com') || url.includes('passport')) {
      logger.warn('Automated login may have failed (still on login page).');
      logger.warn('This could be due to CAPTCHA or 2FA. Please use interactive login: npm run login');
      return false;
    }

    logger.success('Automated login appears successful.');
    return true;
  } catch (err) {
    logger.error('Automated login failed:', err.message);
    return false;
  }
}

/**
 * Ensure we have an authenticated session.
 * Tries saved session first, then automated login, then prompts for interactive login.
 * Returns { browser, context, page } if successful, or null.
 */
export async function ensureAuthenticated() {
  // First try: load saved session
  if (hasSession()) {
    logger.info('Found saved session, verifying...');
    const { browser, context, page } = await launchBrowser({ loadSession: true });

    const authed = await isAuthenticated(page);
    if (authed) {
      logger.success('Session is valid.');
      // Refresh the saved session
      await saveSession(context);
      return { browser, context, page };
    }

    logger.warn('Saved session has expired.');
    await browser.close();
  }

  // Second try: automated login
  if (config.email && config.password) {
    logger.info('Attempting automated login...');
    const { browser, context, page } = await launchBrowser({ loadSession: false });

    const success = await automatedLogin(page);
    if (success) {
      // Navigate to points center and save session
      await page.goto(config.urls.pointsCenter, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await saveSession(context);
      return { browser, context, page };
    }

    await browser.close();
  }

  // Final fallback: tell user to run interactive login
  logger.error('No valid session found. Please run interactive login first:');
  logger.error('  npm run login');
  logger.error('  (or: node src/index.js --login)');
  return null;
}
