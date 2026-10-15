const TOKEN_STORAGE_KEY = 'baba_dashboard_token';

// Auth Elements
const authOverlay = document.getElementById('authOverlay');
const appContent = document.getElementById('appContent');
const authForm = document.getElementById('authForm');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Bot Branding Elements
const authBotAvatar = document.getElementById('authBotAvatar');
const headerBotAvatar = document.getElementById('headerBotAvatar');
const headerBotName = document.getElementById('headerBotName');
const previewBotAvatar = document.getElementById('previewBotAvatar');
const previewBotName = document.getElementById('previewBotName');

// Form Elements
const channelSelect = document.getElementById('channelSelect');
const refreshChannelsBtn = document.getElementById('refreshChannelsBtn');
const roleSelect = document.getElementById('roleSelect');
const insertRoleBtn = document.getElementById('insertRoleBtn');
const insertEveryoneBtn = document.getElementById('insertEveryoneBtn');
const insertHereBtn = document.getElementById('insertHereBtn');

const msgContent = document.getElementById('msgContent');
const embedAuthor = document.getElementById('embedAuthor');
const embedTitle = document.getElementById('embedTitle');
const embedDesc = document.getElementById('embedDesc');
const embedColor = document.getElementById('embedColor');
const embedThumb = document.getElementById('embedThumb');
const embedImage = document.getElementById('embedImage');
const embedFooter = document.getElementById('embedFooter');

const embedForm = document.getElementById('embedForm');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const statusToast = document.getElementById('statusToast');

// Live Preview Elements
const previewContent = document.getElementById('previewContent');
const previewEmbed = document.getElementById('previewEmbed');
const previewAuthor = document.getElementById('previewAuthor');
const previewTitle = document.getElementById('previewTitle');
const previewDesc = document.getElementById('previewDesc');
const previewThumb = document.getElementById('previewThumb');
const previewImage = document.getElementById('previewImage');
const previewFooterText = document.getElementById('previewFooterText');

let rolesMap = {};

function getAuthHeaders() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

function showLoginScreen(errorMsg = '') {
  authOverlay.classList.remove('hidden');
  appContent.classList.add('hidden');
  if (errorMsg) {
    authError.textContent = errorMsg;
    authError.classList.remove('hidden');
  } else {
    authError.classList.add('hidden');
  }
}

function showDashboard() {
  authOverlay.classList.add('hidden');
  appContent.classList.remove('hidden');
  loadChannels();
  loadRoles();
}

// Fetch Bot Name & Avatar
async function loadBotInfo() {
  try {
    const res = await fetch('/api/bot-info');
    if (!res.ok) return;
    const data = await res.json();
    if (data.botName) {
      headerBotName.textContent = data.botName;
      previewBotName.textContent = data.botName;
    }
    if (data.botAvatar) {
      authBotAvatar.src = data.botAvatar;
      headerBotAvatar.src = data.botAvatar;
      previewBotAvatar.src = data.botAvatar;
    }
  } catch (err) {
    console.warn('Could not load bot info:', err);
  }
}

// Handle Password Login
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = 'Verifying...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: authPassword.value }),
    });
    const data = await res.json();

    if (res.ok && data.token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      authPassword.value = '';
      showDashboard();
    } else {
      authError.textContent = data.error || 'Invalid password.';
      authError.classList.remove('hidden');
    }
  } catch (err) {
    authError.textContent = 'Unable to reach backend API.';
    authError.classList.remove('hidden');
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = 'Unlock Control Panel';
  }
});

// Lock Session
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  showLoginScreen();
});

// Channel Icon Helper
function getChannelPrefix(type) {
  switch (type) {
    case 5: return '📢';
    case 2: return '🔊';
    case 13: return '🎙️';
    case 15: return '💬';
    case 10:
    case 11:
    case 12: return '🧵';
    default: return '#';
  }
}

// Load Server Channels grouped by Category
async function loadChannels() {
  channelSelect.innerHTML = '<option value="">Loading server channels...</option>';
  try {
    const res = await fetch('/api/channels', { headers: getAuthHeaders() });
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      showLoginScreen('Session expired. Please re-enter the secret password.');
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load channels');

    channelSelect.innerHTML = `<option value="">Select a channel (${data.totalFound || data.channels.length} available)...</option>`;

    const grouped = {};
    for (const ch of data.channels) {
      const cat = ch.category || 'Other Channels';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ch);
    }

    for (const [category, channels] of Object.entries(grouped)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = category;
      for (const ch of channels) {
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.textContent = `${getChannelPrefix(ch.type)} ${ch.name}`;
        optgroup.appendChild(opt);
      }
      channelSelect.appendChild(optgroup);
    }
  } catch (err) {
    channelSelect.innerHTML = `<option value="">Error loading channels</option>`;
  }
}

