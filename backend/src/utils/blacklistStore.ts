import fs from 'fs';
import path from 'path';
import { EmbedBuilder, Client } from 'discord.js';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { BlacklistRegistry } from '../models/Blacklist.js';

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

// Helper to read backup/initial data from local JSON file
function readLocalBlacklistFile(): BlacklistData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { names: parsed };
      }
      if (parsed && Array.isArray(parsed.names)) {
        return {
          names: parsed.names,
          postedMessage: parsed.postedMessage,
        };
      }
    }
  } catch (err) {
    console.error('Error reading local blacklist backup file:', err);
  }
  return { names: [...INITIAL_NAMES] };
}

// Helper to write backup to local JSON file
function writeLocalBlacklistFile(data: BlacklistData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing local blacklist backup file:', err);
  }
}

export async function getBlacklistData(): Promise<BlacklistData> {
  // If MongoDB is connected, use DB as primary source of truth
  if (mongoose.connection.readyState === 1) {
    try {
      let doc = await BlacklistRegistry.findOne({ registryId: 'default' });
      if (!doc) {
        // First-time setup / migration: read existing data from local file or INITIAL_NAMES
        const seedData = readLocalBlacklistFile();
        doc = await BlacklistRegistry.create({
          registryId: 'default',
          names: seedData.names,
          postedMessage: seedData.postedMessage,
        });
        console.log(`✅ Blacklist data migrated to MongoDB (${doc.names.length} names registered)`);
      }
      const data: BlacklistData = {
        names: doc.names || [],
        postedMessage: doc.postedMessage
          ? {
              channelId: doc.postedMessage.channelId || '',
              messageId: doc.postedMessage.messageId || '',
            }
          : undefined,
      };
      // Keep local file in sync as backup
      writeLocalBlacklistFile(data);
      return data;
    } catch (err) {
      console.error('Error fetching blacklist from MongoDB, falling back to local file:', err);
    }
  }

  // Fallback to local file if MongoDB is disconnected or unavailable
  return readLocalBlacklistFile();
}

export async function saveBlacklistData(data: BlacklistData): Promise<void> {
  // Always update local file as backup
  writeLocalBlacklistFile(data);

  if (mongoose.connection.readyState === 1) {
    try {
      await BlacklistRegistry.findOneAndUpdate(
        { registryId: 'default' },
        {
          $set: {
            names: data.names,
            postedMessage: data.postedMessage,
          },
        },
        { upsert: true, new: true }
      );
      console.log(`💾 Blacklist saved to MongoDB (${data.names.length} names)`);
    } catch (err) {
      console.error('❌ Error saving blacklist data to MongoDB:', err);
    }
  } else {
    console.warn('⚠️ MongoDB not connected; saved blacklist to local file only.');
  }
}

export async function getBlacklist(): Promise<string[]> {
  const data = await getBlacklistData();
  return data.names;
}

export async function setPostedMessageInfo(channelId: string, messageId: string): Promise<void> {
  const data = await getBlacklistData();
  data.postedMessage = { channelId, messageId };
  await saveBlacklistData(data);
}

export async function addBlacklistName(name: string): Promise<{ success: boolean; index: number; list: string[] }> {
  const cleanName = name.trim();
  const data = await getBlacklistData();

  // Check if name already exists (case-insensitive)
  const existingIdx = data.names.findIndex((n) => n.toLowerCase() === cleanName.toLowerCase());
  if (existingIdx !== -1) {
    return { success: false, index: existingIdx + 1, list: data.names };
  }

  data.names.push(cleanName);
  await saveBlacklistData(data);
  return { success: true, index: data.names.length, list: data.names };
}

export async function removeBlacklistName(query: string): Promise<{ success: boolean; removedName?: string; list: string[] }> {
  const cleanQuery = query.trim();
  const data = await getBlacklistData();

  // Try parsing numeric index (1-based, like 01, 1, 37)
  const parsedNum = parseInt(cleanQuery, 10);
  if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= data.names.length) {
    const [removedName] = data.names.splice(parsedNum - 1, 1);
    await saveBlacklistData(data);
    return { success: true, removedName, list: data.names };
  }

  // Search by exact or case-insensitive name match
  const idx = data.names.findIndex((n) => n.toLowerCase() === cleanQuery.toLowerCase());
  if (idx !== -1) {
    const [removedName] = data.names.splice(idx, 1);
    await saveBlacklistData(data);
    return { success: true, removedName, list: data.names };
  }

  return { success: false, list: data.names };
}

export async function buildBlacklistPayload(guildIconUrl?: string | null, customList?: string[]) {
  const list = customList ?? (await getBlacklist());

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
  const data = await getBlacklistData();
  if (!data.postedMessage) return { updated: false };

  try {
    const channel = await client.channels.fetch(data.postedMessage.channelId);
    if (!channel || !('messages' in channel)) return { updated: false };

    const message = await (channel as any).messages.fetch(data.postedMessage.messageId);
    if (!message) return { updated: false };

    const payload = await buildBlacklistPayload(guildIconUrl, data.names);
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
