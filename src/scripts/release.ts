#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as console from "node:console";
import * as fs from "node:fs";
import process from "node:process";
import { Argument, Command } from "@commander-js/extra-typings";

const program = new Command();

function logAndError(msg: string) {
  console.error(msg);
  process.exit(1);
}

function bumpVersion(
  version: string,
  type: "major" | "minor" | "patch" | "prerelease",
) {
  const [major, minor, patch] = version.split(".").map((v) =>
    Number.parseInt(
      // Remove everything after the - if there is one
      v.includes("-") ? v.split("-")[0] : v,
      10,
    ),
  );
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "prerelease":
      return `${major}.${minor}.${patch}-pre.${Date.now()}`;
    default:
      throw new Error(`Invalid release type: ${type}`);
  }
}

function getLocalVersion() {
  const packageJson = fs.readFileSync("package.json", "utf-8");
  return JSON.parse(packageJson).version;
}

function saveVersion(version: string) {
  const packageJson = fs.readFileSync("package.json", "utf-8");
  const packageObj = JSON.parse(packageJson);
  packageObj.version = version;
  // Ensure exactly one newline at the end of the file
  fs.writeFileSync("package.json", `${JSON.stringify(packageObj, null, 2)}\n`);
}

const COMPILE_TARGETS: string[] = [
  "node22-linux-x64",
  "node22-linux-arm64",
  "node22-macos-x64",
  "node22-macos-arm64",
];

async function compileDistribution() {
  // Create dist directory
  fs.mkdirSync("./dist", { recursive: true });

  for (const target of COMPILE_TARGETS) {
    const result = spawnSync("npx", [
      "pkg",
      ".",
      "--target",
      target,
      "--output",
      `dist/sf-${target}`,
    ]);

    if (result.status !== 0) {
      console.error(result.stderr?.toString() ?? "");
      logAndError(`Failed to compile for ${target}`);
    }
    console.log(`✅ Compiled for ${target}`);

    const zipFileName = `dist/sf-${target}.zip`;
    const zipResult = spawnSync("zip", [
      "-j",
      zipFileName,
      `dist/sf-${target}`,
    ]);

    if (zipResult.status !== 0) {
      console.error(zipResult.stderr?.toString() ?? "");
      logAndError(`Failed to zip the binary for ${target}`);
    }
    console.log(`✅ Zipped binary for ${target}`);
  }
}

async function asyncSpawn(cmds: string[]) {
  console.log("cmds", cmds);
  const result = spawnSync(cmds[0], cmds.slice(1));

  return {
    exitCode: result.status ?? 1,
  };
}
async function createRelease(version: string) {
  // Verify zip files are valid before creating release
  const distFiles = fs.readdirSync("./dist", { withFileTypes: true });
  const zipFiles = distFiles
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.endsWith(".zip"))
    .map((entry) => `./dist/${entry.name}`);

  console.log(zipFiles);

  // Verify each zip file is valid
  for (const zipFile of zipFiles) {
    const verifyResult = spawnSync("unzip", ["-t", zipFile]);

    if (verifyResult.status !== 0) {
      logAndError(`Invalid zip file: ${zipFile}`);
    }
    console.log(`✅ Verified zip file: ${zipFile}`);
  }

  const releaseFlag = version.includes("pre") ? "--prerelease" : "--latest";
  const result = await asyncSpawn([
    "gh",
    "release",
    "create",
    version,
    ...zipFiles,
    "--generate-notes",
    releaseFlag,
  ]);
  if (result.exitCode !== 0) {
    console.log(
      "GitHub release creation failed with exit code:",
      result.exitCode,
    );
    console.log("Common failure reasons:");
    console.log("- GitHub CLI not installed or not authenticated");
    console.log("- Release tag already exists");
    console.log("- No write permissions to repository");
    console.log("- Network connectivity issues");
    logAndError(`Failed to create GitHub release for version ${version}`);
  }
  console.log(`✅ Created GitHub release for version ${version}`);

  const gitAddResult = await asyncSpawn(["git", "add", "package.json"]);
  if (gitAddResult.exitCode !== 0) {
    logAndError("Failed to add package.json to git");
  }
  console.log("✅ Added package.json to git");

  const gitCommitResult = await asyncSpawn([
    "git",
    "commit",
    "-m",
    `release: v${version}`,
  ]);
  if (gitCommitResult.exitCode !== 0) {
    logAndError(`Failed to commit with message "release: v${version}"`);
  }
  console.log(`✅ Committed with message "release: v${version}"`);

  const gitPushResult = await asyncSpawn(["git", "push", "origin", "main"]);
  if (gitPushResult.exitCode !== 0) {
    logAndError("Failed to push to origin main");
  }
  console.log("✅ Pushed to origin main");
}

function cleanDist() {
  fs.rmSync("./dist", { recursive: true, force: true });
}

program
  .name("release")
  .description(
    "A github release tool for the project. Valid types are: major, minor, patch, prerelease",
  )
  .addArgument(
    new Argument("type").choices([
      "major",
      "minor",
      "patch",
      "prerelease",
    ] as const),
  )
  .action(async (type) => {
    try {
      const ghCheckResult = spawnSync("which", ["gh"]);

      if (ghCheckResult.status !== 0) {
        console.error(
          `The 'gh' command is not installed. Please install it.

  $ brew install gh

  `,
        );
        process.exit(1);
      }

      process.on("SIGINT", () => {
        console.log(
          "\nRelease process interrupted. Please confirm to exit (ctrl-c again to confirm).",
        );
        process.once("SIGINT", () => {
          console.log("Exiting...");
          process.exit(1);
        });
      });

      await cleanDist();
      const version = await getLocalVersion();
      const bumpedVersion = bumpVersion(version, type);
      await saveVersion(bumpedVersion);
      await compileDistribution();
      await createRelease(bumpedVersion);
    } catch (err) {
      console.error(err);
    }
  });

program.parse(process.argv);
