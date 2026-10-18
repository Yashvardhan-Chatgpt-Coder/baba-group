/**
 * Auto Keep-Alive Service for Render Web Services
 * Render free tier spins down after 15 minutes of HTTP inactivity.
 * This service pings the server every 10 minutes to maintain 24/7 uptime.
 */

const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 Minutes

export function startKeepAlive(localPort: number): NodeJS.Timeout {
  const targetUrl =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.APP_URL ||
    process.env.RENDER_SERVICE_URL;

  const pingEndpoint = targetUrl
    ? `${targetUrl.replace(/\/$/, '')}/health`
    : `http://localhost:${localPort}/health`;

  console.log(`⏱️ Keep-Alive service initialized.`);
  if (targetUrl) {
    console.log(`🔗 Target URL for 10-minute keep-alive: ${pingEndpoint}`);
  } else {
    console.log(
      `💡 Note: On Render, set RENDER_EXTERNAL_URL (or APP_URL) to your https://*.onrender.com URL to enable cloud keep-alive.`
    );
  }

  // Initial ping after 1 minute, then every 10 minutes
  setTimeout(() => {
    pingServer(pingEndpoint);
  }, 60 * 1000);

  return setInterval(() => {
    pingServer(pingEndpoint);
  }, PING_INTERVAL_MS);
}

async function pingServer(url: string) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'BabaGroup-KeepAlive/1.0' },
    });
    if (res.ok) {
      console.log(`🏓 [Keep-Alive] Pinged ${url} (${res.status} OK) at ${new Date().toLocaleTimeString()} — Server kept active.`);
    } else {
      console.warn(`⚠️ [Keep-Alive] Ping returned status ${res.status}`);
    }
  } catch (err: any) {
    console.warn(`⚠️ [Keep-Alive] Ping failed: ${err.message}`);
  }
}
