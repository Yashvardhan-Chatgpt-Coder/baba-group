import crypto from 'crypto';

const TOKEN_EXPIRY_MS = 72 * 60 * 60 * 1000;
const DISCORD_API = 'https://discord.com/api/v10';

function getSecretKey() {
  const pwd = process.env.DASHBOARD_PASSWORD || 'baba1234';
  return crypto.createHash('sha256').update(`baba-group-secret-${pwd}`).digest('hex');
}

function generateToken() {
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  const hmac = crypto.createHmac('sha256', getSecretKey()).update(`${expiresAt}`).digest('hex');
  return `${expiresAt}.${hmac}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  try {
    const [expiresAtStr, hmac] = token.split('.');
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false;
    const expectedHmac = crypto.createHmac('sha256', getSecretKey()).update(expiresAtStr).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac));
  } catch {
    return false;
  }
}

async function discordRequest(endpoint, options = {}) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN environment variable is missing.');
  const res = await fetch(`${DISCORD_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Discord API error (${res.status})`);
  }
  return data;
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/api/bot-info' && req.method === 'GET') {
    try {
      const botUser = await discordRequest('/users/@me');
      const avatarUrl = botUser.avatar
        ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';
      return res.status(200).json({
        botName: botUser.username || 'Baba Group Bot',
        botAvatar: avatarUrl,
      });
    } catch {
      return res.status(200).json({
        botName: 'Baba Group Bot',
        botAvatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
      });
    }
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const { password } = req.body || {};
    const configuredPassword = process.env.DASHBOARD_PASSWORD || 'baba1234';
    if (password === configuredPassword) {
      return res.status(200).json({
        success: true,
        token: generateToken(),
        message: 'Authentication successful! Session valid for 72 hours.',
      });
    }
    return res.status(401).json({ success: false, error: 'Incorrect secret password.' });
  }

  // Protected routes below
  const authHeader = req.headers['authorization'] || req.headers['x-dashboard-token'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized: Session expired or invalid password.' });
  }

  const guildId = process.env.GUILD_ID;

  if (pathname === '/api/channels' && req.method === 'GET') {
    try {
      if (!guildId) throw new Error('GUILD_ID environment variable is not set.');
      const rawChannels = await discordRequest(`/guilds/${guildId}/channels`);
      const categories = {};
      for (const ch of rawChannels) {
        if (ch.type === 4) categories[ch.id] = ch.name;
      }
      const sendableTypes = [0, 2, 5, 10, 11, 12, 13, 15];
      const channels = rawChannels
        .filter((ch) => sendableTypes.includes(ch.type))
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          category: ch.parent_id && categories[ch.parent_id] ? categories[ch.parent_id] : 'Other Channels',
          position: ch.position ?? 0,
        }))
        .sort((a, b) => a.position - b.position);

      return res.status(200).json({ totalFound: channels.length, channels });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to fetch channels' });
    }
  }

  if (pathname === '/api/roles' && req.method === 'GET') {
    try {
      if (!guildId) throw new Error('GUILD_ID environment variable is not set.');
      const rawRoles = await discordRequest(`/guilds/${guildId}/roles`);
      const roles = rawRoles
        .filter((r) => r.name !== '@everyone')
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: `#${(r.color || 0).toString(16).padStart(6, '0')}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return res.status(200).json({ roles });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to fetch roles' });
    }
  }

  if (pathname === '/api/send' && req.method === 'POST') {
    try {
      const {
        channelId,
        content,
        title,
        description,
        color,
        author,
        footer,
        imageUrl,
        thumbnailUrl,
      } = req.body || {};

      if (!channelId) {
        return res.status(400).json({ error: 'Target channel is required.' });
      }

      let embedColor = 0x2b2d31;
      if (color) {
        const parsed = parseInt(String(color).replace('#', ''), 16);
        if (!isNaN(parsed)) embedColor = parsed;
      }

      const embed = {
        color: embedColor,
        timestamp: new Date().toISOString(),
      };

      if (title && title.trim()) embed.title = title.trim();
      if (description && description.trim()) embed.description = description.trim();
      if (author && author.trim()) embed.author = { name: author.trim() };
      if (footer && footer.trim()) embed.footer = { text: footer.trim() };
      if (imageUrl && imageUrl.trim()) embed.image = { url: imageUrl.trim() };
      if (thumbnailUrl && thumbnailUrl.trim()) embed.thumbnail = { url: thumbnailUrl.trim() };

      const hasEmbed =
        embed.title || embed.description || embed.author || embed.footer || embed.image || embed.thumbnail;

      const payload = {
        allowed_mentions: { parse: ['roles', 'users', 'everyone'] },
      };

      if (content && content.trim()) payload.content = content.trim();
      if (hasEmbed) payload.embeds = [embed];

      if (!payload.content && !payload.embeds) {
        return res.status(400).json({ error: 'Please provide either text content or embed details.' });
      }

      await discordRequest(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return res.status(200).json({ success: true, message: 'Message successfully sent to Discord!' });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to send message.' });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}
