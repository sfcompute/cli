#!/usr/bin/env bun

import { Command } from "commander";
import { version } from "../package.json" with { type: "json" };
import { registerBalance } from "./lib/balance.ts";
import { registerBuy } from "./lib/buy/index.tsx";
import { registerContracts } from "./lib/contracts/index.tsx";
import { registerDev } from "./lib/dev.ts";
import { registerInstances } from "./lib/instances/index.tsx";
import { registerLogin } from "./lib/login.ts";
import { registerOrders } from "./lib/orders/index.tsx";
import { registerSell } from "./lib/sell.ts";
import { registerSSH } from "./lib/ssh.ts";
import { registerTokens } from "./lib/tokens.ts";
import { registerDown, registerUp } from "./lib/updown.ts";
import { registerUpgrade } from "./lib/upgrade.ts";
import { checkVersion } from "./checkVersion.ts";

const program = new Command();

await checkVersion();

program
  .name("sf")
  .description("The San Francisco Compute command line tool.")
  .version(version);

// commands
registerLogin(program);
registerBuy(program);
registerOrders(program);
registerContracts(program);
registerInstances(program);
registerSSH(program);
registerSell(program);
registerBalance(program);
registerTokens(program);
registerUpgrade(program);
registerUp(program);
registerDown(program);

// (development commands)
registerDev(program);

program.parse(Bun.argv);
