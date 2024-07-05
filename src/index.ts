#!/usr/bin/env bun

import { Command } from "commander";
import { registerDev } from "./lib/dev";
import { registerLogin } from "./lib/login";
import { registerSSH } from "./lib/ssh";
import { registerUpgrade } from "./lib/upgrade";
import { version } from "../package.json";
import { registerBuy } from "./lib/buy";

const program = new Command();

program
	.name("sfc")
	.description("San Francisco Compute command line tool")
	.version(version);

// commands
registerLogin(program);
registerSSH(program);
registerUpgrade(program);
registerBuy(program);

// (only development commands)
registerDev(program);

program.parse(Bun.argv);
