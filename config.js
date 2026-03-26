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
import Constants from "expo-constants";

const PRODUCTION_API_URL =
  process.env.REACT_APP_API_URL || "https://paintinventory.onrender.com"; // ← Update this with your hosted backend URL

function getDevHostFromExpo() {
  // Try to infer the LAN host from the running dev client / Expo environment.
  // Examples:
  // - hostUri: "192.168.1.50:8081"
  // - debuggerHost: "192.168.1.50:8081"
  const hostUri =
    Constants?.expoConfig?.hostUri ||
    Constants?.manifest2?.extra?.expoClient?.hostUri ||
    Constants?.manifest?.debuggerHost ||
    Constants?.manifest2?.extra?.expoGo?.debuggerHost ||
    "";
  const host = String(hostUri).split(":")[0].trim();
  if (host && /^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
  return null;
}

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
      // If you're using Render/Supabase as the source of truth, prefer it even when running the UI on localhost.
      // To use a local backend instead, set REACT_APP_API_URL to "http://localhost:3000" (or your LAN IP).
      return PRODUCTION_API_URL;
    }

    // IP address (local network)
    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return `http://${hostname}:3000`;
    }
  }

  // Native/mobile: prefer local dev server when possible (same WiFi).
  const devHost = getDevHostFromExpo();
  if (devHost) return `http://${devHost}:3000`;

  // Fallback to production backend.
  return PRODUCTION_API_URL;
};

const API_URL = getApiUrl();

export default {
  API_URL,
};
