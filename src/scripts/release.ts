import { Command } from "commander";
import fs from "node:fs";

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

async function getLocalVersion() {
	const packagejsonFile = Bun.file("package.json");
	const packagejson = await packagejsonFile.json();
	return packagejson.version;
}

async function saveVersion(version: string) {
	const packagejsonFile = Bun.file("package.json");
	const packagejson = await packagejsonFile.json();
	packagejson.version = version;
	await Bun.write("package.json", JSON.stringify(packagejson, null, 2));
}

const COMPILE_TARGETS: string[] = [
	"bun-linux-x64",
	"bun-linux-arm64",
	"bun-darwin-x64",
	"bun-darwin-arm64",
];

async function compileDistribution() {
	for (const target of COMPILE_TARGETS) {
		const result =
			await Bun.$`bun build ./src/index.ts --compile --target=${target} --outfile dist/sf-${target}`;
		if (result.exitCode !== 0) {
			logAndError(`Failed to compile for ${target}`);
		}
		console.log(`✅ Compiled for ${target}`);

		const zipFileName = `dist/sf-${target}.zip`;
		const zipResult = await Bun.$`zip -j ${zipFileName} dist/sf-${target}`;
		if (zipResult.exitCode !== 0) {
			logAndError(`Failed to zip the binary for ${target}`);
		}
		console.log(`✅ Zipped binary for ${target}`);
	}
}

async function asyncSpawn(cmds: string[]) {
	const result = Bun.spawn(cmds);

	await result.exited;

	return {
		exitCode: result.exitCode,
	};
}

async function createRelease(version: string) {
	const distFiles = fs.readdirSync("./dist");
	const zipFiles = distFiles
		.filter((entry) => fs.statSync(`./dist/${entry}`).isFile())
		.filter((entry) => entry.endsWith(".zip"))
		.map((entry) => `./dist/${entry}`);

	console.log(zipFiles);

	const releaseFlag = version.includes("pre") ? "--prerelease" : "--latest";
	const result =
		await Bun.$`gh release create ${version} ${zipFiles} --generate-notes ${releaseFlag}`;
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
	fs.rmSync("./dist", { recursive: true, force: true });
}

program
	.name("release")
	.description("A github release tool for the project")
	.arguments("[type]")
	.action(async (type) => {
		try {
			if (!type || type === "") {
				program.help();
				process.exit(1);
			}

			const validTypes = ["major", "minor", "patch", "prerelease"];
			if (!validTypes.includes(type)) {
				console.error(
					`Invalid release type: ${type}. Valid types are: ${validTypes.join(", ")}`,
				);
				process.exit(1);
			}

			const ghCheckResult = await Bun.$`which gh`;
			if (ghCheckResult.exitCode !== 0) {
				console.error(
					`The 'gh' command is not installed. Please install it.

  $ brew install gh

  `,
				);
				process.exit(1);
			}

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
