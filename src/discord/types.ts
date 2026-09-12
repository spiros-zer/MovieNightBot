import type { MovieNightService } from "../services/movieNightService";

declare module "discord.js" {
  interface Client {
    movieNightService: MovieNightService;
  }
}
