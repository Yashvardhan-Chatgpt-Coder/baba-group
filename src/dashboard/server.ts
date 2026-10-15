import express, { Request, Response, NextFunction } from 'express';
import { Client, TextChannel, NewsChannel, VoiceChannel, StageChannel, EmbedBuilder, ChannelType } from 'discord.js';
import crypto from 'crypto';

// Cryptographic Secret for 72-hour Session Tokens
const SECRET_KEY = crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72 Hours

function generateToken(): string {
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  const data = `${expiresAt}`;
  const hmac = crypto.createHmac('sha256', SECRET_KEY).update(data).digest('hex');
  return `${expiresAt}.${hmac}`;
}

function verifyToken(token: string): boolean {
  if (!token || !token.includes('.')) return false;
  try {
    const [expiresAtStr, hmac] = token.split('.');
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

    const expectedHmac = crypto.createHmac('sha256', SECRET_KEY).update(expiresAtStr).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac));
  } catch {
    return false;
  }
}

export function startDashboard(client: Client, port: number = 3000) {
  const app = express();
  app.use(express.json());

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

      // Fetch all channels fresh from Discord API
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

  // Serve Dashboard HTML Web Application
  app.get('/', (req, res) => {
    res.send(getDashboardHTML(client.user?.username || 'Baba Group Bot', client.user?.displayAvatarURL() || ''));
  });

  const server = app.listen(port, () => {
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

function getDashboardHTML(botName: string, botAvatar: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord Embed Builder Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Gg Sans', 'Segoe UI', sans-serif; }
    body { background-color: #1e1f22; color: #dbdee1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    header { background-color: #2b2d31; padding: 15px 25px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #111214; }
    .header-left { display: flex; align-items: center; }
    header img { width: 36px; height: 36px; border-radius: 50%; margin-right: 12px; }
    header h1 { font-size: 18px; color: #f2f3f5; font-weight: 600; }

    .btn-logout { background-color: #383a40; color: #dbdee1; border: none; padding: 8px 14px; font-size: 13px; font-weight: 600; border-radius: 4px; cursor: pointer; display: none; }
    .btn-logout:hover { background-color: #474950; color: #fff; }

    .login-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: #1e1f22;
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .login-card {
      background-color: #2b2d31; width: 380px; padding: 30px; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); text-align: center;
    }
    .login-card img { width: 64px; height: 64px; border-radius: 50%; margin-bottom: 15px; }
    .login-card h2 { font-size: 20px; color: #f2f3f5; margin-bottom: 8px; }
    .login-card p { font-size: 13px; color: #949ba4; margin-bottom: 20px; }
    .login-card input {
      width: 100%; background-color: #1e1f22; border: 1px solid #383a40; border-radius: 4px; padding: 12px;
      color: #f2f3f5; font-size: 14px; outline: none; margin-bottom: 15px; text-align: center;
    }
    .login-card input:focus { border-color: #5865f2; }
    .login-card button {
      width: 100%; background-color: #5865f2; color: #ffffff; font-weight: 600; font-size: 15px; padding: 12px;
      border: none; border-radius: 4px; cursor: pointer; transition: background-color 0.2s;
    }
    .login-card button:hover { background-color: #4752c4; }

    .main-container { display: flex; flex: 1; overflow: hidden; }

    .form-panel { width: 50%; padding: 25px; overflow-y: auto; background-color: #2b2d31; border-right: 1px solid #1e1f22; }
    .form-group { margin-bottom: 18px; }
    .form-group label { display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #b5bac1; margin-bottom: 6px; letter-spacing: 0.5px; }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%; background-color: #1e1f22; border: 1px solid #383a40; border-radius: 4px; padding: 10px 12px;
      color: #f2f3f5; font-size: 14px; outline: none; transition: border-color 0.2s;
    }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: #5865f2; }
    .form-group textarea { resize: vertical; min-height: 90px; }

    .tag-row { display: flex; gap: 8px; margin-top: 6px; }
    .btn-tag { background-color: #383a40; color: #dbdee1; border: none; padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 4px; cursor: pointer; }
    .btn-tag:hover { background-color: #474950; color: #fff; }

    .color-row { display: flex; gap: 10px; align-items: center; }
    .color-row input[type="color"] { width: 50px; height: 40px; padding: 2px; cursor: pointer; }

    .btn-send {
      width: 100%; background-color: #4e5058; color: #ffffff; font-weight: 600; font-size: 15px; padding: 12px;
      border: none; border-radius: 4px; cursor: pointer; transition: background-color 0.2s; margin-top: 10px;
    }
    .btn-send:hover { background-color: #6d6f78; }

    .preview-panel { width: 50%; padding: 30px; background-color: #313338; display: flex; flex-direction: column; overflow-y: auto; }
    .preview-header { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #949ba4; margin-bottom: 15px; }

    .discord-chat { background-color: #313338; display: flex; gap: 16px; }
    .discord-avatar { width: 40px; height: 40px; border-radius: 50%; }
    .discord-message { flex: 1; }
    .discord-user { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .discord-username { font-weight: 600; color: #f2f3f5; font-size: 15px; }
    .discord-bot-badge { background-color: #5865f2; color: #ffffff; font-size: 10px; font-weight: 700; padding: 1px 4px; border-radius: 3px; text-transform: uppercase; }
    .discord-timestamp { font-size: 12px; color: #949ba4; margin-left: 4px; }
    .discord-content { color: #dbdee1; font-size: 15px; margin-bottom: 8px; white-space: pre-wrap; word-break: break-word; }

    .discord-embed {
      background-color: #2b2d31; border-left: 4px solid #2b2d31; border-radius: 4px; padding: 12px 16px;
      max-width: 520px; display: inline-block; width: 100%;
    }
    .embed-author { font-size: 13px; font-weight: 600; color: #f2f3f5; margin-bottom: 6px; }
    .embed-title { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 8px; }
    .embed-description { font-size: 14px; color: #dbdee1; white-space: pre-wrap; word-break: break-word; margin-bottom: 8px; line-height: 1.4; }
    .embed-image { width: 100%; border-radius: 4px; margin-top: 8px; max-height: 300px; object-fit: cover; display: none; }
    .embed-thumbnail { float: right; width: 80px; height: 80px; border-radius: 4px; object-fit: cover; margin-left: 16px; display: none; }
    .embed-footer { font-size: 12px; color: #949ba4; margin-top: 8px; border-top: 1px solid #35373c; padding-top: 6px; display: none; }

    .toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 20px; border-radius: 4px; color: #fff; font-weight: 600; display: none; z-index: 1100; }
    .toast.success { background-color: #23a55a; }
    .toast.error { background-color: #f23f43; }
  </style>
</head>
<body>
  <div id="loginOverlay" class="login-overlay">
    <div class="login-card">
      <img src="${botAvatar}" alt="Bot Avatar">
      <h2>${botName} Dashboard</h2>
      <p>Enter secret password to access the panel (Session valid for 72 hours)</p>
      <input type="password" id="loginPassword" placeholder="Enter password..." autofocus>
      <button id="loginSubmitBtn">🔓 Unlock Dashboard</button>
    </div>
  </div>

  <header>
    <div class="header-left">
      <img src="${botAvatar}" alt="Bot Avatar">
      <h1>${botName} — Embed Builder & Dashboard</h1>
    </div>
    <button class="btn-logout" id="logoutBtn">🔒 Lock Dashboard</button>
  </header>

  <div class="main-container">
    <div class="form-panel">
      <div class="form-group">
        <label>Select Channel</label>
        <select id="channelSelect">
          <option value="">Loading all server channels...</option>
        </select>
      </div>

      <div class="form-group">
        <label>Tag / Mention Role Quick Inserter</label>
        <div style="display:flex; gap:8px;">
          <select id="roleSelect" style="flex:1;">
            <option value="">Loading server roles...</option>
          </select>
          <button class="btn-tag" id="insertRoleBtn" style="background:#5865f2; color:#fff;">+ Insert Tag</button>
        </div>
        <div class="tag-row">
          <button class="btn-tag" id="tagEveryoneBtn">@everyone</button>
          <button class="btn-tag" id="tagHereBtn">@here</button>
        </div>
      </div>

      <div class="form-group">
        <label>Plain Message Text (Optional)</label>
        <textarea id="plainContent" placeholder="Text sent outside the embed (e.g. @everyone or announcement message)"></textarea>
      </div>

      <div class="form-group">
        <label>Embed Color</label>
        <div class="color-row">
          <input type="color" id="embedColor" value="#2b2d31">
          <input type="text" id="embedColorHex" value="#2b2d31" style="flex:1;">
        </div>
      </div>

      <div class="form-group">
        <label>Author Name</label>
        <input type="text" id="embedAuthor" placeholder="e.g. Grand RP Announcement">
      </div>

      <div class="form-group">
        <label>Embed Title</label>
        <input type="text" id="embedTitle" placeholder="e.g. Family Meeting Guidelines">
      </div>

      <div class="form-group">
        <label>Embed Description</label>
        <textarea id="embedDescription" placeholder="Main embed text content..."></textarea>
      </div>

      <div class="form-group">
        <label>Thumbnail Image URL (Optional)</label>
        <input type="text" id="embedThumbnail" placeholder="https://example.com/logo.png">
      </div>

      <div class="form-group">
        <label>Banner Image URL (Optional)</label>
        <input type="text" id="embedImage" placeholder="https://example.com/banner.png">
      </div>

      <div class="form-group">
        <label>Footer Text</label>
        <input type="text" id="embedFooter" placeholder="e.g. Baba Group Official Bot">
      </div>

      <button class="btn-send" id="sendBtn">🚀 Send Message to Discord</button>
    </div>

    <div class="preview-panel">
      <div class="preview-header">Live Discord Message Preview</div>
      
      <div class="discord-chat">
        <img src="${botAvatar}" class="discord-avatar" id="prevAvatar">
        <div class="discord-message">
          <div class="discord-user">
            <span class="discord-username">${botName}</span>
            <span class="discord-bot-badge">APP</span>
            <span class="discord-timestamp">Today at 12:00 PM</span>
          </div>

          <div class="discord-content" id="prevContent" style="display:none;"></div>

          <div class="discord-embed" id="prevEmbed">
            <img src="" class="embed-thumbnail" id="prevThumbnail">
            <div class="embed-author" id="prevAuthor" style="display:none;"></div>
            <div class="embed-title" id="prevTitle" style="display:none;"></div>
            <div class="embed-description" id="prevDesc" style="display:none;"></div>
            <img src="" class="embed-image" id="prevImage">
            <div class="embed-footer" id="prevFooter" style="display:none;"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    let authToken = localStorage.getItem('dashboard_token') || '';
    let roleMap = {};

    function checkAuth() {
      if (!authToken) {
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('logoutBtn').style.display = 'none';
        return false;
      }
      document.getElementById('loginOverlay').style.display = 'none';
      document.getElementById('logoutBtn').style.display = 'block';
      loadData();
      return true;
    }

    document.getElementById('loginSubmitBtn').addEventListener('click', doLogin);
    document.getElementById('loginPassword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });

    function doLogin() {
      const password = document.getElementById('loginPassword').value;
      if (!password) {
        showToast('Please enter password!', 'error');
        return;
      }

      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.token) {
          authToken = data.token;
          localStorage.setItem('dashboard_token', authToken);
          showToast('Authenticated! Valid for 72 hours.', 'success');
          checkAuth();
        } else {
          showToast(data.error || 'Incorrect password!', 'error');
        }
      })
      .catch(err => {
        showToast('Login request failed.', 'error');
      });
    }

    document.getElementById('logoutBtn').addEventListener('click', () => {
      localStorage.removeItem('dashboard_token');
      authToken = '';
      checkAuth();
      showToast('Dashboard locked.', 'success');
    });

    function authFetch(url, options = {}) {
      options.headers = options.headers || {};
      options.headers['Authorization'] = 'Bearer ' + authToken;
      return fetch(url, options).then(res => {
        if (res.status === 401) {
          localStorage.removeItem('dashboard_token');
          authToken = '';
          checkAuth();
          showToast('Session expired. Please log in again.', 'error');
          throw new Error('Unauthorized');
        }
        return res;
      });
    }

    function loadData() {
      // Fetch ALL channels (Grouped by Category)
      authFetch('/api/channels')
        .then(res => res.json())
        .then(data => {
          const select = document.getElementById('channelSelect');
          select.innerHTML = '';
          if (data.channels && data.channels.length > 0) {
            // Group by Category
            const categories = {};
            data.channels.forEach(ch => {
              const cat = ch.category || 'Other Channels';
              if (!categories[cat]) categories[cat] = [];
              categories[cat].push(ch);
            });

            for (const catName in categories) {
              const optGroup = document.createElement('optgroup');
              optGroup.label = '📁 ' + catName;
              categories[catName].forEach(ch => {
                const opt = document.createElement('option');
                opt.value = ch.id;
                opt.textContent = '#' + ch.name;
                optGroup.appendChild(opt);
              });
              select.appendChild(optGroup);
            }
          } else {
            select.innerHTML = '<option value="">No messageable channels found</option>';
          }
        })
        .catch(() => {});

      // Fetch roles
      authFetch('/api/roles')
        .then(res => res.json())
        .then(data => {
          const roleSel = document.getElementById('roleSelect');
          roleSel.innerHTML = '';
          if (data.roles && data.roles.length > 0) {
            data.roles.forEach(r => {
              roleMap[r.id] = r.name;
              const opt = document.createElement('option');
              opt.value = r.id;
              opt.textContent = '@' + r.name;
              roleSel.appendChild(opt);
            });
          } else {
            roleSel.innerHTML = '<option value="">No roles found</option>';
          }
        })
        .catch(() => {});
    }

    document.getElementById('insertRoleBtn').addEventListener('click', () => {
      const roleId = document.getElementById('roleSelect').value;
      if (roleId) {
        insertText('<@&' + roleId + '>');
      }
    });

    document.getElementById('tagEveryoneBtn').addEventListener('click', () => {
      insertText('@everyone');
    });

    document.getElementById('tagHereBtn').addEventListener('click', () => {
      insertText('@here');
    });

    function insertText(text) {
      const target = document.getElementById('plainContent');
      target.value = (target.value ? target.value + ' ' : '') + text;
      updatePreview();
    }

    const inputs = ['plainContent', 'embedColor', 'embedColorHex', 'embedAuthor', 'embedTitle', 'embedDescription', 'embedThumbnail', 'embedImage', 'embedFooter'];
    inputs.forEach(id => {
      document.getElementById(id).addEventListener('input', updatePreview);
    });

    document.getElementById('embedColor').addEventListener('input', (e) => {
      document.getElementById('embedColorHex').value = e.target.value;
      updatePreview();
    });

    document.getElementById('embedColorHex').addEventListener('input', (e) => {
      document.getElementById('embedColor').value = e.target.value;
      updatePreview();
    });

    function updatePreview() {
      let content = document.getElementById('plainContent').value;
      const color = document.getElementById('embedColorHex').value;
      const author = document.getElementById('embedAuthor').value;
      const title = document.getElementById('embedTitle').value;
      let desc = document.getElementById('embedDescription').value;
      const thumb = document.getElementById('embedThumbnail').value;
      const img = document.getElementById('embedImage').value;
      const footer = document.getElementById('embedFooter').value;

      content = formatTagsForDisplay(content);
      desc = formatTagsForDisplay(desc);

      const prevContent = document.getElementById('prevContent');
      if (content.trim()) {
        prevContent.innerHTML = content;
        prevContent.style.display = 'block';
      } else {
        prevContent.style.display = 'none';
      }

      const embedBox = document.getElementById('prevEmbed');
      embedBox.style.borderColor = color || '#2b2d31';

      const prevAuthor = document.getElementById('prevAuthor');
      if (author.trim()) { prevAuthor.textContent = author; prevAuthor.style.display = 'block'; }
      else { prevAuthor.style.display = 'none'; }

      const prevTitle = document.getElementById('prevTitle');
      if (title.trim()) { prevTitle.textContent = title; prevTitle.style.display = 'block'; }
      else { prevTitle.style.display = 'none'; }

      const prevDesc = document.getElementById('prevDesc');
      if (desc.trim()) { prevDesc.innerHTML = desc; prevDesc.style.display = 'block'; }
      else { prevDesc.style.display = 'none'; }

      const prevThumb = document.getElementById('prevThumbnail');
      if (thumb.trim()) { prevThumb.src = thumb; prevThumb.style.display = 'block'; }
      else { prevThumb.style.display = 'none'; }

      const prevImg = document.getElementById('prevImage');
      if (img.trim()) { prevImg.src = img; prevImg.style.display = 'block'; }
      else { prevImg.style.display = 'none'; }

      const prevFooter = document.getElementById('prevFooter');
      if (footer.trim()) { prevFooter.textContent = footer + ' • Today at 12:00 PM'; prevFooter.style.display = 'block'; }
      else { prevFooter.style.display = 'none'; }
    }

    function formatTagsForDisplay(str) {
      if (!str) return '';
      return str.replace(/<@&(\\d+)>/g, (match, id) => {
        const name = roleMap[id] || 'Role';
        return '<span style="background-color:rgba(88,101,242,0.3); color:#c9cdfb; font-weight:600; padding:1px 5px; border-radius:3px;">@' + name + '</span>';
      });
    }

    document.getElementById('sendBtn').addEventListener('click', () => {
      const channelId = document.getElementById('channelSelect').value;
      if (!channelId) {
        showToast('Please select a channel first!', 'error');
        return;
      }

      const payload = {
        channelId,
        content: document.getElementById('plainContent').value,
        color: document.getElementById('embedColorHex').value,
        author: document.getElementById('embedAuthor').value,
        title: document.getElementById('embedTitle').value,
        description: document.getElementById('embedDescription').value,
        thumbnailUrl: document.getElementById('embedThumbnail').value,
        imageUrl: document.getElementById('embedImage').value,
        footer: document.getElementById('embedFooter').value
      };

      authFetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          showToast(data.message, 'success');
        } else {
          showToast(data.error || 'Failed to send message.', 'error');
        }
      })
      .catch(err => {
        showToast('Error sending message to server.', 'error');
      });
    });

    function showToast(msg, type) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.className = 'toast ' + type;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 4000);
    }

    checkAuth();
    updatePreview();
  </script>
</body>
</html>`;
}
