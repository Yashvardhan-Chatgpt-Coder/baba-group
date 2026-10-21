import {
  Guild,
  GuildMember,
  Role,
  User,
  EmbedBuilder,
  TextChannel,
  PermissionFlagsBits,
  Client,
} from 'discord.js';
import { Strike, IStrike } from '../models/Strike.js';

export const STRIKE_CONFIG = {
  LOG_CHANNEL_ID: '1562332987989958676',
  MEMBER_JOIN_CHANNEL_ID: '1562339079213948988',
  AUTO_ROLE_ID: '1557810934779744347',
  ISSUED_BANNER: 'https://i.imgur.com/EJ5T5vs.png',
  REMOVED_BANNER: 'https://i.imgur.com/RH8U4AN.png',
  WELCOME_BANNER: 'https://i.imgur.com/kZ0eUqz.png',
  ROLES: [
    { level: 1, name: 'Strike 1', color: 0xff6b6b }, // Light Red
    { level: 2, name: 'Strike 2', color: 0xe53935 }, // Medium Red
    { level: 3, name: 'Strike 3', color: 0x8b0000 }, // Dark Red
  ],
};

/**
 * Checks if a member has permission to run strike commands.
 * Permission is granted if the member has Administrator or can send messages in the log channel.
 */
export async function canManageStrikes(guild: Guild, member: GuildMember): Promise<boolean> {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  try {
    const channel =
      guild.channels.cache.get(STRIKE_CONFIG.LOG_CHANNEL_ID) ||
      (await guild.channels.fetch(STRIKE_CONFIG.LOG_CHANNEL_ID).catch(() => null));

    if (!channel || !channel.isTextBased()) {
      return false;
    }

    const permissions = channel.permissionsFor(member);
    return Boolean(permissions && permissions.has(PermissionFlagsBits.SendMessages));
  } catch (error) {
    console.error('Error checking strike permissions:', error);
    return false;
  }
}

/**
 * Retrieves or creates the Strike roles in the guild.
 */
export async function getOrCreateStrikeRoles(guild: Guild): Promise<Map<number, Role>> {
  const roleMap = new Map<number, Role>();

  for (const roleDef of STRIKE_CONFIG.ROLES) {
    let role = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === roleDef.name.toLowerCase()
    );

    if (!role) {
      try {
        role = await guild.roles.create({
          name: roleDef.name,
          color: roleDef.color,
          reason: 'Auto-created Strike Role for Baba Group Strike Management System',
        });
        console.log(`✅ Created missing role: ${roleDef.name} (${role.id})`);
      } catch (err) {
        console.error(`❌ Failed to create role ${roleDef.name}:`, err);
      }
    }

    if (role) {
      roleMap.set(roleDef.level, role);
    }
  }

  return roleMap;
}

/**
 * Synchronizes a member's strike roles based on their count of active strikes.
 * - 0 active: No strike roles
 * - 1 active: Strike 1
 * - 2 active: Strike 1 + Strike 2
 * - 3+ active: Strike 1 + Strike 2 + Strike 3
 */
export async function syncMemberStrikeRoles(guild: Guild, member: GuildMember, activeCount: number): Promise<void> {
  try {
    const roles = await getOrCreateStrikeRoles(guild);
    const role1 = roles.get(1);
    const role2 = roles.get(2);
    const role3 = roles.get(3);

    const rolesToAdd: string[] = [];
    const rolesToRemove: string[] = [];

    if (activeCount >= 1 && role1) rolesToAdd.push(role1.id);
    else if (role1 && member.roles.cache.has(role1.id)) rolesToRemove.push(role1.id);

    if (activeCount >= 2 && role2) rolesToAdd.push(role2.id);
    else if (role2 && member.roles.cache.has(role2.id)) rolesToRemove.push(role2.id);

    if (activeCount >= 3 && role3) rolesToAdd.push(role3.id);
    else if (role3 && member.roles.cache.has(role3.id)) rolesToRemove.push(role3.id);

    if (rolesToAdd.length > 0) {
      await member.roles.add(rolesToAdd, 'Strike level assigned/synchronized').catch((err) => {
        console.warn(`Could not add strike roles to member ${member.id}:`, err.message);
      });
    }

    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove, 'Strike expired/removed').catch((err) => {
        console.warn(`Could not remove strike roles from member ${member.id}:`, err.message);
      });
    }
  } catch (error) {
    console.error(`Error synchronizing strike roles for ${member.id}:`, error);
  }
}

/**
 * Gets count of active strikes for a user in a guild.
 */
export async function getActiveStrikesCount(userId: string, guildId: string): Promise<number> {
  return Strike.countDocuments({ userId, guildId, status: 'ACTIVE' });
}

