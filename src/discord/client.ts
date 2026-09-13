import { Client, EmbedBuilder, GatewayIntentBits, GuildScheduledEventStatus, TextChannel } from "discord.js";
import "./types";
import * as movienight from "./commands/movienight";
import { buildAnnouncementEmbedData, channelDisplayName } from "./formatting";
import { buildResultDescription } from "./scheduledEvent";
import { PROPOSE_BUTTON_PREFIX, PROPOSE_MODAL_PREFIX } from "./proposeInteraction";
import { deleteAnnouncementMessage } from "./announcementMessage";
import type { MovieNightService, VotingClosedPayload } from "../services/movieNightService";

export function createClient(service: MovieNightService): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildScheduledEvents] });
  client.movieNightService = service;

  client.once("clientReady", (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    // Only safe to fire missed/pending vote-close jobs once the client can actually
    // fetch channels and send messages — not right after construction or login().
    service.rehydrate();
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "movienight") {
        await movienight.execute(interaction);
      } else if (interaction.isAutocomplete() && interaction.commandName === "movienight") {
        await movienight.autocomplete(interaction);
      } else if (interaction.isButton() && interaction.customId.startsWith(PROPOSE_BUTTON_PREFIX)) {
        await movienight.handleProposeButton(interaction);
      } else if (interaction.isModalSubmit() && interaction.customId.startsWith(PROPOSE_MODAL_PREFIX)) {
        await movienight.handleProposeModalSubmit(interaction);
      }
    } catch (error) {
      console.error("Error handling interaction:", error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Something went wrong handling that command.", ephemeral: true }).catch(() => {});
      }
    }
  });

  // A movie night's Discord scheduled event can also be cancelled straight from the
  // server's Events tab, bypassing `/movienight cancel` entirely — catch that here too,
  // by whichever of these two gateway events Discord happens to fire for it.
  client.on("guildScheduledEventDelete", (deletedEvent) => {
    void handleNativeScheduledEventCancellation(client, service, deletedEvent.id);
  });
  client.on("guildScheduledEventUpdate", (_oldEvent, newEvent) => {
    if (newEvent.status === GuildScheduledEventStatus.Canceled) {
      void handleNativeScheduledEventCancellation(client, service, newEvent.id);
    }
  });

  return client;
}

async function handleNativeScheduledEventCancellation(
  client: Client,
  service: MovieNightService,
  discordEventId: string,
): Promise<void> {
  const event = service.getEventByDiscordEventId(discordEventId);
  if (!event || event.status !== "open") return;

  const result = service.cancelEvent(event.id, event.creatorId);
  if (result.ok) {
    await deleteAnnouncementMessage(client, result.value);
  }
}

export function announceWinner(client: Client, payload: VotingClosedPayload): void {
  void (async () => {
    try {
      const channel = await client.channels.fetch(payload.event.channelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const embedData = buildAnnouncementEmbedData(payload);
      const embed = new EmbedBuilder()
        .setTitle(embedData.title)
        .setDescription(embedData.description)
        .addFields(embedData.fields)
        .setColor(0x5865f2);

      await channel.send({ embeds: [embed] });

      if (payload.event.discordEventId) {
        const channelName = channelDisplayName(channel);
        await channel.guild.scheduledEvents
          .edit(payload.event.discordEventId, {
            description: buildResultDescription(channelName, payload.winner?.title ?? null),
          })
          .catch((error) => console.error(`Failed to update Discord scheduled event for event ${payload.event.id}:`, error));
      }
    } catch (error) {
      console.error(`Failed to announce winner for event ${payload.event.id}:`, error);
    }
  })();
}
