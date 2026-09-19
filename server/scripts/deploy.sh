#!/bin/bash
set -e

# Configuration
REMOTE_HOST="patf.com"
REMOTE_USER="pfarrell"
REMOTE_PORT="10022"
DEPLOY_BASE="/var/www/bemused-node"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
RELEASE_DIR="${DEPLOY_BASE}/releases/${TIMESTAMP}"
SHARED_DIR="${DEPLOY_BASE}/shared"
CURRENT_DIR="${DEPLOY_BASE}/current"

echo "🚀 Deploying Bemused Node.js API..."

# Build locally
echo "📦 Building TypeScript..."
./node_modules/.bin/tsc
node ~/.claude/skills/check-deploy/stamp-version.cjs dist/version.json

# Create directory structure on remote
echo "📁 Creating remote directories..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${RELEASE_DIR} ${SHARED_DIR}/public/images/artists ${SHARED_DIR}/public/images/albums"

# Upload built code and dependencies
echo "📤 Uploading server code..."
rsync -avz --delete \
  -e "ssh -p ${REMOTE_PORT}" \
  --exclude 'node_modules' \
  --exclude '.env' \
  dist src package.json package-lock.json migrations scripts \
  ${REMOTE_USER}@${REMOTE_HOST}:${RELEASE_DIR}/

# Install production dependencies on remote
echo "📚 Installing production dependencies on remote..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "cd ${RELEASE_DIR} && npm ci --omit=dev"

# Run database migrations
echo "🔄 Running database migrations..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "cd ${RELEASE_DIR} && export \$(cat ${SHARED_DIR}/.env | xargs) && node scripts/run-migrations.js"

# Create symlink for public/images to shared directory
echo "🔗 Linking public/images to shared directory..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "rm -rf ${RELEASE_DIR}/public && mkdir -p ${RELEASE_DIR}/public && ln -nfs ${SHARED_DIR}/public/images ${RELEASE_DIR}/public/images"

# Check if shared .env exists, warn if not
echo "⚙️  Checking for production .env..."
if ! ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "test -f ${SHARED_DIR}/.env"; then
  echo "⚠️  WARNING: ${SHARED_DIR}/.env does not exist!"
  echo "   You need to create it with production database credentials."
  echo "   Example content:"
  echo "   BEMUSED_DB=postgres://user:password@localhost:5432/bemused"
  echo "   PORT=3000"
  echo "   BEMUSED_PATH=https://patf.com/pshare"
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Link shared .env into release
echo "🔗 Linking shared .env..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "ln -nfs ${SHARED_DIR}/.env ${RELEASE_DIR}/.env"

# Update symlink to new release
echo "🔗 Updating current symlink..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "ln -nfs ${RELEASE_DIR} ${CURRENT_DIR}"

# Restart the API service
echo ""
echo "🔄 Restarting bemused-api service..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "sudo systemctl restart bemused-api"
echo "✅ Service restarted"
echo ""

# Restart the upload queue worker
# It's a long-running process pinned to whatever release was `current` when it
# started (Node resolves the `current` symlink once at startup, not per-require).
# Without this, old release directories it still depends on eventually get
# pruned by the cleanup step below, breaking any lazily-required module.
echo "🔄 Restarting bemused-queue-worker service..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "sudo systemctl restart bemused-queue-worker"
echo "✅ Worker restarted"
echo ""

# Clean up old releases (keep last 5)
echo "🧹 Cleaning up old releases..."
ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "cd ${DEPLOY_BASE}/releases && ls -t | tail -n +6 | xargs -r rm -rf"

echo ""
echo "✨ Deployment complete!"
echo "   Release: ${TIMESTAMP}"
echo "   API should be available at: https://patf.com/pshare/api"
echo ""
echo "💡 To view logs: ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} 'sudo journalctl -u bemused-api -f'"