/**
 * Issues a strike to a user.
 */
export async function issueStrike(
  guild: Guild,
  targetUser: User,
  issuer: User,
  reason: string,
  durationDays: number
): Promise<{ success: boolean; strike?: IStrike; error?: string; newActiveCount: number }> {
  try {
    const currentActiveCount = await getActiveStrikesCount(targetUser.id, guild.id);
    const newStrikeNumber = currentActiveCount + 1;

    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    const strike = new Strike({
      userId: targetUser.id,
      guildId: guild.id,
      strikeNumber: newStrikeNumber,
      reason,
      issuerId: issuer.id,
      issuerTag: issuer.tag || issuer.username,
      durationDays,
      issuedAt: new Date(),
      expiresAt,
      status: 'ACTIVE',
    });

    await strike.save();

    const newActiveCount = currentActiveCount + 1;

    // Synchronize roles if member is in guild
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (member) {
      await syncMemberStrikeRoles(guild, member, newActiveCount);
    }

    // Determine embed color based on strike level
    let embedColor = 0xff6b6b; // Light red
    if (newStrikeNumber === 2) embedColor = 0xe53935; // Medium red
    if (newStrikeNumber >= 3) embedColor = 0x8b0000; // Dark red

    // Format Expiry Timestamps
    const expireUnix = Math.floor(expiresAt.getTime() / 1000);

    // Send professional embed in the strike log channel
    const logChannel =
      guild.channels.cache.get(STRIKE_CONFIG.LOG_CHANNEL_ID) ||
      (await guild.channels.fetch(STRIKE_CONFIG.LOG_CHANNEL_ID).catch(() => null));

    if (logChannel && logChannel.isTextBased()) {
      const strikeEmbed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({
          name: 'BABA GROUP • DISCIPLINARY ACTION',
          iconURL: guild.iconURL() || undefined,
        })
        .setTitle(`⚠️ STRIKE ISSUED — STRIKE ${newStrikeNumber}`)
        .setDescription(
          `A disciplinary strike has been officially issued to <@${targetUser.id}>.\n\n` +
          `**• Target User:** <@${targetUser.id}> (\`${targetUser.id}\`)\n` +
          `**• Issued By:** <@${issuer.id}>\n` +
          `**• Strike Level:** Strike ${newStrikeNumber} (Active: **${newActiveCount}**)\n` +
          `**• Duration:** **${durationDays} Day(s)**\n` +
          `**• Expiration Date:** <t:${expireUnix}:F> (<t:${expireUnix}:R>)\n` +
          `**• Reason:** ${reason}\n\n` +
          `> ⚠️ **Notice:** Accumulating **3 strikes** will result in an immediate **demotion**.`
        )
        .setImage(STRIKE_CONFIG.ISSUED_BANNER)
        .setFooter({
          text: `Baba Group Security • User ID: ${targetUser.id}`,
        })
        .setTimestamp();

      await (logChannel as TextChannel).send({
        content: `🚨 **Disciplinary Notice:** <@${targetUser.id}> has received Strike ${newStrikeNumber}.`,
        embeds: [strikeEmbed],
      });
    }

    return { success: true, strike, newActiveCount };
  } catch (error: any) {
    console.error('Error issuing strike:', error);
    return { success: false, error: error.message || 'Unknown error', newActiveCount: 0 };
  }
}

/**
 * Removes the most recent active strike (or specific strike) for a user.
 */
