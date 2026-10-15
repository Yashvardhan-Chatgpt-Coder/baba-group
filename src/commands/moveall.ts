import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  VoiceBasedChannel,
  GuildMember,
  PermissionFlagsBits,
} from 'discord.js';
import { Command } from '../types/Command.js';
import { createEmbed, createNoticeEmbed } from '../utils/embeds.js';

// Allowed Role IDs that can execute /moveall
const ALLOWED_ROLE_IDS = [
  '1557803080920338492',
  '1557803303029579916',
];

export const moveallCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('moveall')
    .setDescription('Mass move all members from one Voice Channel to another')
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addChannelOption((option) =>
      option
        .setName('target')
        .setDescription('Target voice channel to move members TO')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName('source')
        .setDescription('Source voice channel to move members FROM (Optional if you are in a VC)')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
      const embed = createNoticeEmbed(
        'Server Only Command',
        'This command can only be executed inside a server.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    const member = interaction.member as GuildMember;

    // Check allowed roles
    const hasAllowedRole = member.roles.cache.some((role) => ALLOWED_ROLE_IDS.includes(role.id));

    if (!hasAllowedRole) {
      const deniedEmbed = createNoticeEmbed(
        'Access Denied',
        'You do not possess the required role permissions to execute this command.'
      );
      await interaction.reply({ embeds: [deniedEmbed], flags: 64 });
      return;
    }

    const targetChannel = interaction.options.getChannel('target') as VoiceBasedChannel;
    let sourceChannel = interaction.options.getChannel('source') as VoiceBasedChannel | null;

    // If source channel is not specified, attempt to use the executor's current VC
    if (!sourceChannel) {
      const executorVoiceChannel = member.voice?.channel;
      if (!executorVoiceChannel) {
        const noVoiceEmbed = createNoticeEmbed(
          'Source VC Required',
          'You are not currently in any voice channel.\n\nPlease select the `source` voice channel parameter when running the command.'
        );
        await interaction.reply({ embeds: [noVoiceEmbed], flags: 64 });
        return;
      }
      sourceChannel = executorVoiceChannel as VoiceBasedChannel;
    }

    if (sourceChannel.id === targetChannel.id) {
      const sameChannelEmbed = createNoticeEmbed(
        'Invalid Operation',
        'Source and target voice channels cannot be identical.'
      );
      await interaction.reply({ embeds: [sameChannelEmbed], flags: 64 });
      return;
    }

    const membersToMove = Array.from(sourceChannel.members.values());

    if (membersToMove.length === 0) {
      const emptyEmbed = createNoticeEmbed(
        'Channel Empty',
        `No members were found in <#${sourceChannel.id}> to move.`
      );
      await interaction.reply({ embeds: [emptyEmbed], flags: 64 });
      return;
    }

    await interaction.deferReply();

    let movedCount = 0;
    let failedCount = 0;

    // Concurrently move all members to target voice channel
    const movePromises = membersToMove.map(async (m) => {
      try {
        await m.voice.setChannel(targetChannel);
        movedCount++;
      } catch (err) {
        console.error(`Failed to move member ${m.user.tag}:`, err);
        failedCount++;
      }
    });

    await Promise.allSettled(movePromises);

    const resultEmbed = createEmbed('Voice Channel Relocation')
      .addFields(
        { name: 'Source Channel', value: `<#${sourceChannel.id}>`, inline: true },
        { name: 'Target Channel', value: `<#${targetChannel.id}>`, inline: true },
        { name: 'Members Moved', value: `**${movedCount}**`, inline: true }
      );

    if (failedCount > 0) {
      resultEmbed.addFields({ name: 'Failures', value: `**${failedCount}** member(s) could not be moved.`, inline: false });
    }

    await interaction.editReply({ embeds: [resultEmbed] });
  },
};
