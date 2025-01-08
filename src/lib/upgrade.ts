import type { Command } from "commander";
import ora from "ora";

/**
 * Returns true if the current version is the same as the latest release version.
 */
const getIsOnLatestVersion = async (currentVersion: string | undefined) => {
  if (!currentVersion) {
    return false;
  }

  const latestVersionUrl =
    "https://api.github.com/repos/sfcompute/cli/releases/latest";
  const latestVersionResponse = await fetch(latestVersionUrl);

  if (latestVersionResponse.ok) {
    const latestVersionData = await latestVersionResponse.json();
    const latestVersion = latestVersionData.tag_name;

    return latestVersion === currentVersion;
  }

  return false;
};

export function registerUpgrade(program: Command) {
  return program
    .command("upgrade")
    .argument("[version]", "The version to upgrade to")
    .description("Upgrade to the latest version or a specific version")
    .action(async version => {
      const spinner = ora();
      const currentVersion = program.version();

      if (version) {
        spinner.start(`Checking if version ${version} exists`);
        const url = `https://github.com/sfcompute/cli/archive/refs/tags/${version}.zip`;
        const response = await fetch(url, { method: "HEAD" });

        if (response.status === 404) {
          spinner.fail(`Version ${version} does not exist.`);
          process.exit(1);
        }
        spinner.succeed();
      }

      // Check if user has already installed latest version.
      if (version === currentVersion) {
        spinner.succeed(`You are already on version ${currentVersion}.`);
        // process.exit(0);
      }

      const isOnLatestVersion = await getIsOnLatestVersion(currentVersion);
      if (isOnLatestVersion) {
        spinner.succeed(
          `You are already on the latest version (${currentVersion}).`
        );
        // process.exit(0);
      }

      // Fetch the install script
      spinner.start("Downloading install script");
      const scriptResponse = await fetch(
        "https://www.sfcompute.com/cli/install"
      );

      if (!scriptResponse.ok) {
        spinner.fail("Failed to download install script.");
        process.exit(1);
      }

      const script = await scriptResponse.text();
      spinner.succeed();

      // Execute the script with bash
      spinner.start("Installing upgrade");
      const command = new Deno.Command("bash", {
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
        env: version ? { SF_CLI_VERSION: version } : undefined,
      });

      const bashProcess = command.spawn();
      const stdinWriter = bashProcess.stdin.getWriter();
      await stdinWriter.write(new TextEncoder().encode(script));
      stdinWriter.close();

      const { code, stdout, stderr } = await bashProcess.output();

      if (code !== 0) {
        spinner.fail("Upgrade failed");
        console.error(new TextDecoder().decode(stderr));
        console.log(new TextDecoder().decode(stdout));
        process.exit(1);
      }

      spinner.succeed("Upgrade completed successfully");
      // process.exit(0);
    });
}
