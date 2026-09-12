import { Client, EmbedBuilder, GatewayIntentBits, TextChannel } from "discord.js";
import "./types";
import * as movienight from "./commands/movienight";
import { buildAnnouncementEmbedData } from "./formatting";
import type { MovieNightService, VotingClosedPayload } from "../services/movieNightService";

export function createClient(service: MovieNightService): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
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
      }
    } catch (error) {
      console.error("Error handling interaction:", error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Something went wrong handling that command.", ephemeral: true }).catch(() => {});
      }
    }
  });

  return client;
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
    } catch (error) {
      console.error(`Failed to announce winner for event ${payload.event.id}:`, error);
    }
  })();
}
