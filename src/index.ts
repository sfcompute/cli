#!/usr/bin/env node

// Polyfill for Intl.Segmenter to avoid segfaults in pkg builds
// pkg uses small-icu which causes crashes when Intl.Segmenter.segment() is called
// See: https://github.com/yao-pkg/pkg-fetch/issues/134

// Use polyfill-force to always replace the native implementation
import "@formatjs/intl-segmenter/polyfill-force.js";

import * as console from "node:console";
import os from "node:os";
import process from "node:process";
import { Command } from "@commander-js/extra-typings";
import pkg from "../package.json" with { type: "json" };
import { apiClient } from "./apiClient.ts";
import { checkVersion } from "./checkVersion.ts";
import { loadConfig, saveConfig } from "./helpers/config.ts";
import { getAppBanner } from "./lib/app-banner.ts";
import { registerBalance } from "./lib/balance.ts";
import { registerContracts } from "./lib/contracts/index.tsx";
import { registerDev } from "./lib/dev.ts";
import { registerImages } from "./lib/images/index.ts";
import { registerLogin } from "./lib/login.ts";
import { registerMe } from "./lib/me.ts";
import { registerMigrate, showMigrateBanner } from "./lib/migrate.ts";
import { registerNodes } from "./lib/nodes/index.ts";
import { analytics, IS_TRACKING_DISABLED } from "./lib/posthog.ts";
import { registerScale } from "./lib/scale/index.tsx";
import { registerTokens } from "./lib/tokens.ts";
import { registerUpgrade } from "./lib/upgrade.ts";
import { registerVM } from "./lib/vm/index.ts";
import { registerZones } from "./lib/zones.tsx";

async function main() {
  const program = new Command();

  // `sf migrate` replaces this binary outright, so auto-upgrading the legacy
  // CLI first would be wasted work — and worse, the install scripts target
  // the same `~/.local/bin/sf` path, so racing them risks clobbering the new
  // Rust binary the user is about to install.
  if (process.argv[2] === "migrate") {
    process.env.SF_CLI_DISABLE_AUTO_UPGRADE = "1";
  }

  // Load config early so the migration banner can honor the persisted
  // `migrated_to_rust_cli` flag written by a successful `sf migrate`.
  const config = await loadConfig();

  if (!process.argv.includes("--json")) {
    const [shownUpgradeBanner] = await Promise.all([
      checkVersion(),
      getAppBanner(),
    ]);
    // If the user is already on the latest version of the legacy CLI, nudge
    // them toward the new Rust CLI instead of showing nothing. We avoid
    // double-stacking with the upgrade banner since users on outdated builds
    // need to upgrade before migrating, and skip the banner for the
    // `upgrade` / `migrate` commands themselves (where it'd just be noise),
    // for users who've opted out via SF_CLI_DISABLE_MIGRATE_BANNER, and for
    // users who've already migrated (the flag is set by `sf migrate`).
    const subcommand = process.argv[2];
    if (
      !shownUpgradeBanner &&
      subcommand !== "migrate" &&
      subcommand !== "upgrade" &&
      !process.env.SF_CLI_DISABLE_MIGRATE_BANNER &&
      !config.migrated_to_rust_cli
    ) {
      showMigrateBanner();
    }
  }

  program
    .name("sf")
    .description("The San Francisco Compute command line tool.")
    .version(pkg.version);

  // Hydrate `account_id` before registering commands so feature-flag-gated
  // surfaces (e.g. `--enable-infiniband` on `sf nodes create`) resolve
  // correctly on the very first CLI invocation after login, rather than only
  // appearing after the cache has been seeded by a previous run.
  let exchangeAccountId = config.account_id;
  if (!exchangeAccountId) {
    const client = await apiClient(config.auth_token);
    const { data } = await client.GET("/v1/account/me", {});
    if (data?.id) {
      exchangeAccountId = data.id;
      await saveConfig({ ...config, account_id: data.id });
    }
  }

  // commands
  registerLogin(program);
  registerContracts(program);
  registerBalance(program);
  registerTokens(program);
  registerUpgrade(program);
  registerMigrate(program);
  await registerScale(program);
  registerMe(program);
  await registerVM(program);
  await registerNodes(program);
  registerImages(program);
  await registerZones(program);

  // (development commands)
  registerDev(program);

  if (IS_TRACKING_DISABLED) {
    await program.parseAsync(process.argv);
  } else {
    // Add global process exit handlers to ensure analytics cleanup
    let isShuttingDown = false;
    const ensureAnalyticsShutdown = async () => {
      if (!isShuttingDown) {
        isShuttingDown = true;
        try {
          await analytics.shutdown();
        } catch (_err) {
          // Silently ignore analytics shutdown errors
        }
      }
    };

    process.on("beforeExit", ensureAnalyticsShutdown);
    process.on("SIGINT", async () => {
      await ensureAnalyticsShutdown();
      process.exit(130);
    });
    process.on("SIGTERM", async () => {
      await ensureAnalyticsShutdown();
      process.exit(0);
    });

    program.exitOverride((error) => {
      let isError = true;

      switch (error.code) {
        case "commander.helpDisplayed":
        case "commander.help":
        case "commander.version":
          isError = false;
          break;
      }

      process.exit(isError ? 1 : 0);
    });

    if (exchangeAccountId) {
      const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
        if (arg.startsWith("--")) {
          const key = arg.slice(2);
          const nextArg = arr[i + 1];
          if (nextArg && !nextArg.startsWith("-")) {
            (acc as Record<string, string | number | boolean>)[key] =
              Number.isNaN(Number(nextArg)) ? nextArg : Number(nextArg);
          } else {
            (acc as Record<string, boolean>)[key] = true;
          }
        }
        return acc;
      }, {});

      analytics.track({
        event: `${process.argv[2] || "unknown"}${
          process.argv[3] ? "_" + process.argv[3] : ""
        }`,
        properties: {
          ...args,
          shell: process.env.SHELL,
          os: os.platform(),
          cliVersion: program.version(),
          argsRaw: process.argv.slice(2).join(" "),
        },
      });
    }

    try {
      await program.parseAsync(process.argv);

      // Add cleanup only when the process would naturally exit but PostHog keeps it alive
      // This only triggers when the event loop empties (command is done) but process doesn't exit
      process.on("beforeExit", async () => {
        await ensureAnalyticsShutdown();
        process.exit(0);
      });
    } catch (err) {
      console.log(err);
      process.exit(1);
    }
  }
}

main();
