import { EmbedBuilder, ButtonStyle } from 'discord.js';

/**
 * Professional Discord native color palette:
 * Primary: 0x2B2D31 (Discord Dark Theme / Stealth Dark)
 * Accent/Highlight: 0xFFFFFF (Clean White)
 * NO fancy / bright / red colors allowed as per design guidelines.
 */
export const EMBED_COLORS = {
  DEFAULT: 0x2B2D31,
  WHITE: 0xFFFFFF,
  DARK: 0x1E1F22,
};

/**
 * Creates a standardized professional embed
 */
export function createEmbed(title?: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.DEFAULT)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  return embed;
}

/**
 * Creates a professional notice/error embed using dark stealth formatting
 */
export function createNoticeEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.DARK)
    .setTitle(`▪ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

/**
 * Allowed button styles for professional UI (Black & White or Discord Native Dark)
 */
export const ALLOWED_BUTTON_STYLES = {
  SECONDARY: ButtonStyle.Secondary, // Dark Gray / Black
  PRIMARY: ButtonStyle.Primary,     // Discord Blurple / Native
  LINK: ButtonStyle.Link,           // URL Link
};
