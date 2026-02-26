// API Configuration
// Change this to your server's IP address or domain
// For local development on Mac: 'http://localhost:3000'
// For testing on iPhone (same WiFi): 'http://YOUR_MAC_IP:3000' (find with: ifconfig | grep "inet ")
// For Raspberry Pi: 'http://YOUR_PI_IP:3000'
// For production: 'https://your-domain.com'

// IMPORTANT: Update this to your server's IP address!
// On Mac, find your IP: ifconfig | grep "inet " | grep -v 127.0.0.1
// On Raspberry Pi: hostname -I

// Auto-detect: Use localhost for web, or set specific IP for mobile
// For production hosting (Netlify/GitHub Pages), set REACT_APP_API_URL environment variable
// or update the PRODUCTION_API_URL below
const PRODUCTION_API_URL =
  process.env.REACT_APP_API_URL || "https://paintinventory.onrender.com"; // ← Update this with your hosted backend URL

const getApiUrl = () => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;

    // Production: Use your hosted backend
    if (
      hostname.includes("netlify.app") ||
      hostname.includes("github.io") ||
      hostname.includes("yourdomain.com")
    ) {
      return "https://paintinventory.onrender.com"; // ← Your backend URL
    }

    // Localhost development
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3000";
    }

    // IP address (local network)
    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return `http://${hostname}:3000`;
    }
  }

  // Mobile apps - use production backend
  return "https://paintinventory.onrender.com"; // ← Your backend URL
};

const API_URL = getApiUrl();

export default {
  API_URL,
};
