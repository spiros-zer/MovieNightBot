import { REST, Routes } from "discord.js";
import { env } from "../config/env";
import { data as movieNightCommand } from "./commands/movienight";

async function main(): Promise<void> {
  const token = env.discordToken();
  const clientId = env.discordClientId();
  const devGuildId = env.discordDevGuildId();

  const rest = new REST({ version: "10" }).setToken(token);
  const body = [movieNightCommand.toJSON()];

  if (devGuildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, devGuildId), { body });
    console.log(`Registered commands to dev guild ${devGuildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log("Registered global commands (may take up to an hour to propagate).");
  }
}

main().catch((error) => {
  console.error("Failed to deploy commands:", error);
  process.exit(1);
});
