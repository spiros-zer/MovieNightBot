import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import "../types";
import { isValidTimeZone, parseEventDateTime } from "../dateTimeParsing";
import { discordTimestamp } from "../formatting";
import { buildScheduledEventOptions } from "../scheduledEvent";
import { deleteAnnouncementMessage } from "../announcementMessage";
import {
  buildProposeButtonRow,
  buildProposeModal,
  parseProposeButtonId,
  parseProposeModalId,
  PROPOSE_MODAL_TITLE_INPUT_ID,
} from "../proposeInteraction";
import type { MovieNightService, ServiceResult } from "../../services/movieNightService";
import type { MovieProposal } from "../../domain/types";

export const data = new SlashCommandBuilder()
  .setName("movienight")
  .setDescription("Organize a movie night: schedule it, propose movies, and vote.")
  .addSubcommand((sub) =>
    sub
      .setName("schedule")
      .setDescription("Schedule a new movie night event.")
      .addStringOption((opt) => opt.setName("date").setDescription("This year's date, in MM-DD format, e.g. 12-25").setRequired(true))
      .addStringOption((opt) =>
        opt.setName("time").setDescription("24-hour time the movie starts, in HH:MM format").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("timezone")
          .setDescription('IANA time zone, e.g. "Europe/Athens" (default: this server\'s configured default)')
          .setRequired(false),
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel to announce and run the movie night in (default: this channel)")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("propose")
      .setDescription("Propose a movie for a scheduled movie night.")
      .addStringOption((opt) =>
        opt.setName("event").setDescription("Which movie night").setRequired(true).setAutocomplete(true),
      )
      .addStringOption((opt) => opt.setName("title").setDescription("Movie title").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("vote")
      .setDescription("Vote for one of the proposed movies.")
      .addStringOption((opt) =>
        opt.setName("event").setDescription("Which movie night").setRequired(true).setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt.setName("movie").setDescription("Which proposed movie").setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("Show proposals and live vote standings for a movie night.")
      .addStringOption((opt) =>
        opt.setName("event").setDescription("Which movie night").setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cancel")
      .setDescription("Cancel a movie night you scheduled.")
      .addStringOption((opt) =>
        opt.setName("event").setDescription("Which movie night").setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("config")
      .setDescription("(Admin) Configure movie night rules for this server.")
      .addIntegerOption((opt) =>
        opt.setName("max-proposals").setDescription("Max movies each person may propose per event").setMinValue(1).setRequired(false),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("close-before-minutes")
          .setDescription("Minutes before the event when voting closes and the winner is announced")
          .setMinValue(1)
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("timezone")
          .setDescription('Default IANA time zone for scheduling, e.g. "Europe/Athens"')
          .setRequired(false),
      ),
  );

function eventLabel(event: { eventTime: Date }, index: number): string {
  return `Movie night #${index + 1} — ${event.eventTime.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const service: MovieNightService = interaction.client.movieNightService;
  const focused = interaction.options.getFocused(true);
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.respond([]);
    return;
  }

  if (focused.name === "event") {
    const events = service.listOpenEvents(guildId);
    const query = focused.value.toLowerCase();
    const choices = events
      .map((event, index) => ({ name: eventLabel(event, index), value: event.id }))
      .filter((choice) => choice.name.toLowerCase().includes(query))
      .slice(0, 25);
    await interaction.respond(choices);
    return;
  }

  if (focused.name === "movie") {
    const eventId = interaction.options.getString("event");
    if (!eventId) {
      await interaction.respond([]);
      return;
    }
    const proposals = service.listProposals(eventId);
    const query = focused.value.toLowerCase();
    const choices = proposals
      .filter((p) => p.title.toLowerCase().includes(query))
      .slice(0, 25)
      .map((p) => ({ name: p.title.slice(0, 100), value: p.id }));
    await interaction.respond(choices);
    return;
  }

  await interaction.respond([]);
}

async function handleSchedule(interaction: ChatInputCommandInteraction, service: MovieNightService): Promise<void> {
  const date = interaction.options.getString("date", true);
  const time = interaction.options.getString("time", true);
  const timezone = interaction.options.getString("timezone") ?? service.getGuildConfig(interaction.guildId!).defaultTimeZone;
  const channel = interaction.options.getChannel("channel") ?? interaction.channel;

  if (!channel || !("send" in channel)) {
    await interaction.reply({ content: "Pick a text channel for the movie night to run in.", ephemeral: true });
    return;
  }

  const parsed = parseEventDateTime(date, time, timezone);
  if (!parsed.ok) {
    await interaction.reply({ content: `❌ ${parsed.reason}`, ephemeral: true });
    return;
  }

  const result = service.createEvent({
    guildId: interaction.guildId!,
    channelId: channel.id,
    creatorId: interaction.user.id,
    eventTime: parsed.value,
  });

  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    return;
  }

  const event = result.value;
  const embed = new EmbedBuilder()
    .setTitle("🎬 Movie night scheduled!")
    .setDescription(
      `Scheduled by <@${event.creatorId}> for ${discordTimestamp(event.eventTime)}.\n\n` +
        `Propose a movie with \`/movienight propose\` or vote with \`/movienight vote\`.\n` +
        `Voting closes ${discordTimestamp(event.votingCloseTime)} (${discordTimestamp(event.votingCloseTime, "R")}), and the winner is announced automatically.`,
    )
    .setColor(0x5865f2);

  const announcement = await channel.send({ embeds: [embed], components: [buildProposeButtonRow(event.id)] });
  service.setAnnouncementMessageId(event.id, announcement.id);
  try {
    await announcement.pin();
  } catch (error) {
    console.error(`Failed to pin announcement message for movie night ${event.id}:`, error);
  }

  const channelName = "name" in channel && typeof channel.name === "string" ? channel.name : "the event channel";
  let addedToEvents = false;
  if (interaction.guild) {
    try {
      const scheduledEvent = await interaction.guild.scheduledEvents.create(buildScheduledEventOptions(event, channelName));
      service.setDiscordEventId(event.id, scheduledEvent.id);
      addedToEvents = true;
    } catch (error) {
      console.error(`Failed to create Discord scheduled event for movie night ${event.id}:`, error);
    }
  }

  await interaction.reply({
    content:
      `✅ Movie night scheduled for ${discordTimestamp(event.eventTime)} in <#${channel.id}>.` +
      (addedToEvents ? " It's also on this server's **Events** tab." : ""),
    ephemeral: true,
  });
}

function proposeReplyContent(result: ServiceResult<MovieProposal>): string {
  return result.ok ? `🎬 Proposed **${result.value.title}** for this movie night!` : `❌ ${result.reason}`;
}

async function handlePropose(interaction: ChatInputCommandInteraction, service: MovieNightService): Promise<void> {
  const eventId = interaction.options.getString("event", true);
  const title = interaction.options.getString("title", true);

  const result = service.proposeMovie({ eventId, userId: interaction.user.id, title });
  await interaction.reply({ content: proposeReplyContent(result), ephemeral: true });
}

/** A user clicked the "Propose a Movie" button under a movie night announcement — open the title modal. */
export async function handleProposeButton(interaction: ButtonInteraction): Promise<void> {
  const eventId = parseProposeButtonId(interaction.customId);
  if (!eventId) return;
  await interaction.showModal(buildProposeModal(eventId));
}

/** A user submitted the propose modal's title field. */
export async function handleProposeModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const service: MovieNightService = interaction.client.movieNightService;
  const eventId = parseProposeModalId(interaction.customId);
  if (!eventId) return;

  const title = interaction.fields.getTextInputValue(PROPOSE_MODAL_TITLE_INPUT_ID);
  const result = service.proposeMovie({ eventId, userId: interaction.user.id, title });
  await interaction.reply({ content: proposeReplyContent(result), ephemeral: true });
}

async function handleVote(interaction: ChatInputCommandInteraction, service: MovieNightService): Promise<void> {
  const eventId = interaction.options.getString("event", true);
  const proposalId = interaction.options.getString("movie", true);

  const result = service.castVote({ eventId, userId: interaction.user.id, proposalId });
  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    return;
  }

  await interaction.reply({ content: `🗳️ Voted for **${result.value.proposal.title}**!`, ephemeral: true });
}

async function handleStatus(interaction: ChatInputCommandInteraction, service: MovieNightService): Promise<void> {
  const eventId = interaction.options.getString("event", true);
  const status = service.getStatus(eventId);
  if (!status) {
    await interaction.reply({ content: "❌ That movie night event doesn't exist.", ephemeral: true });
    return;
  }

  const { event, proposals, counts } = status;
  const ranked = [...proposals].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  const lines =
    ranked.length === 0
      ? ["_No movies proposed yet._"]
      : ranked.map((p) => `**${p.title}** — ${counts.get(p.id) ?? 0} vote(s)`);

  const embed = new EmbedBuilder()
    .setTitle("🎬 Movie night status")
    .setDescription(
      `Event: ${discordTimestamp(event.eventTime)}\n` +
        `Status: **${event.status}**\n` +
        `Voting closes: ${discordTimestamp(event.votingCloseTime)} (${discordTimestamp(event.votingCloseTime, "R")})\n\n` +
        lines.join("\n"),
    )
    .setColor(0x5865f2);

  await interaction.reply({
    embeds: [embed],
    components: event.status === "open" ? [buildProposeButtonRow(event.id)] : [],
  });
}

async function handleCancel(interaction: ChatInputCommandInteraction, service: MovieNightService): Promise<void> {
  const eventId = interaction.options.getString("event", true);
  const result = service.cancelEvent(eventId, interaction.user.id);
  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    return;
  }

  if (result.value.discordEventId && interaction.guild) {
    try {
      await interaction.guild.scheduledEvents.delete(result.value.discordEventId);
    } catch (error) {
      console.error(`Failed to delete Discord scheduled event for cancelled movie night ${eventId}:`, error);
    }
  }

  if (result.value.announcementMessageId) {
    try {
      await deleteAnnouncementMessage(interaction.client, result.value.channelId, result.value.announcementMessageId);
    } catch (error) {
      console.error(`Failed to delete announcement message for cancelled movie night ${eventId}:`, error);
    }
  }

  await interaction.reply({ content: "🚫 Movie night cancelled.", ephemeral: true });
}

async function handleConfig(interaction: ChatInputCommandInteraction, service: MovieNightService): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "❌ You need the Manage Server permission to change movie night settings.", ephemeral: true });
    return;
  }

  const maxProposals = interaction.options.getInteger("max-proposals");
  const closeBeforeMinutes = interaction.options.getInteger("close-before-minutes");
  const timezone = interaction.options.getString("timezone");

  if (timezone !== null && !isValidTimeZone(timezone)) {
    await interaction.reply({
      content: `❌ Unrecognized time zone "${timezone}". Use an IANA name like "Europe/Athens".`,
      ephemeral: true,
    });
    return;
  }

  if (maxProposals === null && closeBeforeMinutes === null && timezone === null) {
    const current = service.getGuildConfig(interaction.guildId!);
    await interaction.reply({
      content:
        `Current movie night settings:\n` +
        `• Max proposals per person: **${current.maxProposalsPerUser}**\n` +
        `• Voting closes **${current.votingCloseMinutesBeforeEvent}** minute(s) before the event\n` +
        `• Default time zone: **${current.defaultTimeZone}**`,
      ephemeral: true,
    });
    return;
  }

  const updated = service.setGuildConfig(interaction.guildId!, {
    ...(maxProposals !== null ? { maxProposalsPerUser: maxProposals } : {}),
    ...(closeBeforeMinutes !== null ? { votingCloseMinutesBeforeEvent: closeBeforeMinutes } : {}),
    ...(timezone !== null ? { defaultTimeZone: timezone } : {}),
  });

  await interaction.reply({
    content:
      `✅ Updated movie night settings:\n` +
      `• Max proposals per person: **${updated.maxProposalsPerUser}**\n` +
      `• Voting closes **${updated.votingCloseMinutesBeforeEvent}** minute(s) before the event\n` +
      `• Default time zone: **${updated.defaultTimeZone}**`,
    ephemeral: true,
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const service: MovieNightService = interaction.client.movieNightService;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "schedule":
      return handleSchedule(interaction, service);
    case "propose":
      return handlePropose(interaction, service);
    case "vote":
      return handleVote(interaction, service);
    case "status":
      return handleStatus(interaction, service);
    case "cancel":
      return handleCancel(interaction, service);
    case "config":
      return handleConfig(interaction, service);
    default:
      await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
  }
}
