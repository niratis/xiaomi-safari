# Xiaomi Points Collector

Automated daily Mi Points collector for **Xiaomi UK** (`mi.com/uk`). Runs on your Mac (Apple Silicon / M4 supported) and collects points every day automatically.

## What It Does

- **Daily Fuel Collection** - Clicks the "Collect Fuel" button on the Mi Points Center (2-10 Mi Points/day)
- **7-Day Streak Bonus** - Maintains your consecutive collection streak (50-100 bonus Mi Points)
- **Page Browsing Tasks** - Browses required pages for 15+ seconds to earn additional points
- **Store Browsing** - Visits store sections to complete browsing-based tasks
- **macOS Scheduling** - Runs automatically every day via `launchd` (macOS native scheduler)
- **Session Persistence** - Saves your login session so you only need to log in once
- **Desktop Notifications** - Get notified when points are collected (macOS)

## Points Breakdown

| Task | Points | Frequency |
|------|--------|-----------|
| Collect Fuel | 2-10 Mi Points | Daily |
| 7-day streak bonus | 50-100 Mi Points | Weekly |
| Browse pages | 10 Mi Points each | Daily (limited) |
| Watch video | 10 Mi Points | Monthly |
| Share links | Mi Points | Up to 6x/month |

**100 Mi Points = £1** (can offset up to 20% of order total)

## Prerequisites

- **macOS** on Apple Silicon (M1/M2/M3/M4) or Intel Mac
- **Node.js 18+** ([install via Homebrew](https://formulae.brew.sh/formula/node): `brew install node`)
- A **Xiaomi account** registered on [mi.com/uk](https://www.mi.com/uk)

## Quick Start

### 1. Clone and Set Up

```bash
git clone <this-repo>
cd xiaomi-safari
bash scripts/setup.sh
```

The setup script will:
- Check Node.js is installed
- Install npm dependencies
- Download the Chromium browser for automation
- Create the `.env` configuration file

### 2. Log In to Your Xiaomi Account

```bash
npm run login
```

A browser window will open. Log in to your Xiaomi UK account as you normally would. Once logged in, the session is saved automatically and the browser closes.

> **Note:** You only need to do this once. The session persists between runs. If it expires, you'll be prompted to log in again.

### 3. Test Point Collection

```bash
npm run collect
```

This runs all daily tasks: fuel collection, page browsing, and store browsing.

### 4. Set Up Daily Auto-Collection

```bash
# Run daily at 9:00 AM (default)
npm run schedule:install

# Or specify a custom time
node src/schedule.js install 08:30
```

The schedule uses macOS `launchd`, so it runs even if Terminal is closed (as long as your Mac is on).

## Commands

| Command | Description |
|---------|-------------|
| `npm run login` | Interactive browser login |
| `npm run collect` | Run all daily point tasks |
| `npm run fuel` | Collect fuel only (skip browsing) |
| `npm run status` | Check current points balance |
| `npm start` | Auto: collect if logged in, else login first |
| `npm run schedule:install` | Install daily auto-run schedule |
| `npm run schedule:uninstall` | Remove daily auto-run |

You can also use the CLI directly:

```bash
node src/index.js login
node src/index.js collect
node src/index.js fuel
node src/index.js status
node src/index.js logout
```

## Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `XIAOMI_EMAIL` | (empty) | Your Xiaomi account email (optional) |
| `XIAOMI_PASSWORD` | (empty) | Your Xiaomi account password (optional) |
| `XIAOMI_REGION` | `uk` | Region: uk, de, fr, es, it, nl |
| `HEADLESS` | `true` | Run browser invisibly |
| `PAGE_TIMEOUT` | `30000` | Page load timeout (ms) |
| `LOG_LEVEL` | `info` | Logging: debug, info, warn, error |
| `NOTIFICATIONS` | `true` | macOS desktop notifications |

> **Credentials are optional.** The recommended approach is interactive login (`npm run login`), which saves your session cookies. Credentials in `.env` are only used as a fallback for automated re-login if the session expires.

## How It Works

1. **Authentication**: Uses [Playwright](https://playwright.dev/) to automate a real Chromium browser. On first run, you log in manually in a visible browser window. Cookies and session data are saved locally in `session-data/`.

2. **Point Collection**: The browser navigates to the [Xiaomi UK Points Center](https://ams.buy.mi.com/uk/user/points-center), finds the fuel collection button, and clicks it. It also completes browsing tasks by visiting required pages.

3. **Scheduling**: A macOS `LaunchAgent` plist is installed in `~/Library/LaunchAgents/` that triggers the collector daily at your chosen time.

4. **Logging**: All activity is logged to `logs/points-YYYY-MM-DD.log` with screenshots saved for debugging.

## File Structure

```
xiaomi-safari/
├── src/
│   ├── index.js        # CLI entry point & command router
│   ├── auth.js         # Login & session management
│   ├── points.js       # Points collection logic
│   ├── config.js       # Configuration loader
│   ├── logger.js       # File + console logging
│   ├── notify.js       # macOS notifications
│   └── schedule.js     # launchd scheduler management
├── scripts/
│   └── setup.sh        # One-command setup script
├── session-data/       # Saved browser session (gitignored)
├── logs/               # Daily logs + screenshots (gitignored)
├── .env                # Your config (gitignored)
├── .env.example        # Config template
├── package.json
└── README.md
```

## Supported Regions

While built primarily for Xiaomi UK, the tool supports all European Mi Points regions:

- UK (`uk`) - mi.com/uk
- Germany (`de`) - mi.com/de
- France (`fr`) - mi.com/fr
- Spain (`es`) - mi.com/es
- Italy (`it`) - mi.com/it
- Netherlands (`nl`) - mi.com/nl

Set the region in `.env`:
```
XIAOMI_REGION=uk
```

## Troubleshooting

### "Session expired" error
Run `npm run login` to log in again.

### "Fuel button not found" error
The Xiaomi website structure may have changed. Check the screenshot in `logs/` to see the current page layout. Open an issue with the screenshot attached.

### Schedule not running
```bash
# Check schedule status
node src/schedule.js status

# Manually trigger a run
launchctl start com.xiaomi.points-collector

# Check logs
cat logs/launchd-stdout.log
cat logs/launchd-stderr.log
```

### Browser not launching
Make sure Playwright's Chromium is installed:
```bash
npx playwright install chromium
```

### Want to see the browser while it runs
Set `HEADLESS=false` in `.env` to watch the automation in a visible browser window.

## Security Notes

- **Credentials** are stored locally in `.env` (gitignored, never committed)
- **Session data** is stored locally in `session-data/` (gitignored)
- The tool runs a real browser on your machine - no data is sent to any third-party service
- All automation happens locally between your Mac and mi.com
- The interactive login method (recommended) means your password doesn't need to be stored at all

## License

MIT
