#!/bin/bash

# Booking Service Setup Script

set -e

echo "================================================"
echo "Booking Service - Setup & Start"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
  echo "Error: Please run this script from the shady/ directory"
  exit 1
fi

# Step 1: Check .env file
echo -e "${BLUE}Step 1/5: Checking .env configuration...${NC}"
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}Warning: .env file not found${NC}"
  echo "Please create .env file with required configuration"
  exit 1
fi

# Check for required variables
if ! grep -q "LOGTO_MANAGEMENT_APP_ID" .env || ! grep -q "LOGTO_MANAGEMENT_APP_SECRET" .env; then
  echo -e "${YELLOW}Warning: Logto credentials not configured in .env${NC}"
  echo "Please add LOGTO_MANAGEMENT_APP_ID and LOGTO_MANAGEMENT_APP_SECRET"
  echo ""
fi

echo -e "${GREEN}✓ .env file exists${NC}"
echo ""

# Step 2: Install backend dependencies
echo -e "${BLUE}Step 2/5: Installing backend dependencies...${NC}"
cd backend
if ! command -v bun &> /dev/null; then
  echo "Error: Bun is not installed. Please install from https://bun.sh"
  exit 1
fi

bun install
echo -e "${GREEN}✓ Backend dependencies installed${NC}"
echo ""

# Step 3: Start Postgres
echo -e "${BLUE}Step 3/5: Starting Postgres database...${NC}"
cd ..
docker-compose up -d postgres

echo "Waiting for Postgres to be ready..."
sleep 5

# Check if postgres is running
if docker-compose ps postgres | grep -q "Up"; then
  echo -e "${GREEN}✓ Postgres is running on port 5436${NC}"
else
  echo -e "${YELLOW}Warning: Postgres may not have started properly${NC}"
  echo "Check with: docker-compose logs postgres"
fi
echo ""

# Step 4: Generate & push database schema
echo -e "${BLUE}Step 4/5: Setting up database schema...${NC}"
cd backend

echo "Generating migrations..."
bun run db:generate

echo ""
echo -e "${YELLOW}Review the generated migration in backend/drizzle/${NC}"
read -p "Press Enter to apply the migration (or Ctrl+C to cancel)..."

# Push schema to database
bunx drizzle-kit push

echo -e "${GREEN}✓ Database schema applied${NC}"
echo ""

# Step 5: Start backend server
echo -e "${BLUE}Step 5/5: Starting backend server...${NC}"
echo ""
echo -e "${GREEN}Starting server on http://localhost:5006${NC}"
echo -e "${GREEN}Press Ctrl+C to stop${NC}"
echo ""
echo "================================================"
echo ""

# Start the server
bun run dev
