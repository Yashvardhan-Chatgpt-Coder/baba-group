import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types/Command.js';

const TARGET_CHANNEL_ID = '1558064665936928929';
const MESSAGE_CONTENT = '<@&1557805108509806673> Start Flying In City And Show Activity.';
const REPEAT_COUNT = 3;

export const activityCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Broadcast activity callout to the operations channel (3 times)'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: 64 });

    try {
      const channel = await interaction.client.channels.fetch(TARGET_CHANNEL_ID);

      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        await interaction.editReply({
          content: `❌ Target channel (<#${TARGET_CHANNEL_ID}>) not found or cannot receive messages.`,
        });
        return;
      }

      for (let i = 0; i < REPEAT_COUNT; i++) {
        await (channel as any).send({
          content: MESSAGE_CONTENT,
          allowedMentions: { parse: ['roles', 'users', 'everyone'] },
        });
      }

      await interaction.editReply({
        content: `✅ Successfully broadcasted activity alert ${REPEAT_COUNT} times to <#${TARGET_CHANNEL_ID}>!`,
      });
    } catch (err: any) {
      console.error('Error executing /activity:', err);
      await interaction.editReply({
        content: `❌ Failed to send messages: ${err.message || 'Unknown error'}`,
      });
    }
  },
};
