#!/usr/bin/env bun

import { Command } from "commander";
import { registerDev } from "./lib/dev";
import { registerLogin } from "./lib/login";
import { registerSSH } from "./lib/ssh";
import { registerUpgrade } from "./lib/upgrade";
import { version } from "../package.json";
import { registerBuy } from "./lib/buy";
import { registerContracts } from "./lib/contracts";
import { registerBalance } from "./lib/balance";

const program = new Command();

program
	.name("sf")
	.description("San Francisco Compute command line tool.")
	.version(version);

// commands
registerLogin(program);
registerBuy(program);
registerSSH(program);
registerContracts(program);
registerBalance(program);
registerUpgrade(program);

// (only development commands)
registerDev(program);

program.parse(Bun.argv);