export async function removeStrike(
  guild: Guild,
  targetUser: User,
  moderator: User,
  reason: string
): Promise<{ success: boolean; strike?: IStrike; error?: string; remainingActiveCount: number }> {
  try {
    const activeStrikes = await Strike.find({
      userId: targetUser.id,
      guildId: guild.id,
      status: 'ACTIVE',
    }).sort({ issuedAt: -1 });

    if (activeStrikes.length === 0) {
      return {
        success: false,
        error: `User <@${targetUser.id}> has no active strikes to remove.`,
        remainingActiveCount: 0,
      };
    }

    const strikeToRemove = activeStrikes[0];
    strikeToRemove.status = 'REMOVED';
    strikeToRemove.removedAt = new Date();
    strikeToRemove.removedBy = moderator.id;
    strikeToRemove.removeReason = reason;

    await strikeToRemove.save();

    const remainingActiveCount = activeStrikes.length - 1;

    // Update member roles
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (member) {
      await syncMemberStrikeRoles(guild, member, remainingActiveCount);
    }

    // Send strike removed embed to log channel
    const logChannel =
      guild.channels.cache.get(STRIKE_CONFIG.LOG_CHANNEL_ID) ||
      (await guild.channels.fetch(STRIKE_CONFIG.LOG_CHANNEL_ID).catch(() => null));

    if (logChannel && logChannel.isTextBased()) {
      const removedEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setAuthor({
          name: 'BABA GROUP • DISCIPLINARY UPDATE',
          iconURL: guild.iconURL() || undefined,
        })
        .setTitle('🛡️ STRIKE REMOVED')
        .setDescription(
          `A disciplinary strike has been officially revoked for <@${targetUser.id}>.\n\n` +
          `**• Target User:** <@${targetUser.id}> (\`${targetUser.id}\`)\n` +
          `**• Revoked By:** <@${moderator.id}>\n` +
          `**• Strike Removed:** Strike ${strikeToRemove.strikeNumber}\n` +
          `**• Active Strikes Remaining:** **${remainingActiveCount}**\n` +
          `**• Reason:** ${reason}`
        )
        .setImage(STRIKE_CONFIG.REMOVED_BANNER)
        .setFooter({
          text: `Baba Group Security • User ID: ${targetUser.id}`,
        })
        .setTimestamp();

      await (logChannel as TextChannel).send({
        content: `🛡️ **Disciplinary Update:** Strike removed for <@${targetUser.id}>.`,
        embeds: [removedEmbed],
      });
    }

    return { success: true, strike: strikeToRemove, remainingActiveCount };
  } catch (error: any) {
    console.error('Error removing strike:', error);
    return { success: false, error: error.message || 'Unknown error', remainingActiveCount: 0 };
  }
}

/**
 * Periodically checks for expired strikes and automatically removes roles and sends log embeds.
 */
export async function processExpiredStrikes(client: Client): Promise<void> {
  try {
    const now = new Date();
    const expiredStrikes = await Strike.find({
      status: 'ACTIVE',
      expiresAt: { $lte: now },
    });

    if (expiredStrikes.length === 0) return;

    for (const strike of expiredStrikes) {
      strike.status = 'EXPIRED';
      strike.removedAt = now;
      strike.removedBy = 'AUTOMATIC';
      strike.removeReason = `Strike auto-expired after ${strike.durationDays} day(s)`;
      await strike.save();

      const guild = client.guilds.cache.get(strike.guildId);
      if (!guild) continue;

      const remainingActiveCount = await getActiveStrikesCount(strike.userId, strike.guildId);

      const member = await guild.members.fetch(strike.userId).catch(() => null);
      if (member) {
        await syncMemberStrikeRoles(guild, member, remainingActiveCount);
      }

      // Send embed to log channel
      const logChannel =
        guild.channels.cache.get(STRIKE_CONFIG.LOG_CHANNEL_ID) ||
        (await guild.channels.fetch(STRIKE_CONFIG.LOG_CHANNEL_ID).catch(() => null));

      if (logChannel && logChannel.isTextBased()) {
        const expiredEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setAuthor({
            name: 'BABA GROUP • AUTOMATIC EXPIRATION',
            iconURL: guild.iconURL() || undefined,
          })
          .setTitle('🛡️ STRIKE EXPIRED (AUTO-REMOVED)')
          .setDescription(
            `A disciplinary strike duration has completed and expired for <@${strike.userId}>.\n\n` +
            `**• Target User:** <@${strike.userId}> (\`${strike.userId}\`)\n` +
            `**• Strike Level Expired:** Strike ${strike.strikeNumber}\n` +
            `**• Active Strikes Remaining:** **${remainingActiveCount}**\n` +
            `**• Duration Served:** ${strike.durationDays} Day(s)\n` +
            `**• Original Reason:** ${strike.reason}\n` +
            `**• Expiration Reason:** Automatic duration timer reached.`
          )
          .setImage(STRIKE_CONFIG.REMOVED_BANNER)
          .setFooter({
            text: `Baba Group Auto-Moderation • User ID: ${strike.userId}`,
          })
          .setTimestamp();

        await (logChannel as TextChannel).send({
          content: `🛡️ **Disciplinary Update:** Strike ${strike.strikeNumber} expired for <@${strike.userId}>.`,
          embeds: [expiredEmbed],
        });
      }
    }
  } catch (error) {
    console.error('Error processing expired strikes:', error);
  }
}

/**
 * Gets all punishment records for a specific user.
 */
export async function getUserPunishments(userId: string, guildId: string): Promise<IStrike[]> {
  return Strike.find({ userId, guildId }).sort({ issuedAt: -1 });
}

/**
 * Gets all currently active punishments in the guild.
 */
export async function getAllActivePunishments(guildId: string): Promise<IStrike[]> {
  return Strike.find({ guildId, status: 'ACTIVE' }).sort({ expiresAt: 1 });
}
