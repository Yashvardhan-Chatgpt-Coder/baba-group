import { Client, GatewayIntentBits, Events, REST, Routes, Collection, ActivityType } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Command } from './types/Command.js';
import { pingCommand } from './commands/ping.js';
import { moveallCommand } from './commands/moveall.js';
import { blacklistCommand } from './commands/blacklist.js';
import { strikeCommand } from './commands/strike.js';
import { punishmentsCommand } from './commands/punishments.js';
import { handleGuildMemberAdd } from './events/guildMemberAdd.js';
import { processExpiredStrikes } from './services/strikeService.js';
import { connectDatabase } from './db/connection.js';
import { startDashboard } from './dashboard/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend/ or project root
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

const token = process.env.DISCORD_TOKEN || '';
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
  console.error('❌ Error: DISCORD_TOKEN is missing in .env file!');
  process.exit(1);
}

// Connect to MongoDB Database
connectDatabase();

// Command registry
const commands = new Collection<string, Command>();
const commandList: Command[] = [
  pingCommand,
  moveallCommand,
  blacklistCommand,
  strikeCommand,
  punishmentsCommand,
];

for (const cmd of commandList) {
  commands.set(cmd.data.name, cmd);
}

function setupClient(client: Client) {
  client.once(Events.ClientReady, async (c) => {
    console.log(`✅ Logged in as ${c.user.tag}`);

    // Set explicit online status and activity
    c.user.setPresence({
      status: 'online',
      activities: [
        {
          name: 'Baba Group | /strike',
          type: ActivityType.Watching,
        },
      ],
    });

    // Initial check for any expired strikes
    processExpiredStrikes(client);

    // Set up recurring check for expired strikes every 60 seconds
    setInterval(() => {
      processExpiredStrikes(client);
    }, 60 * 1000);

    const appId = clientId;
    if (appId) {
      const rest = new REST({ version: '10' }).setToken(token);
      try {
        console.log(`🔄 Registering ${commands.size} slash command(s)...`);
        const payload = commandList.map((cmd) => cmd.data.toJSON());

        if (guildId && guildId.trim() !== '') {
          await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: payload });
          console.log(`✅ Guild Slash commands registered instantly for server ID: ${guildId}`);
        } else {
          await rest.put(Routes.applicationCommands(appId), { body: payload });
          console.log('✅ Global Slash commands registered globally across all servers!');
        }
      } catch (error) {
        console.error('❌ Error registering slash commands:', error);
      }
    } else {
      console.log('⚠️ Note: CLIENT_ID is needed in .env to register slash commands.');
    }
  });

  // Handle new members joining the server
  client.on(Events.GuildMemberAdd, async (member) => {
    await handleGuildMemberAdd(member);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', flags: 64 });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', flags: 64 });
      }
    }
  });
}

async function start() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Primary Client with GuildMembers Privileged Intent (for auto-roles and welcome on join)
  let client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
  });

  // 1. Immediately start the Web Dashboard server so Render port scan & health check pass instantly
  startDashboard(client, port);
  setupClient(client);

  try {
    await client.login(token);
  } catch (err: any) {
    if (err?.message?.includes('disallowed intents')) {
      console.warn('⚠️ [NOTICE] "Server Members Intent" is not toggled ON in Discord Developer Portal.');
      console.warn('⚠️ Starting bot with Standard Intents so bot remains online.');
      console.warn('👉 To enable auto-role on join and welcome messages, enable "Server Members Intent" in https://discord.com/developers/applications');

      // Recreate client with standard intents
      client.destroy();
      client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildVoiceStates,
          GatewayIntentBits.GuildMessages,
        ],
      });

      setupClient(client);
      await client.login(token).catch((fallbackErr) => {
        console.error('❌ Failed to login with fallback intents:', fallbackErr);
      });
    } else {
      console.error('❌ Failed to login to Discord:', err);
    }
  }
}

start();
