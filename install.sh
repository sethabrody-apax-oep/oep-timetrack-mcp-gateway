#!/bin/bash
# OEP TimeTrack MCP Gateway — Installer for Claude Desktop
# Usage: curl -fsSL https://raw.githubusercontent.com/sethabrody-apax-oep/oep-timetrack-mcp-gateway/main/install.sh | bash

set -e

GATEWAY_URL="https://mcp-gateway-five.vercel.app/mcp"
SERVER_NAME="oep-timetrack"

# Detect OS and config path
if [[ "$OSTYPE" == "darwin"* ]]; then
  CONFIG_DIR="$HOME/Library/Application Support/Claude"
elif [[ "$OSTYPE" == "linux"* ]]; then
  CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/Claude"
elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "cygwin"* ]]; then
  CONFIG_DIR="$APPDATA/Claude"
else
  echo "Unsupported OS. Please add the config manually."
  exit 1
fi

CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required. Install it from https://nodejs.org"
  exit 1
fi

echo "=== OEP TimeTrack MCP Gateway Installer ==="
echo ""
echo "This will add the OEP TimeTrack connector to Claude Desktop."
echo "You'll sign in with your time.apaxapps.com credentials on first use."
echo ""

# Create config dir if needed
mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
  # No config file — create one
  cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "$SERVER_NAME": {
      "command": "npx",
      "args": ["mcp-remote", "$GATEWAY_URL"]
    }
  }
}
EOF
  echo "Created $CONFIG_FILE"
else
  # Config exists — check if entry already present
  if grep -q "$SERVER_NAME" "$CONFIG_FILE" 2>/dev/null; then
    echo "\"$SERVER_NAME\" already exists in your Claude Desktop config."
    echo "No changes made."
    exit 0
  fi

  # Add entry using node (safe JSON manipulation)
  node -e "
    const fs = require('fs');
    const path = '$CONFIG_FILE';
    const config = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers['$SERVER_NAME'] = {
      command: 'npx',
      args: ['mcp-remote', '$GATEWAY_URL']
    };
    fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
  "
  echo "Added \"$SERVER_NAME\" to $CONFIG_FILE"
fi

echo ""
echo "Done! Next steps:"
echo "  1. Restart Claude Desktop"
echo "  2. On first launch, a browser window will open"
echo "  3. Sign in with your time.apaxapps.com email and password"
echo "  4. Enter your MFA code if prompted"
echo "  5. Return to Claude Desktop — the first connection may time out"
echo "  6. Restart Claude Desktop once more — it will connect instantly"
echo ""
echo "After setup, try asking Claude:"
echo '  "Using oep-timetrack tools, show me the team roster"'