// Load Server Roles
async function loadRoles() {
  try {
    const res = await fetch('/api/roles', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    roleSelect.innerHTML = '<option value="">Select a Role to tag...</option>';
    rolesMap = {};

    for (const role of data.roles || []) {
      rolesMap[role.id] = role.name;
      const opt = document.createElement('option');
      opt.value = role.id;
      opt.textContent = `@${role.name}`;
      roleSelect.appendChild(opt);
    }
    updatePreview();
  } catch (err) {
    console.warn('Error loading roles:', err);
  }
}

refreshChannelsBtn.addEventListener('click', () => {
  loadChannels();
  loadRoles();
});

// Role Mention Insertion Helpers
function insertPingIntoContent(tagText) {
  const current = msgContent.value.trim();
  msgContent.value = current ? `${current} ${tagText}` : tagText;
  updatePreview();
  msgContent.focus();
}

insertRoleBtn.addEventListener('click', () => {
  const roleId = roleSelect.value;
  if (!roleId) return;
  insertPingIntoContent(`<@&${roleId}>`);
});

insertEveryoneBtn.addEventListener('click', () => insertPingIntoContent('@everyone'));
insertHereBtn.addEventListener('click', () => insertPingIntoContent('@here'));

// Format mentions for Live Preview safely
function formatDiscordMentions(rawText) {
  const escaped = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => {
      const roleName = rolesMap[id] || `role-${id}`;
      return `<span class="discord-mention">@${roleName}</span>`;
    })
    .replace(/@everyone/g, '<span class="discord-mention">@everyone</span>')
    .replace(/@here/g, '<span class="discord-mention">@here</span>');
}

// Live Preview Updater
function updatePreview() {
  const contentVal = msgContent.value.trim();
  const authorVal = embedAuthor.value.trim();
  const titleVal = embedTitle.value.trim();
  const descVal = embedDesc.value.trim();
  const colorVal = embedColor.value || '#2b2d31';
  const thumbVal = embedThumb.value.trim();
  const imageVal = embedImage.value.trim();
  const footerVal = embedFooter.value.trim();

  if (contentVal) {
    previewContent.innerHTML = formatDiscordMentions(contentVal);
    previewContent.classList.remove('hidden');
  } else {
    previewContent.classList.add('hidden');
  }

  previewEmbed.style.borderLeftColor = colorVal;

  if (authorVal) {
    previewAuthor.textContent = authorVal;
    previewAuthor.classList.remove('hidden');
  } else {
    previewAuthor.classList.add('hidden');
  }

  previewTitle.textContent = titleVal || (descVal ? '' : 'Embed Preview');
  previewTitle.classList.toggle('hidden', !titleVal && !!descVal);

  if (descVal) {
    previewDesc.innerHTML = formatDiscordMentions(descVal);
  } else if (!titleVal && !authorVal && !imageVal && !thumbVal) {
    previewDesc.textContent = 'Start typing in the form on the left to see how your message will look inside Discord.';
  } else {
    previewDesc.textContent = '';
  }

  if (thumbVal) {
    previewThumb.src = thumbVal;
    previewThumb.classList.remove('hidden');
  } else {
    previewThumb.classList.add('hidden');
  }

  if (imageVal) {
    previewImage.src = imageVal;
    previewImage.classList.remove('hidden');
  } else {
    previewImage.classList.add('hidden');
  }

  previewFooterText.textContent = footerVal || 'Baba Group';
}

[msgContent, embedAuthor, embedTitle, embedDesc, embedColor, embedThumb, embedImage, embedFooter].forEach((el) => {
  el.addEventListener('input', updatePreview);
});

document.querySelectorAll('.color-preset').forEach((btn) => {
  btn.addEventListener('click', () => {
    embedColor.value = btn.dataset.color;
    updatePreview();
  });
});

clearBtn.addEventListener('click', () => {
  msgContent.value = '';
  embedAuthor.value = '';
  embedTitle.value = '';
  embedDesc.value = '';
  embedColor.value = '#2b2d31';
  embedThumb.value = '';
  embedImage.value = '';
  embedFooter.value = '';
  statusToast.classList.add('hidden');
  updatePreview();
});

function showToast(message, isError = false) {
  statusToast.textContent = message;
  statusToast.className = `toast ${isError ? 'error' : 'success'}`;
  statusToast.classList.remove('hidden');
}

// Send Embed Message
embedForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusToast.classList.add('hidden');

  if (!channelSelect.value) {
    showToast('Please select a target Discord channel.', true);
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending to Discord...';

  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        channelId: channelSelect.value,
        content: msgContent.value,
        author: embedAuthor.value,
        title: embedTitle.value,
        description: embedDesc.value,
        color: embedColor.value,
        thumbnailUrl: embedThumb.value,
        imageUrl: embedImage.value,
        footer: embedFooter.value,
      }),
    });

    const data = await res.json();

    if (res.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      showLoginScreen('Session expired. Please log in again.');
      return;
    }

    if (res.ok && data.success) {
      showToast(`✅ ${data.message}`);
    } else {
      showToast(`❌ ${data.error || 'Failed to send message.'}`, true);
    }
  } catch (err) {
    showToast('❌ Network error while sending message.', true);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Message to Discord';
  }
});

// Initialize on page load
loadBotInfo();
if (localStorage.getItem(TOKEN_STORAGE_KEY)) {
  showDashboard();
} else {
  showLoginScreen();
}
updatePreview();
