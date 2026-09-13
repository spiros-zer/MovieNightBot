import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

/** customId prefixes for the propose button/modal pair; suffixed with the movie night event id. */
export const PROPOSE_BUTTON_PREFIX = "mn-propose:";
export const PROPOSE_MODAL_PREFIX = "mn-propose-modal:";
export const PROPOSE_MODAL_TITLE_INPUT_ID = "title";

export function buildProposeButtonRow(eventId: string): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(`${PROPOSE_BUTTON_PREFIX}${eventId}`)
    .setLabel("🎬 Propose a Movie")
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

/** Extracts the event id from a propose button's customId, or null if it isn't one. */
export function parseProposeButtonId(customId: string): string | null {
  return customId.startsWith(PROPOSE_BUTTON_PREFIX) ? customId.slice(PROPOSE_BUTTON_PREFIX.length) : null;
}

export function buildProposeModal(eventId: string): ModalBuilder {
  const titleInput = new TextInputBuilder()
    .setCustomId(PROPOSE_MODAL_TITLE_INPUT_ID)
    .setLabel("Movie title")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(`${PROPOSE_MODAL_PREFIX}${eventId}`)
    .setTitle("Propose a Movie")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput));
}

/** Extracts the event id from a propose modal's customId, or null if it isn't one. */
export function parseProposeModalId(customId: string): string | null {
  return customId.startsWith(PROPOSE_MODAL_PREFIX) ? customId.slice(PROPOSE_MODAL_PREFIX.length) : null;
}
