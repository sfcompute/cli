#!/usr/bin/env bun

import * as console from "node:console";
import os from "node:os";
import process from "node:process";
import { Command } from "@commander-js/extra-typings";
import pkg from "../package.json" with { type: "json" };
import { checkVersion } from "./checkVersion.ts";
import { loadConfig, saveConfig } from "./helpers/config.ts";
import { getApiUrl } from "./helpers/urls.ts";
import { getAppBanner } from "./lib/app-banner.ts";
import { registerBalance } from "./lib/balance.ts";
import { registerBuy } from "./lib/buy/index.tsx";
import { registerContracts } from "./lib/contracts/index.tsx";
import { registerDev } from "./lib/dev.ts";
import { registerExtend } from "./lib/extend/index.tsx";
import { registerLogin } from "./lib/login.ts";
import { registerMe } from "./lib/me.ts";
import { registerNodes } from "./lib/nodes/index.ts";
import { registerOrders } from "./lib/orders/index.tsx";
import { IS_TRACKING_DISABLED, analytics } from "./lib/posthog.ts";
import { registerScale } from "./lib/scale/index.tsx";
import { registerSell } from "./lib/sell.ts";
import { registerTokens } from "./lib/tokens.ts";
import { registerUpgrade } from "./lib/upgrade.ts";
import { registerVM } from "./lib/vm/index.ts";
import { registerZones } from "./lib/zones.tsx";

async function main() {
  const program = new Command();

  if (!process.argv.includes("--json")) {
    await Promise.all([checkVersion(), getAppBanner()]);
  }

  program
    .name("sf")
    .description("The San Francisco Compute command line tool.")
    .version(pkg.version);

  // commands
  registerLogin(program);
  registerBuy(program);
  registerExtend(program);
  registerOrders(program);
  registerContracts(program);
  registerSell(program);
  registerBalance(program);
  registerTokens(program);
  registerUpgrade(program);
  await registerScale(program);
  registerMe(program);
  await registerVM(program);
  await registerNodes(program);
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

    const config = await loadConfig();
    let exchangeAccountId = config.account_id;

    if (!exchangeAccountId) {
      const response = await fetch(await getApiUrl("me"), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.auth_token}`,
        },
      });

      const data = (await response.json()) as any;
      if (data.id) {
        exchangeAccountId = data.id;
        saveConfig({ ...config, account_id: data.id });
      }
    }

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
