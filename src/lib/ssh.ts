import type { Command } from "commander";
import { apiClient } from "../apiClient";
import { isLoggedIn } from "../helpers/config";
import { logAndQuit, logLoginMessageAndQuit } from "../helpers/errors";

function isPubkey(key: string): boolean {
  const pubKeyPattern = /^ssh-/;
  return pubKeyPattern.test(key);
}

async function readFileOrKey(keyOrFile: string): Promise<string> {
  try {
    // Check if the input is a file path
    const fileContent = Bun.file(keyOrFile);
    if (!fileContent) {
      throw new Error("File not found");
    }
    const file = await fileContent.text();
    if (!isPubkey(file)) {
      throw new Error("The file content does not look like a valid public key");
    }

    return file;
  } catch (error) {
    const key = keyOrFile.trim();
    if (!isPubkey(key)) {
      throw new Error("The input does not look like a valid public key");
    }

    // If reading the file fails, assume the input is a key
    return key;
  }
}

export function registerSSH(program: Command) {
  const cmd = program
    .command("ssh")
    .description("SSH into nodes")
    .option("--add <key>", "Add an acceptable pubkey to all nodes")
    .option(
      "--user <username>",
      "Specify the username associated with the pubkey",
      "ubuntu"
    )
    .argument("[name]", "The name of the node to SSH into");

  cmd.action(async (name, options) => {
    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      logLoginMessageAndQuit();
    }

    if (Object.keys(options).length === 0 && !name) {
      cmd.help();
      return;
    }

    if (options.add) {
      if (!options.user) {
        logAndQuit(
          "Username is required when adding an SSH key (add it with --user <username>)",
        );
      }

      const key = await readFileOrKey(options.add);

      const api = await apiClient();
      await api.POST("/v0/credentials", {
        body: {
          pubkey: key,
          username: options.user,
        },
      });

      console.log("Added ssh key");

      process.exit(0);
    }

    cmd.help();
  });
}
