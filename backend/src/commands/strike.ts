import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
} from 'discord.js';
import { Command } from '../types/Command.js';
import {
  canManageStrikes,
  issueStrike,
  removeStrike,
  STRIKE_CONFIG,
} from '../services/strikeService.js';

export const strikeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('strike')
    .setDescription('Manage disciplinary strikes for members')
    // Subcommand: issue
    .addSubcommand((sub) =>
      sub
        .setName('issue')
        .setDescription('Issue a strike to a user with reason and auto-expiry duration in days')
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setDescription('The member to issue the strike to')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('reason')
            .setDescription('Reason for the disciplinary strike')
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName('days')
            .setDescription('Duration in days before the strike expires automatically')
            .setMinValue(1)
            .setMaxValue(365)
            .setRequired(true)
        )
    )
    // Subcommand: remove
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove an active strike from a user')
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setDescription('The member to remove the strike from')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('reason')
            .setDescription('Reason for revoking the strike')
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: 'This command can only be used within the server.',
        flags: 64,
      });
      return;
    }

    const member = interaction.member as GuildMember;
    const hasPermission = await canManageStrikes(interaction.guild, member);

    if (!hasPermission) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle('🚫 Access Denied')
        .setDescription(
          `You do not have permission to manage strikes.\nOnly members with access to send messages in <#${STRIKE_CONFIG.LOG_CHANNEL_ID}> can use this command.`
        )
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], flags: 64 });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    // 1. ISSUE STRIKE
    if (subcommand === 'issue') {
      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      const days = interaction.options.getInteger('days', true);

      await interaction.deferReply({ flags: 64 });

      const result = await issueStrike(
        interaction.guild,
        targetUser,
        interaction.user,
        reason,
        days
      );

      if (!result.success) {
        await interaction.editReply({
          content: `❌ Failed to issue strike: ${result.error}`,
        });
        return;
      }

      const successEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle('✅ Strike Successfully Issued')
        .setDescription(
          `**Target User:** <@${targetUser.id}> (\`${targetUser.id}\`)\n` +
          `**Strike Level:** Strike ${result.strike?.strikeNumber}\n` +
          `**Active Strikes:** ${result.newActiveCount}\n` +
          `**Duration:** ${days} Day(s)\n` +
          `**Reason:** ${reason}\n\n` +
          `*Official notice posted to <#${STRIKE_CONFIG.LOG_CHANNEL_ID}>.*`
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });
      return;
    }

    // 2. REMOVE STRIKE
    if (subcommand === 'remove') {
      const targetUser = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);

      await interaction.deferReply({ flags: 64 });

      const result = await removeStrike(
        interaction.guild,
        targetUser,
        interaction.user,
        reason
      );

      if (!result.success) {
        await interaction.editReply({
          content: `❌ ${result.error}`,
        });
        return;
      }

      const successEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle('✅ Strike Successfully Removed')
        .setDescription(
          `**Target User:** <@${targetUser.id}> (\`${targetUser.id}\`)\n` +
          `**Strike Revoked:** Strike ${result.strike?.strikeNumber}\n` +
          `**Active Strikes Remaining:** ${result.remainingActiveCount}\n` +
          `**Reason:** ${reason}\n\n` +
          `*Official notice posted to <#${STRIKE_CONFIG.LOG_CHANNEL_ID}>.*`
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });
      return;
    }
  },
};
