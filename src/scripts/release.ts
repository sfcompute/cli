import fs from "node:fs";
import { Command } from "commander";

const program = new Command();

function logAndError(msg: string) {
  console.error(msg);
  process.exit(1);
}

function bumpVersion(
  version: string,
  type: "major" | "minor" | "patch" | "prerelease"
) {
  const [major, minor, patch] = version.split(".").map(v =>
    Number.parseInt(
      // Remove everything after the - if there is one
      v.includes("-") ? v.split("-")[0] : v
    )
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

async function getLocalVersion() {
  const packageJson = await Deno.readTextFile("package.json");
  return JSON.parse(packageJson).version;
}

async function saveVersion(version: string) {
  const packageJson = await Deno.readTextFile("package.json");
  const packageObj = JSON.parse(packageJson);
  packageObj.version = version;
  await Deno.writeTextFile("package.json", JSON.stringify(packageObj, null, 2));
}

const COMPILE_TARGETS: string[] = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
];

async function compileDistribution() {
  for (const target of COMPILE_TARGETS) {
    const result = await new Deno.Command("deno", {
      args: [
        "compile",
        "-A",
        "--target",
        target,
        "--output",
        `dist/sf-${target}`,
        "./src/index.ts",
      ],
    }).output();

    if (!result.success) {
      console.error(new TextDecoder().decode(result.stderr));
      logAndError(`Failed to compile for ${target}`);
    }
    console.log(`✅ Compiled for ${target}`);

    const zipFileName = `dist/sf-${target}.zip`;
    const zipResult = await new Deno.Command("zip", {
      args: ["-j", zipFileName, `dist/sf-${target}`],
    }).output();

    if (!zipResult.success) {
      console.error(zipResult.stderr);
      logAndError(`Failed to zip the binary for ${target}`);
    }
    console.log(`✅ Zipped binary for ${target}`);
  }
}

async function asyncSpawn(cmds: string[]) {
  console.log("cmds", cmds);
  const result = await new Deno.Command(cmds[0], {
    args: cmds.slice(1),
  }).output();

  return {
    exitCode: result.success ? 0 : 1,
  };
}
async function createRelease(version: string) {
  // Verify zip files are valid before creating release
  const distFiles = Array.from(Deno.readDirSync("./dist"));
  const zipFiles = distFiles
    .filter(entry => entry.isFile)
    .filter(entry => entry.name.endsWith(".zip"))
    .map(entry => `./dist/${entry.name}`);

  console.log(zipFiles);

  // Verify each zip file is valid
  for (const zipFile of zipFiles) {
    const verifyResult = await new Deno.Command("unzip", {
      args: ["-t", zipFile],
    }).output();

    if (!verifyResult.success) {
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

async function cleanDist() {
  try {
    await Deno.remove("./dist", { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

program
  .name("release")
  .description(
    "A github release tool for the project. Valid types are: major, minor, patch, prerelease"
  )
  .arguments("[type]")
  .action(async type => {
    try {
      if (!type || type === "") {
        program.help();
        process.exit(1);
      }

      const validTypes = ["major", "minor", "patch", "prerelease"];
      if (!validTypes.includes(type)) {
        console.error(
          `Invalid release type: ${type}. Valid types are: ${validTypes.join(
            ", "
          )}`
        );
        process.exit(1);
      }

      const ghCheckResult = await new Deno.Command("which", {
        args: ["gh"],
      }).output();

      if (!ghCheckResult.success) {
        console.error(
          `The 'gh' command is not installed. Please install it.

  $ brew install gh

  `
        );
        process.exit(1);
      }

      process.on("SIGINT", () => {
        console.log(
          "\nRelease process interrupted. Please confirm to exit (ctrl-c again to confirm)."
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
