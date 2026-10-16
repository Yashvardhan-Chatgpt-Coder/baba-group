import { Client, GatewayIntentBits, Events, REST, Routes, Collection, ActivityType } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Command } from './types/Command.js';
import { pingCommand } from './commands/ping.js';
import { moveallCommand } from './commands/moveall.js';
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

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
  console.error('❌ Error: DISCORD_TOKEN is missing in .env file!');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

// Command registry
const commands = new Collection<string, Command>();

const commandList: Command[] = [pingCommand, moveallCommand];

for (const cmd of commandList) {
  commands.set(cmd.data.name, cmd);
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);

  // Set explicit online status and activity
  c.user.setPresence({
    status: 'online',
    activities: [
      {
        name: 'Baba Group | /moveall',
        type: ActivityType.Watching,
      },
    ],
  });

  // Start the Embed Builder Web Dashboard Backend
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  startDashboard(client, port);

  if (clientId) {
    const rest = new REST({ version: '10' }).setToken(token);
    try {
      console.log(`🔄 Registering ${commands.size} slash command(s)...`);
      const payload = commandList.map((cmd) => cmd.data.toJSON());

      if (guildId && guildId.trim() !== '') {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: payload });
        console.log(`✅ Guild Slash commands registered instantly for server ID: ${guildId}`);
      } else {
        await rest.put(Routes.applicationCommands(clientId), { body: payload });
        console.log('✅ Global Slash commands registered globally across all servers!');
      }
    } catch (error) {
      console.error('❌ Error registering slash commands:', error);
    }
  } else {
    console.log('⚠️ Note: CLIENT_ID is needed in .env to register slash commands.');
  }
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

client.login(token).catch((err) => {
  console.error('❌ Failed to login to Discord:', err);
});
