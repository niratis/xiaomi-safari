#!/bin/bash

# Xiaomi Points Collector - Setup Script
# For macOS (Apple Silicon / M4 Mac Mini)
#
# This script:
# 1. Checks prerequisites (Node.js)
# 2. Installs dependencies
# 3. Installs Playwright browsers
# 4. Creates .env config from template
# 5. Optionally sets up daily schedule

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Xiaomi Points Collector - Setup            ║${NC}"
echo -e "${BLUE}║   Automated Mi Points for Xiaomi UK          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_DIR"

# ── Step 1: Check Node.js ──
echo -e "${YELLOW}[1/5] Checking Node.js...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed.${NC}"
    echo ""
    echo "Please install Node.js first. Recommended methods for macOS:"
    echo ""
    echo "  Option 1 (Homebrew):"
    echo "    brew install node"
    echo ""
    echo "  Option 2 (Official installer):"
    echo "    Download from https://nodejs.org/"
    echo ""
    echo "  Option 3 (nvm - Node Version Manager):"
    echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    echo "    nvm install --lts"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js version 18+ is required. Current version: $(node -v)${NC}"
    echo "Please upgrade Node.js."
    exit 1
fi

echo -e "${GREEN}  ✓ Node.js $(node -v) found${NC}"

# ── Step 2: Install npm dependencies ──
echo ""
echo -e "${YELLOW}[2/5] Installing npm dependencies...${NC}"
npm install --production
echo -e "${GREEN}  ✓ Dependencies installed${NC}"

# ── Step 3: Install Playwright browsers ──
echo ""
echo -e "${YELLOW}[3/5] Installing Playwright browser (Chromium)...${NC}"
npx playwright install chromium
echo -e "${GREEN}  ✓ Chromium browser installed${NC}"

# ── Step 4: Create .env configuration ──
echo ""
echo -e "${YELLOW}[4/5] Setting up configuration...${NC}"

if [ -f ".env" ]; then
    echo -e "${GREEN}  ✓ .env file already exists (keeping existing config)${NC}"
else
    cp .env.example .env
    echo -e "${GREEN}  ✓ Created .env from template${NC}"
    echo -e "  ${BLUE}Edit .env to add your credentials (optional - you can also use interactive login)${NC}"
fi

# ── Step 5: Initial login prompt ──
echo ""
echo -e "${YELLOW}[5/5] Setup complete!${NC}"
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Setup completed successfully!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "  1. Log in to your Xiaomi UK account:"
echo -e "     ${YELLOW}npm run login${NC}"
echo ""
echo "  2. Test the points collection:"
echo -e "     ${YELLOW}npm run collect${NC}"
echo ""
echo "  3. Set up daily automatic collection:"
echo -e "     ${YELLOW}npm run schedule:install${NC}"
echo ""
echo "  4. (Optional) Edit .env to customize settings:"
echo -e "     ${YELLOW}nano .env${NC}"
echo ""
echo -e "${BLUE}Available commands:${NC}"
echo "  npm run login       - Interactive browser login"
echo "  npm run collect     - Run all daily tasks"
echo "  npm start           - Same as collect (or login if no session)"
echo "  npm run status      - Check points balance"
echo "  npm run schedule:install    - Set up daily auto-run (default: 9:00 AM)"
echo "  npm run schedule:uninstall  - Remove daily auto-run"
echo ""
