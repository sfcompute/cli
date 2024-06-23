#!/usr/bin/env bun

import { Command } from "commander";
import { loadEnvironment } from "./environment";
import { registerLogin } from "./lib/login";
import { registerDev } from "./lib/dev";

loadEnvironment(); // load .env → process.env
const program = new Command();

program
	.name("sfc")
	.description("San Francisco Compute command line tool")
	.version("0.1.0");

// commands
registerLogin(program);

// (only development commands)
registerDev(program);

program.parse(Bun.argv);
