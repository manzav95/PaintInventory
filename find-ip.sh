#!/bin/bash
# Script to find your current IP address for the server

echo "Finding your current IP address..."
echo ""

# Try to find IP address
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    IP=$(hostname -I | awk '{print $1}')
else
    echo "Please find your IP address manually:"
    echo "  - Mac: ifconfig | grep 'inet ' | grep -v 127.0.0.1"
    echo "  - Linux: hostname -I"
    echo "  - Windows: ipconfig (look for IPv4 Address)"
    exit 1
fi

if [ -z "$IP" ]; then
    echo "Could not automatically detect IP address."
    echo "Please find it manually and update config.js"
    exit 1
fi

echo "Your current IP address is: $IP"
echo ""
echo "Update config.js with:"
echo "  const API_URL = 'http://$IP:3000';"
echo ""
echo "Or run this command to update automatically:"
echo "  sed -i '' \"s|const API_URL = 'http://.*:3000'|const API_URL = 'http://$IP:3000'|\" config.js"

