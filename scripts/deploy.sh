#!/bin/bash
set -e

# Configuration
REMOTE_HOST="patf.com"
REMOTE_USER="pfarrell"
REMOTE_PORT="10022"
SHARED_PUBLIC_DIR="/var/www/bemused/shared/public/frontend"
BUILD_DIR="dist"

echo "Building frontend for production..."
NODE_ENV=production npm run build
node ~/.claude/skills/check-deploy/stamp-version.cjs ${BUILD_DIR}/version.json

echo "Creating remote directory if it doesn't exist..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${SHARED_PUBLIC_DIR}"

echo "Deploying to shared public folder..."
rsync -avz --delete \
  -e "ssh -p ${REMOTE_PORT}" \
  --exclude 'images/' \
  ${BUILD_DIR}/ \
  ${REMOTE_USER}@${REMOTE_HOST}:${SHARED_PUBLIC_DIR}/

echo "Frontend deployment complete!"
echo "Frontend should be available at: https://patf.com/pshare/app"
