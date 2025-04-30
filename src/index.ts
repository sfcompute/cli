#!/usr/bin/env bun

import { Command } from "@commander-js/extra-typings";
import * as console from "node:console";
import os from "node:os";
import process from "node:process";
import pkg from "../package.json" with { type: "json" };
import { checkVersion } from "./checkVersion.ts";
import { loadConfig, saveConfig } from "./helpers/config.ts";
import { getApiUrl } from "./helpers/urls.ts";
import { getAppBanner } from "./lib/app-banner.ts";
import { registerBalance } from "./lib/balance.ts";
import { registerBuy } from "./lib/buy/index.tsx";
import { registerExtend } from "./lib/extend/index.tsx";
import { registerClusters } from "./lib/clusters/clusters.tsx";
import { registerContracts } from "./lib/contracts/index.tsx";
import { registerDev } from "./lib/dev.ts";
import { registerLogin } from "./lib/login.ts";
import { registerMe } from "./lib/me.ts";
import { registerOrders } from "./lib/orders/index.tsx";
import { analytics, IS_TRACKING_DISABLED } from "./lib/posthog.ts";
import { registerSell } from "./lib/sell.ts";
import { registerTokens } from "./lib/tokens.ts";
import { registerUpgrade } from "./lib/upgrade.ts";
import { registerVM } from "./lib/vm.ts";
import { registerScale } from "./lib/scale.tsx";

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
registerClusters(program);
registerMe(program);
registerVM(program);

// (development commands)
registerDev(program);

const main = async () => {
  if (IS_TRACKING_DISABLED) {
    program.parse(process.argv);
  } else {
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

      // deno-lint-ignore no-explicit-any -- Deno has narrower types for fetch responses, but we know this code works atm.
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
            (acc as Record<string, string | number | boolean>)[key] = isNaN(
                Number(nextArg),
              )
              ? nextArg
              : Number(nextArg);
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
      await analytics.shutdown();
      program.parse(process.argv);
    } catch (err) {
      console.log(err);
      await analytics.shutdown();
      process.exit(1);
    }
  }
};

main();
