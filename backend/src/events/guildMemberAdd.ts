import { GuildMember, EmbedBuilder, TextChannel } from 'discord.js';
import {
  STRIKE_CONFIG,
  getActiveStrikesCount,
  syncMemberStrikeRoles,
} from '../services/strikeService.js';

export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  const guild = member.guild;

  // 1. AUTO-ROLE ASSIGNMENT
  try {
    const autoRole = guild.roles.cache.get(STRIKE_CONFIG.AUTO_ROLE_ID);
    if (autoRole) {
      await member.roles.add(autoRole, 'Automatic role assigned on server join');
    } else {
      // Fetch if not cached
      const fetchedRole = await guild.roles.fetch(STRIKE_CONFIG.AUTO_ROLE_ID).catch(() => null);
      if (fetchedRole) {
        await member.roles.add(fetchedRole, 'Automatic role assigned on server join');
      } else {
        console.warn(`⚠️ Auto-role ID ${STRIKE_CONFIG.AUTO_ROLE_ID} was not found in guild.`);
      }
    }
  } catch (err: any) {
    console.error(`❌ Failed to assign auto-role to ${member.user.tag}:`, err.message);
  }

  // 2. RE-APPLY PERSISTENT STRIKES IF ANY
  try {
    const activeStrikesCount = await getActiveStrikesCount(member.id, guild.id);
    if (activeStrikesCount > 0) {
      await syncMemberStrikeRoles(guild, member, activeStrikesCount);
      console.log(`🛡️ Re-applied ${activeStrikesCount} active strike role(s) to rejoining member ${member.user.tag}`);
    }
  } catch (err: any) {
    console.error(`❌ Failed to sync strikes for rejoining member ${member.user.tag}:`, err.message);
  }

  // 3. SEND SIMPLER JOIN MESSAGE IN DISPLAY CHANNEL (1562339079213948988)
  try {
    const joinChannel =
      guild.channels.cache.get(STRIKE_CONFIG.MEMBER_JOIN_CHANNEL_ID) ||
      (await guild.channels.fetch(STRIKE_CONFIG.MEMBER_JOIN_CHANNEL_ID).catch(() => null));

    if (joinChannel && joinChannel.isTextBased()) {
      await (joinChannel as TextChannel).send({
        content: `👋 <@${member.id}> has joined the server. Welcome!`,
      });
    }
  } catch (err: any) {
    console.error(`❌ Failed to send member join message to channel ${STRIKE_CONFIG.MEMBER_JOIN_CHANNEL_ID}:`, err.message);
  }

  // 4. SEND PROFESSIONAL EMBEDDED WELCOME MESSAGE TO USER'S DM
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({
        name: `Welcome to ${guild.name}!`,
        iconURL: guild.iconURL() || undefined,
      })
      .setTitle(`Greetings, ${member.user.username}! 👋`)
      .setDescription(
        `Welcome to the official **Baba Group** Discord Server.\n\n` +
        `We are glad to have you with us. Please make sure to:\n` +
        `• Familiarize yourself with our server rules and guidelines.\n` +
        `• Check announcements for official updates and operations.\n` +
        `• Respect your fellow members and staff.\n\n` +
        `Enjoy your stay and good luck!`
      )
      .setImage(STRIKE_CONFIG.WELCOME_BANNER)
      .setFooter({
        text: `Baba Group Community • Member #${guild.memberCount}`,
      })
      .setTimestamp();

    await member.send({ embeds: [welcomeEmbed] });
  } catch (err) {
    // Member likely has DMs disabled, safe to ignore
  }
}
