import express, { Request, Response, NextFunction } from 'express';
import { Client, EmbedBuilder, ChannelType } from 'discord.js';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72 Hours

function getSecretKey(): string {
  const pwd = process.env.DASHBOARD_PASSWORD || 'baba1234';
  return crypto.createHash('sha256').update(`baba-group-secret-${pwd}`).digest('hex');
}

function generateToken(): string {
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  const data = `${expiresAt}`;
  const hmac = crypto.createHmac('sha256', getSecretKey()).update(data).digest('hex');
  return `${expiresAt}.${hmac}`;
}

function verifyToken(token: string): boolean {
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

export function startDashboard(client: Client, port: number = 3000) {
  const app = express();
  app.use(express.json());

  // Enable CORS so frontend can communicate with backend from any origin
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Dashboard-Token');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Middleware to enforce 72-hour session authentication for API endpoints
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'] || req.headers['x-dashboard-token'];
    let token = '';

    if (typeof authHeader === 'string') {
      token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    }

    if (!verifyToken(token)) {
      res.status(401).json({ error: 'Unauthorized: Session expired or invalid password.' });
      return;
    }

    next();
  };

  // Public endpoint to get basic bot branding info for header/login screen
  app.get('/api/bot-info', (req, res) => {
    res.json({
      botName: client.user?.username || 'Baba Group Bot',
      botAvatar: client.user?.displayAvatarURL() || 'https://cdn.discordapp.com/embed/avatars/0.png',
    });
  });

  // API to handle Password Authentication Login
  app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const configuredPassword = process.env.DASHBOARD_PASSWORD || 'baba1234';

    if (password === configuredPassword) {
      const token = generateToken();
      res.json({ success: true, token, message: 'Authentication successful! Session valid for 72 hours.' });
    } else {
      res.status(401).json({ success: false, error: 'Incorrect secret password.' });
    }
  });

  // API to fetch ALL messageable channels (Text, Announcement, Voice text, Forum, etc.)
  app.get('/api/channels', requireAuth, async (req, res) => {
    try {
      const guildId = process.env.GUILD_ID;
      let guild = guildId ? client.guilds.cache.get(guildId) : client.guilds.cache.first();

      if (!guild) {
        res.status(404).json({ error: 'No guild found for the bot.' });
        return;
      }

      const fetchedChannels = await guild.channels.fetch();

      const sendableTypes = [
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice,
        ChannelType.GuildStageVoice,
        ChannelType.GuildForum,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.AnnouncementThread,
      ];

      const channels = fetchedChannels
        .filter((ch) => ch !== null && sendableTypes.includes(ch.type))
        .map((ch) => {
          const categoryName = ch!.parent ? ch!.parent.name : 'Other Channels';
          return {
            id: ch!.id,
            name: ch!.name,
            type: ch!.type,
            category: categoryName,
            position: ch!.rawPosition,
          };
        })
        .sort((a, b) => a.position - b.position);

      res.json({ guildName: guild.name, totalFound: channels.length, channels });
    } catch (error) {
      console.error('Error fetching channels:', error);
      res.status(500).json({ error: 'Failed to fetch channels' });
    }
  });

  // API to fetch all roles in the guild for easy mention insertion
  app.get('/api/roles', requireAuth, async (req, res) => {
    try {
      const guildId = process.env.GUILD_ID;
      let guild = guildId ? client.guilds.cache.get(guildId) : client.guilds.cache.first();

      if (!guild) {
        res.status(404).json({ error: 'No guild found.' });
        return;
      }

      await guild.roles.fetch();

      const roles = guild.roles.cache
        .filter((r) => r.name !== '@everyone')
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({ roles });
    } catch (error) {
      console.error('Error fetching roles:', error);
      res.status(500).json({ error: 'Failed to fetch roles' });
    }
  });

  // API to send the embed message
  app.post('/api/send', requireAuth, async (req, res) => {
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
      } = req.body;

      if (!channelId) {
        res.status(400).json({ error: 'Target channel is required.' });
        return;
      }

      const channel = await client.channels.fetch(channelId);
      if (!channel || !('send' in channel)) {
        res.status(400).json({ error: 'Selected channel cannot receive messages.' });
        return;
      }

      const embed = new EmbedBuilder();

      let embedColor = 0x2b2d31;
      if (color) {
        const cleanHex = color.replace('#', '');
        const parsed = parseInt(cleanHex, 16);
        if (!isNaN(parsed)) embedColor = parsed;
      }
      embed.setColor(embedColor);

      if (title && title.trim()) embed.setTitle(title.trim());
      if (description && description.trim()) embed.setDescription(description.trim());
      if (author && author.trim()) embed.setAuthor({ name: author.trim() });
      if (footer && footer.trim()) embed.setFooter({ text: footer.trim() });
      if (imageUrl && imageUrl.trim()) embed.setImage(imageUrl.trim());
      if (thumbnailUrl && thumbnailUrl.trim()) embed.setThumbnail(thumbnailUrl.trim());
      embed.setTimestamp();

      const payload: { content?: string; embeds?: EmbedBuilder[]; allowedMentions?: any } = {
        allowedMentions: { parse: ['roles', 'users', 'everyone'] },
      };

      if (content && content.trim()) payload.content = content.trim();

      if (
        (title && title.trim()) ||
        (description && description.trim()) ||
        (author && author.trim()) ||
        (footer && footer.trim()) ||
        (imageUrl && imageUrl.trim()) ||
        (thumbnailUrl && thumbnailUrl.trim())
      ) {
        payload.embeds = [embed];
      }

      if (!payload.content && (!payload.embeds || payload.embeds.length === 0)) {
        res.status(400).json({ error: 'Please provide either text content or embed details.' });
        return;
      }

      await (channel as any).send(payload);

      res.json({ success: true, message: `Message successfully sent to #${(channel as any).name || 'channel'}!` });
    } catch (error: any) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: error.message || 'Failed to send message.' });
    }
  });

  // Resolve root frontend directory (supports running from root or from backend/)
  const rootDirCandidates = [
    path.resolve(__dirname, '../../../'),
    path.resolve(process.cwd(), '../'),
    process.cwd(),
  ];
  const frontendDir = rootDirCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || process.cwd();

  app.use(express.static(frontendDir));

  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
  });

  app.listen(port, () => {
    console.log(`🌐 Web Dashboard & Embed Builder running at: http://localhost:${port}`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      const fallbackPort = port + 1;
      console.log(`⚠️ Port ${port} is in use, running Web Dashboard on http://localhost:${fallbackPort}...`);
      app.listen(fallbackPort, () => {
        console.log(`🌐 Web Dashboard & Embed Builder running at: http://localhost:${fallbackPort}`);
      });
    } else {
      console.error('Server error:', err);
    }
  });
}
