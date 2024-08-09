#!/usr/bin/env bun

import { Command } from "commander";
import { version } from "../package.json";
import { registerBalance } from "./lib/balance";
import { registerBuy } from "./lib/buy";
import { registerContracts } from "./lib/contracts";
import { registerDev } from "./lib/dev";
import { registerInstances } from "./lib/instances";
import { registerLogin } from "./lib/login";
import { registerOrders } from "./lib/orders";
import { registerSell } from "./lib/sell";
import { registerSSH } from "./lib/ssh";
import { registerTokens } from "./lib/tokens";
import { registerUpgrade } from "./lib/upgrade";

const program = new Command();

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

// (development commands)
registerDev(program);

program.parse(Bun.argv);
