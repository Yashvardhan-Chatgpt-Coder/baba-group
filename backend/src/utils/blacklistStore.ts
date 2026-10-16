import fs from 'fs';
import path from 'path';
import { EmbedBuilder, Client } from 'discord.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'blacklist.json');

const INITIAL_NAMES: string[] = [
  'Promit Silverstone',
  'Vanshika Leo',
  'Jack Amphetamine',
  'King Amxn',
  'Jeetu Dappardan',
  'Ritesh Dappardan',
  'Badmos King',
  'Lucky Beniwal',
  'Arthur Pahadi',
  'Omm Prakash',
  'Shadman Pluxury',
  'Narcoss Dan',
  'Adler Degrey',
  'Manumay Malhotra',
  'Gagz Gilgamesh',
  'Cindrella Queen',
  'Rin Yoichi',
  'Mizo Lux',
  'Gurjar Awana',
  'Mickey Zyrexx',
  'Aruu Viper',
  'Thomas Verlice',
  'Yam Lion',
  'Yam Sparrow',
  'Rinky Viper',
  'Ronit Plays',
  'Biomask King',
  'Agent Hawk',
  'Falcon Faisal',
  'Fushi Bloodlust',
  'Vedant Jadhav',
  'Shreyash Daaku',
  'John Richii',
  'Vikku Ashcroft',
  'Arthur Ashcroft',
  'The tgpatel',
  'Demon King',
];

export interface BlacklistData {
  names: string[];
  postedMessage?: {
    channelId: string;
    messageId: string;
  };
}

export const BLACKLIST_BANNER_URL = 'https://i.imgur.com/8NiI50L.png';
export const BLACKLIST_EMBED_COLOR = 0xc9a66b; // Premium Gold #C9A66B

export function getBlacklistData(): BlacklistData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      const initialData: BlacklistData = { names: [...INITIAL_NAMES] };
      saveBlacklistData(initialData);
      return initialData;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);

    // Backward compatibility: if file is an array
    if (Array.isArray(parsed)) {
      const migrated: BlacklistData = { names: parsed };
      saveBlacklistData(migrated);
      return migrated;
    }

    if (parsed && Array.isArray(parsed.names)) {
      return parsed;
    }

    return { names: [...INITIAL_NAMES] };
  } catch (err) {
    console.error('Error reading blacklist file:', err);
    return { names: [...INITIAL_NAMES] };
  }
}

export function saveBlacklistData(data: BlacklistData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving blacklist file:', err);
  }
}

export function getBlacklist(): string[] {
  return getBlacklistData().names;
}

export function setPostedMessageInfo(channelId: string, messageId: string): void {
  const data = getBlacklistData();
  data.postedMessage = { channelId, messageId };
  saveBlacklistData(data);
}

export function addBlacklistName(name: string): { success: boolean; index: number; list: string[] } {
  const cleanName = name.trim();
  const data = getBlacklistData();

  // Check if name already exists (case-insensitive)
  const existingIdx = data.names.findIndex((n) => n.toLowerCase() === cleanName.toLowerCase());
  if (existingIdx !== -1) {
    return { success: false, index: existingIdx + 1, list: data.names };
  }

  data.names.push(cleanName);
  saveBlacklistData(data);
  return { success: true, index: data.names.length, list: data.names };
}

export function removeBlacklistName(query: string): { success: boolean; removedName?: string; list: string[] } {
  const cleanQuery = query.trim();
  const data = getBlacklistData();

  // Try parsing numeric index (1-based, like 01, 1, 37)
  const parsedNum = parseInt(cleanQuery, 10);
  if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= data.names.length) {
    const [removedName] = data.names.splice(parsedNum - 1, 1);
    saveBlacklistData(data);
    return { success: true, removedName, list: data.names };
  }

  // Search by exact or case-insensitive name match
  const idx = data.names.findIndex((n) => n.toLowerCase() === cleanQuery.toLowerCase());
  if (idx !== -1) {
    const [removedName] = data.names.splice(idx, 1);
    saveBlacklistData(data);
    return { success: true, removedName, list: data.names };
  }

  return { success: false, list: data.names };
}

export function buildBlacklistPayload(guildIconUrl?: string | null) {
  const list = getBlacklist();

  const formattedNumberedList = list
    .map((name, i) => `${String(i + 1).padStart(2, '0')}. ${name}`)
    .join('\n');

  const description =
    `The following individuals are officially blacklisted by Baba Group. No assistance or support of any kind may be provided to these individuals.\n\n` +
    `${formattedNumberedList}\n\n` +
    `────────────────────────────\n\n` +
    `⚠️ **STRICT ENFORCEMENT NOTICE**\n\n` +
    `Baba Group employees must take appropriate action against any listed individual encountered **in character (IC)**. Providing assistance to blacklisted individuals is strictly prohibited.\n\n` +
    `All employees are expected to comply with this directive.`;

  const embed = new EmbedBuilder()
    .setColor(BLACKLIST_EMBED_COLOR)
    .setAuthor({
      name: 'Baba Group | Blacklist Registry',
      iconURL: guildIconUrl || undefined,
    })
    .setTitle('🚫 Blacklisted Individuals')
    .setDescription(description)
    .setImage(BLACKLIST_BANNER_URL)
    .setFooter({
      text: 'Baba Group • Official Blacklist Registry',
    })
    .setTimestamp();

  const plainMessageText =
    `🚫 **Official Blacklist Notice**\n` +
    `The following individuals are blacklisted from receiving assistance from Baba Group. All employees must review and comply with this notice.\n` +
    `<@&1557805108509806673>`;

  return {
    content: plainMessageText,
    embeds: [embed],
    allowedMentions: {
      parse: ['roles', 'users', 'everyone'] as any,
    },
  };
}

export async function syncActiveBlacklistMessage(
  client: Client,
  guildIconUrl?: string | null
): Promise<{ updated: boolean; channelId?: string; messageId?: string }> {
  const data = getBlacklistData();
  if (!data.postedMessage) return { updated: false };

  try {
    const channel = await client.channels.fetch(data.postedMessage.channelId);
    if (!channel || !('messages' in channel)) return { updated: false };

    const message = await (channel as any).messages.fetch(data.postedMessage.messageId);
    if (!message) return { updated: false };

    const payload = buildBlacklistPayload(guildIconUrl);
    await message.edit({
      content: payload.content,
      embeds: payload.embeds,
      allowedMentions: payload.allowedMentions,
    });

    return {
      updated: true,
      channelId: data.postedMessage.channelId,
      messageId: data.postedMessage.messageId,
    };
  } catch (err) {
    console.warn('Could not auto-sync posted blacklist message:', err);
    return { updated: false };
  }
}
