#!/usr/bin/env bun

import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { registerBalance } from "./lib/balance.ts";
import { registerBuy } from "./lib/buy/index.tsx";
import { registerContracts } from "./lib/contracts/index.tsx";
import { registerDev } from "./lib/dev.ts";
import { registerLogin } from "./lib/login.ts";
import { registerOrders } from "./lib/orders/index.tsx";
import { registerSell } from "./lib/sell.ts";
import { registerTokens } from "./lib/tokens.ts";
import { registerScale } from "./lib/updown.tsx";
import { registerUpgrade } from "./lib/upgrade.ts";
import { registerClusters } from "./lib/clusters/clusters.tsx";
import { checkVersion } from "./checkVersion.ts";
import { registerMe } from "./lib/me.ts";

const program = new Command();

await checkVersion();

program
  .name("sf")
  .description("The San Francisco Compute command line tool.")
  .version(pkg.version);

// commands
registerLogin(program);
registerBuy(program);
registerOrders(program);
registerContracts(program);
registerSell(program);
registerBalance(program);
registerTokens(program);
registerUpgrade(program);
registerScale(program);
registerClusters(program);
registerMe(program);

// (development commands)
registerDev(program);

program.parse(process.argv);
