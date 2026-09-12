import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  discordToken: () => required("DISCORD_TOKEN"),
  discordClientId: () => required("DISCORD_CLIENT_ID"),
  discordDevGuildId: () => process.env.DISCORD_DEV_GUILD_ID || undefined,
  databasePath: () => process.env.DATABASE_PATH || "./data/movie-night.sqlite",
};
