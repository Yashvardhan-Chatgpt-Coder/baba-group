import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types/Command.js';
import { createEmbed } from '../utils/embeds.js';

export const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with bot latency and status'),
  async execute(interaction: ChatInputCommandInteraction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true, flags: 64 });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;

    const embed = createEmbed('System Status')
      .addFields(
        { name: 'Bot Latency', value: `\`${latency}ms\``, inline: true },
        { name: 'API Latency', value: `\`${Math.round(interaction.client.ws.ping)}ms\``, inline: true }
      );

    await interaction.editReply({ content: '', embeds: [embed] });
  },
};
