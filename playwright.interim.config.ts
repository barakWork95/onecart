import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const server = base.webServer;
if (!server || Array.isArray(server)) throw new Error("Expected a single isolated demo server");

export default defineConfig({
  ...base,
  testDir: "./e2e-interim",
  webServer: {
    ...server,
    reuseExistingServer: false,
    env: {
      ...server.env,
      ONECART_AMAZON_LINK_ONLY: "true",
    },
  },
});
