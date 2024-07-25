#!/usr/bin/env bun

import { Command } from "commander";
import { version } from "../package.json";
import { registerBalance } from "./lib/balance";
import { registerBuy } from "./lib/buy";
import { registerContracts } from "./lib/contracts";
import { registerDev } from "./lib/dev";
import { registerLogin } from "./lib/login";
import { registerSell } from "./lib/sell";
import { registerSSH } from "./lib/ssh";
import { registerUpgrade } from "./lib/upgrade";
import { registerInstances } from "./lib/instances";

const program = new Command();

program
  .name("sf")
  .description("San Francisco Compute command line tool.")
  .version(version);

// commands
registerLogin(program);
registerBuy(program);
registerInstances(program);
registerSSH(program);
registerContracts(program);
registerSell(program);
registerBalance(program);
registerUpgrade(program);

// (only development commands)
registerDev(program);

program.parse(Bun.argv);
