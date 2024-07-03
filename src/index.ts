#!/usr/bin/env bun

import { Command } from "commander";
import { loadEnvironment } from "./environment";
import { registerDev } from "./lib/dev";
import { registerLogin } from "./lib/login";
import { registerSSH } from "./lib/ssh";
import { registerUpgrade } from "./lib/upgrade";
import { version } from "../package.json";

loadEnvironment(); // load .env → process.env
const program = new Command();

program
	.name("sfc")
	.description("San Francisco Compute command line tool")
	.version(version);

// commands
registerLogin(program);
registerSSH(program);
registerUpgrade(program);

// (only development commands)
registerDev(program);

program.parse(Bun.argv);
