import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  GuildTextBasedChannel,
  EmbedBuilder,
} from 'discord.js';
import { Command } from '../types/Command.js';
import {
  getBlacklist,
  addBlacklistName,
  removeBlacklistName,
  buildBlacklistPayload,
  BLACKLIST_EMBED_COLOR,
} from '../utils/blacklistStore.js';

export const blacklistCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Manage the official Baba Group Blacklist Registry (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // Subcommand: Add Name
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a new individual to the blacklist')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Full character name to add')
            .setRequired(true)
        )
    )
    // Subcommand: Remove Name
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove an individual from the blacklist by name or number')
        .addStringOption((opt) =>
          opt
            .setName('target')
            .setDescription('Character name or number (e.g. 05 or Jeetu Dappardan)')
            .setRequired(true)
        )
    )
    // Subcommand: Post/Send Embed to Channel
    .addSubcommand((sub) =>
      sub
        .setName('post')
        .setDescription('Send the official Blacklist Embed to a specific channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('The channel where the blacklist should be posted')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    // Subcommand: View/List current names
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View the current blacklist and total count')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // Enforce administrator permissions
    const member = interaction.member;
    const permissions = interaction.memberPermissions;
    if (!permissions || !permissions.has(PermissionFlagsBits.Administrator)) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle('🚫 Access Denied')
        .setDescription('You must have **Administrator** permissions to use blacklist management commands.')
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], flags: 64 });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    // 1. ADD NAME
    if (subcommand === 'add') {
      const name = interaction.options.getString('name', true).trim();
      const result = addBlacklistName(name);

      if (!result.success) {
        const existEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle('⚠️ Already on Blacklist')
          .setDescription(`**${name}** is already present on the blacklist at position **#${String(result.index).padStart(2, '0')}**.`)
          .setTimestamp();

        await interaction.reply({ embeds: [existEmbed], flags: 64 });
        return;
      }

      const addEmbed = new EmbedBuilder()
        .setColor(BLACKLIST_EMBED_COLOR)
        .setTitle('✅ Blacklist Updated (Name Added)')
        .setDescription(
          `Added **${name}** to the blacklist.\n\n` +
          `• **New Position:** \`${String(result.index).padStart(2, '0')}\`\n` +
          `• **Total Blacklisted:** \`${result.list.length}\`\n\n` +
          `*All numbers have been automatically rearranged.* Use \`/blacklist post\` to broadcast the updated notice.`
        )
        .setFooter({ text: 'Baba Group • Blacklist Registry' })
        .setTimestamp();

      await interaction.reply({ embeds: [addEmbed] });
      return;
    }

    // 2. REMOVE NAME
    if (subcommand === 'remove') {
      const target = interaction.options.getString('target', true).trim();
      const result = removeBlacklistName(target);

      if (!result.success) {
        const notFoundEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle('❌ Name Not Found')
          .setDescription(`Could not find any entry matching **"${target}"** on the blacklist. Please check the spelling or number.`)
          .setTimestamp();

        await interaction.reply({ embeds: [notFoundEmbed], flags: 64 });
        return;
      }

      const removeEmbed = new EmbedBuilder()
        .setColor(BLACKLIST_EMBED_COLOR)
        .setTitle('✅ Blacklist Updated (Name Removed)')
        .setDescription(
          `Successfully removed **${result.removedName}** from the blacklist.\n\n` +
          `• **Remaining Blacklisted:** \`${result.list.length}\`\n\n` +
          `*All numbering has been automatically rearranged and sequentialized.* Use \`/blacklist post\` to broadcast the updated notice.`
        )
        .setFooter({ text: 'Baba Group • Blacklist Registry' })
        .setTimestamp();

      await interaction.reply({ embeds: [removeEmbed] });
      return;
    }

    // 3. POST / SEND EMBED TO CHANNEL
    if (subcommand === 'post') {
      const channel = interaction.options.getChannel('channel', true) as GuildTextBasedChannel;

      if (!channel || !channel.isTextBased()) {
        await interaction.reply({
          content: '❌ Invalid target channel selected. Please choose a text or announcement channel.',
          flags: 64,
        });
        return;
      }

      await interaction.deferReply({ flags: 64 });

      try {
        const payload = buildBlacklistPayload(interaction.guild?.iconURL());
        await channel.send(payload);

        const confirmEmbed = new EmbedBuilder()
          .setColor(BLACKLIST_EMBED_COLOR)
          .setTitle('✅ Blacklist Announcement Posted')
          .setDescription(`The official Baba Group Blacklist Notice has been posted to <#${channel.id}>.`)
          .setFooter({ text: 'Baba Group • Blacklist Registry' })
          .setTimestamp();

        await interaction.editReply({ embeds: [confirmEmbed] });
      } catch (err: any) {
        console.error('Error posting blacklist to channel:', err);
        await interaction.editReply({
          content: `❌ Failed to post blacklist to channel: ${err.message || 'Missing channel permissions'}`,
        });
      }
      return;
    }

    // 4. VIEW CURRENT BLACKLIST
    if (subcommand === 'view') {
      const list = getBlacklist();
      const payload = buildBlacklistPayload(interaction.guild?.iconURL());

      await interaction.reply({
        content: `**[Admin Preview]** Current Baba Group Blacklist (${list.length} total individuals):`,
        embeds: payload.embeds,
        flags: 64,
      });
      return;
    }
  },
};
