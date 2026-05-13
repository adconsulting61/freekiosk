#!/bin/bash
# FreeKiosk Relay Server - Linux/Mac Installer
# Ubuntu/Debian VPS:  sudo bash install-linux.sh
# macOS:              bash install-linux.sh

set -e

INSTALL_DIR="/opt/freekiosk-relay"
SERVICE_NAME="freekiosk-relay"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "================================================"
echo "  FreeKiosk Relay Server - Installer"
echo "================================================"
echo ""

# ── Detect OS ────────────────────────────────────────────────────────────
IS_MAC=false
IS_LINUX=false
if [[ "$OSTYPE" == "darwin"* ]]; then
    IS_MAC=true
    INSTALL_DIR="$HOME/freekiosk-relay"
elif [[ -f /etc/debian_version ]] || [[ -f /etc/ubuntu_release ]]; then
    IS_LINUX=true
else
    echo "Detected Linux. Proceeding..."
    IS_LINUX=true
fi

# ── Install Node.js if missing ────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    if $IS_MAC; then
        if command -v brew &>/dev/null; then
            echo "Installing Node.js via Homebrew..."
            brew install node
        else
            echo "ERROR: Install Homebrew first: https://brew.sh"
            exit 1
        fi
    else
        echo "Installing Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
else
    echo "Node.js already installed: $(node --version)"
fi

# ── Install pm2 ───────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
    echo "Installing pm2..."
    sudo npm install -g pm2
else
    echo "pm2 already installed: $(pm2 --version)"
fi

# ── Copy server files ─────────────────────────────────────────────────────
echo "Installing to $INSTALL_DIR..."
if $IS_LINUX; then sudo mkdir -p "$INSTALL_DIR"; else mkdir -p "$INSTALL_DIR"; fi

for f in server.js package.json; do
    if $IS_LINUX; then sudo cp "$SCRIPT_DIR/$f" "$INSTALL_DIR/"; else cp "$SCRIPT_DIR/$f" "$INSTALL_DIR/"; fi
done
if [ -d "$SCRIPT_DIR/public" ]; then
    if $IS_LINUX; then sudo cp -r "$SCRIPT_DIR/public" "$INSTALL_DIR/"; else cp -r "$SCRIPT_DIR/public" "$INSTALL_DIR/"; fi
fi

if $IS_LINUX; then sudo chown -R "$USER:$USER" "$INSTALL_DIR"; fi

# ── Install npm dependencies ──────────────────────────────────────────────
cd "$INSTALL_DIR"
npm install --omit=dev

# ── Generate .env if not exists ───────────────────────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    SECRET=$(tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 24)
    cat > "$ENV_FILE" <<EOF
PORT=3000
STREAM_SECRET=$SECRET
EOF
    echo ""
    echo "Generated secret key: $SECRET"
    echo "(Save this — you need it in the kiosk app settings)"
else
    SECRET=$(grep STREAM_SECRET "$ENV_FILE" | cut -d= -f2)
    echo "Existing .env kept. Secret: $SECRET"
fi

# ── Open firewall port (Linux only) ──────────────────────────────────────
if $IS_LINUX && command -v ufw &>/dev/null; then
    sudo ufw allow 3000/tcp || true
    echo "Firewall port 3000 opened."
fi

# ── Start with pm2 ───────────────────────────────────────────────────────
cd "$INSTALL_DIR"
pm2 delete "$SERVICE_NAME" 2>/dev/null || true
pm2 start server.js --name "$SERVICE_NAME"
pm2 save

# Set pm2 to start on system boot
if $IS_LINUX; then
    pm2 startup | tail -1 | sudo bash || true
elif $IS_MAC; then
    pm2 startup | tail -1 | bash || true
fi

# ── Get local IP ─────────────────────────────────────────────────────────
if $IS_MAC; then
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
else
    LOCAL_IP=$(hostname -I | awk '{print $1}')
fi

echo ""
echo "================================================"
echo "  Installation complete!"
echo "================================================"
echo ""
echo "Server URL (local):   ws://$LOCAL_IP:3000"
echo "Admin dashboard:      http://$LOCAL_IP:3000"
echo "Secret key:           $SECRET"
echo ""
echo "NEXT STEPS:"
echo "1. For internet access from anywhere:"
if $IS_LINUX; then
    PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR-SERVER-IP")
    echo "   Your public IP:  $PUBLIC_IP"
    echo "   Relay URL to use in kiosk app: ws://$PUBLIC_IP:3000"
else
    echo "   Either: forward port 3000 on your router to this machine"
    echo "   Or use ngrok (free): ngrok http 3000"
fi
echo ""
echo "2. In kiosk app: Settings → Advanced → Remote Monitoring"
echo "   Relay URL:   ws://YOUR-IP:3000"
echo "   Secret:      $SECRET"
echo ""
echo "Commands:"
echo "  pm2 status                 → check if running"
echo "  pm2 logs $SERVICE_NAME   → view logs"
echo "  pm2 stop $SERVICE_NAME   → stop server"
echo "  pm2 restart $SERVICE_NAME → restart"
echo ""
