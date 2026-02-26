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
const PRODUCTION_API_URL = process.env.REACT_APP_API_URL || 'https://your-backend-url.railway.app'; // ← Update this with your hosted backend URL

const getApiUrl = () => {
  // Check for production API URL from environment variable (for Netlify/GitHub Pages)
  if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Check if we're in a browser environment (web)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Production hosting (Netlify, GitHub Pages, custom domain)
    if (hostname.includes('netlify.app') || 
        hostname.includes('github.io') || 
        hostname.includes('vercel.app') ||
        (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/))) {
      return PRODUCTION_API_URL;
    }
    
    // If running on localhost (web on same computer), use localhost for the API
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    
    // If accessing from phone via IP address, use the same IP for the API
    // Extract the IP from the current URL and use it for the API
    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      // Use the same IP address but port 3000 for the API
      return `http://${hostname}:3000`;
    }
  }
  
  // For React Native mobile apps (not web), use production backend or local IP
  // Update this IP when switching WiFi networks for local development!
  // For production mobile apps, this should point to your hosted backend
  return PRODUCTION_API_URL; // Change to 'http://YOUR_LOCAL_IP:3000' for local mobile testing
};

const API_URL = getApiUrl();

export default {
  API_URL,
};

