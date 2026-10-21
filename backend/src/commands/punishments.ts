import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
} from 'discord.js';
import { Command } from '../types/Command.js';
import {
  canManageStrikes,
  getUserPunishments,
  getAllActivePunishments,
  STRIKE_CONFIG,
} from '../services/strikeService.js';

export const punishmentsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('punishments')
    .setDescription('View member punishment history and ongoing active punishments')
    // Subcommand: history
    .addSubcommand((sub) =>
      sub
        .setName('history')
        .setDescription('View full strike and punishment history for a specific member (Ephemeral)')
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setDescription('The member whose punishment history you want to check')
            .setRequired(true)
        )
    )
    // Subcommand: active
    .addSubcommand((sub) =>
      sub
        .setName('active')
        .setDescription('View all currently ongoing active strikes across the server (Ephemeral)')
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
          `You do not have permission to view punishment records.\nOnly members with access to send messages in <#${STRIKE_CONFIG.LOG_CHANNEL_ID}> can use this command.`
        )
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], flags: 64 });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    // 1. USER PUNISHMENT HISTORY
    if (subcommand === 'history') {
      const targetUser = interaction.options.getUser('user', true);
      await interaction.deferReply({ flags: 64 });

      const history = await getUserPunishments(targetUser.id, interaction.guild.id);

      if (history.length === 0) {
        const cleanEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(`📋 Disciplinary History • ${targetUser.username}`)
          .setDescription(`User <@${targetUser.id}> (\`${targetUser.id}\`) has a completely clean record with **0** recorded strikes.`)
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp();

        await interaction.editReply({ embeds: [cleanEmbed] });
        return;
      }

      const activeCount = history.filter((s) => s.status === 'ACTIVE').length;
      const historyLines = history.slice(0, 15).map((s, idx) => {
        const issuedUnix = Math.floor(new Date(s.issuedAt).getTime() / 1000);
        const expireUnix = Math.floor(new Date(s.expiresAt).getTime() / 1000);

        let statusEmoji = '🟢 Active';
        if (s.status === 'EXPIRED') statusEmoji = '⚪ Expired';
        if (s.status === 'REMOVED') statusEmoji = '🔵 Revoked';

        let line = `**#${idx + 1} | Strike ${s.strikeNumber}** [${statusEmoji}]\n` +
          `• **Reason:** ${s.reason}\n` +
          `• **Issued By:** <@${s.issuerId}> on <t:${issuedUnix}:d>\n` +
          `• **Duration:** ${s.durationDays} Day(s) (Expires: <t:${expireUnix}:R>)`;

        if (s.status === 'REMOVED' && s.removeReason) {
          line += `\n• **Removal Reason:** ${s.removeReason} (by <@${s.removedBy}>)`;
        }

        return line;
      });

      const historyEmbed = new EmbedBuilder()
        .setColor(activeCount > 0 ? 0xe53935 : 0x2b2d31)
        .setAuthor({
          name: `Punishment History • ${targetUser.username}`,
          iconURL: targetUser.displayAvatarURL(),
        })
        .setTitle(`Disciplinary Record for ${targetUser.username}`)
        .setDescription(
          `**Target User:** <@${targetUser.id}> (\`${targetUser.id}\`)\n` +
          `**Total Recorded Records:** ${history.length} | **Currently Active:** ${activeCount}\n\n` +
          historyLines.join('\n\n')
        )
        .setFooter({
          text: `Baba Group Security • Showing ${Math.min(history.length, 15)} of ${history.length} entries`,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [historyEmbed] });
      return;
    }

    // 2. ACTIVE ONGOING PUNISHMENTS
    if (subcommand === 'active') {
      await interaction.deferReply({ flags: 64 });

      const activeStrikes = await getAllActivePunishments(interaction.guild.id);

      if (activeStrikes.length === 0) {
        const noActiveEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle('🛡️ Ongoing Active Punishments')
          .setDescription('There are currently **no ongoing active strikes** in the server.')
          .setTimestamp();

        await interaction.editReply({ embeds: [noActiveEmbed] });
        return;
      }

      const activeLines = activeStrikes.slice(0, 20).map((s, idx) => {
        const expireUnix = Math.floor(new Date(s.expiresAt).getTime() / 1000);
        return (
          `**${idx + 1}. <@${s.userId}>** (\`${s.userId}\`)\n` +
          `• **Level:** Strike ${s.strikeNumber}\n` +
          `• **Reason:** ${s.reason}\n` +
          `• **Issued By:** <@${s.issuerId}>\n` +
          `• **Expires:** <t:${expireUnix}:R> (<t:${expireUnix}:d>)`
        );
      });

      const activeEmbed = new EmbedBuilder()
        .setColor(0xe53935)
        .setTitle(`🛡️ Active Ongoing Punishments (${activeStrikes.length})`)
        .setDescription(
          `List of all members with currently active strikes:\n\n` +
          activeLines.join('\n\n')
        )
        .setFooter({
          text: `Baba Group Security • Showing ${Math.min(activeStrikes.length, 20)} of ${activeStrikes.length} active strikes`,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [activeEmbed] });
      return;
    }
  },
};
