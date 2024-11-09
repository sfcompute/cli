import os from "node:os";
import path from "node:path";
import util from "node:util";
import type { Command } from "commander";
import { apiClient } from "../apiClient.ts";
import { isLoggedIn } from "../helpers/config.ts";
import {
  logAndQuit,
  logLoginMessageAndQuit,
  unreachable,
} from "../helpers/errors.ts";
import { getInstances } from "./instances/index.tsx";
import chalk from "chalk";
import invariant from "tiny-invariant";

// openssh-client doesn't check $HOME while homedir() does. This function is to
// make it easy to fix if it causes issues.
function sshHomedir(): string {
  return os.homedir();
}

// Helper to spawn processes with proper error handling
function spawnWrapper<Opts extends Deno.CommandOptions>(
  cmds: string[],
  options?: Opts,
): Deno.ChildProcess {
  let shCmd = "";
  for (const cmd of cmds) {
    if (shCmd.length > 0) {
      shCmd += " ";
    }
    shCmd += '"';

    // utf-16 code points are fine as we will ignore surrogates, and we don't
    // care about anything other than characters that don't require surrogates.
    for (const c of cmd) {
      switch (c) {
        case "$":
        case "\\":
        case "`":
        // @ts-ignore
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough
        case '"': {
          shCmd += "\\";
          // fallthrough
        }
        default: {
          shCmd += c;
          break;
        }
      }
    }
    shCmd += '"';
  }
  return new Deno.Command("sh", {
    args: ["-c", shCmd],
    ...options,
  }).spawn();
}

// Returns an absolute path (symbolic links, ".", and ".." are left
// unnormalized).
function normalizeSshConfigPath(sshPath: string): string {
  if (sshPath.length === 0) {
    throw new Error('invalid ssh config path ""');
  } else if (sshPath[0] === "/") {
    return sshPath;
  } else if (sshPath[0] === "~") {
    if (sshPath.length === 1 || sshPath[1] === "/") {
      return path.join(sshHomedir(), sshPath.slice(1));
    } else {
      // i.e. try `~root/foo` in your terminal and see how it handles it (same
      // behavior as ssh client).
      throw new Error("unimplemented");
    }
  } else {
    // Are they relative to ~/.ssh or to the cwd for things listed in ssh -G ?
    throw new Error("unimplemented");
  }
}

function isPubkey(key: string): boolean {
  const pubKeyPattern = /^ssh-/;
  return pubKeyPattern.test(key);
}

async function readFileOrKey(keyOrFile: string): Promise<string> {
  try {
    // Check if the input is a file path
    const fileContent = await Deno.readTextFile(keyOrFile);
    if (!isPubkey(fileContent)) {
      throw new Error("The file content does not look like a valid public key");
    }

    return fileContent;
  } catch (error) {
    const key = keyOrFile.trim();
    if (!isPubkey(key)) {
      throw new Error("The input does not look like a valid public key");
    }

    // If reading the file fails, assume the input is a key
    return key;
  }
}

// This attempts to find the user's default ssh public key (or generate one),
// and returns its value. Errors out and prints a message to the user if unable
// to find, or generate one.
async function findDefaultKey(): Promise<string> {
  // 1. Attempt to find the first identityfile within `ssh -G "" | grep
  //   identityfile` that exists.
  // 2. If step 1 found no entries for `ssh -G` (and `ssh -V` succeeds) then use
  //   the hardcoded list of identity files while printing a warning.
  // 3. If no key was found in step 1, and if applicable step 2 then generate a
  //   key for the user using `ssh-keygen`.
  // 4. Now that we have a key and a public key, return the public key.

  // The default keys for openssh client version "OpenSSH_9.2p1
  // Debian-2+deb12u3, OpenSSL 3.0.14 4 Jun 2024".
  const hardcodedPrivKeys: string[] = [
    "~/.ssh/id_rsa",
    "~/.ssh/id_ecdsa",
    "~/.ssh/id_ecdsa_sk",
    "~/.ssh/id_ed25519",
    "~/.ssh/id_ed25519_sk",
    "~/.ssh/id_xmss",
    "~/.ssh/id_dsa",
  ];

  {
    let proc: Deno.ChildProcess;
    try {
      proc = new Deno.Command("ssh", {
        args: ["-V"],
        stdout: "null",
        stderr: "null",
      }).spawn();
    } catch (e) {
      if (e instanceof TypeError) {
        logAndQuit(
          "The ssh command is not installed, please install it before trying again.",
        );
      } else {
        throw e;
      }
    }
    const status = await proc.status;
    if (!status.success) {
      logAndQuit("The ssh command is not functioning as expected.");
    }
  }

  let identityFile: string | null = null;
  // If we found at least 1 identityfile (if not assume that our gross parsing
  // failed and log a warning message).
  let sshGParsedSuccess = false;

  // If we believe key types to be supported by the ssh client.
  let keySupportedEd25519 = false;
  let keySupportedRsa = false;

  const proc = spawnWrapper(["ssh", "-G", ""], {
    stdin: "null",
    stdout: "piped",
    stderr: "null",
  });

  const output = await proc.output();
  const status = await proc.status;

  if (status.success) {
    const decoder = new TextDecoder("utf-8");
    let stdoutStr: string;
    try {
      stdoutStr = decoder.decode(output.stdout);
    } catch (e) {
      logAndQuit("The ssh command returned invalid utf-8");
    }

    for (const line of stdoutStr.split("\n")) {
      const prefix = "identityfile ";
      if (line.startsWith(prefix)) {
        const lineSuffix = line.slice(prefix.length);
        if (
          lineSuffix === "~/.ssh/id_ed25519" ||
          lineSuffix === path.join(sshHomedir(), ".ssh/id_ed25519")
        ) {
          keySupportedEd25519 = true;
        }
        if (
          lineSuffix === "~/.ssh/id_rsa" ||
          lineSuffix === path.join(sshHomedir(), ".ssh/id_rsa")
        ) {
          keySupportedRsa = true;
        }
        const potentialIdentityFile = normalizeSshConfigPath(
          lineSuffix + ".pub",
        );
        sshGParsedSuccess = true;
        try {
          await Deno.stat(potentialIdentityFile);
          identityFile = potentialIdentityFile;
          break;
        } catch {
          // File doesn't exist, continue checking
        }
      }
    }
  }

  if (!sshGParsedSuccess) {
    invariant(identityFile === null);

    console.log(
      "Warning: failed finding default ssh keys (checking hardcoded list)",
    );
    keySupportedEd25519 = true;
    keySupportedRsa = true;
    for (const hardcodedPrivKey of hardcodedPrivKeys) {
      const potentialIdentityFile = normalizeSshConfigPath(
        hardcodedPrivKey + ".pub",
      );
      try {
        await Deno.stat(potentialIdentityFile);
        identityFile = potentialIdentityFile;
        break;
      } catch {
        // File doesn't exist, continue checking
      }
    }
  }

  if (identityFile === null) {
    console.log("Unable to find SSH key (generating new key)");

    const sshDir: string = path.join(sshHomedir(), ".ssh");
    let privSshKeyPath: string;
    let extraSshOptions: string[];
    if (keySupportedEd25519) {
      extraSshOptions = ["-t", "ed25519"];
      privSshKeyPath = path.join(sshDir, "id_ed25519");
    } else if (keySupportedRsa) {
      extraSshOptions = ["-t", "rsa", "-b", "4096"];
      privSshKeyPath = path.join(sshDir, "id_rsa");
    } else {
      logAndQuit(
        "Unable to generate SSH key (neither rsa, nor ed25519 appear supported)",
      );
    }

    const proc = spawnWrapper(
      ["ssh-keygen", "-N", "", "-q", "-f", privSshKeyPath].concat(
        extraSshOptions,
      ),
      {
        stdin: "null",
        stdout: "null",
        stderr: "null",
      },
    );
    const status = await proc.status;
    if (status.success) {
      // Success
    } else if (status.code === 127) {
      // Gross as technically ssh-keyen could also exit with 127. Remove once no
      // longer using spawnWrapper.
      logAndQuit(
        "The ssh-keygen command is not installed, please install it before trying again.",
      );
    } else {
      logAndQuit("The ssh-keygen command did not execute successfully.");
    }
    console.log(util.format("Generated key %s", privSshKeyPath));
    identityFile = privSshKeyPath + ".pub";
  }

  console.log(util.format("Using ssh key %s", identityFile));
  return (await Deno.readTextFile(identityFile)).trim();
}

export function registerSSH(program: Command) {
  const cmd = program
    .command("ssh")
    .description("SSH into nodes")
    .option("--add <key>", "Add an acceptable pubkey to all nodes")
    .option(
      "--user <username>",
      "Specify the username associated with the pubkey",
      "ubuntu",
    )
    .option("--init", "Attempt to automatically add the first default ssh key")
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

    if (options.init && options.add) {
      logAndQuit("--init is not compatible with --add");
    }

    if ((options.add || options.init) && name) {
      logAndQuit("You can only add a key to all nodes at once");
    }

    if (name) {
      let procResult: Deno.CommandOutput;
      const instances = await getInstances({ clusterId: undefined });
      const instance = instances.find((instance) => instance.id === name);
      if (!instance) {
        logAndQuit(`Instance ${name} not found`);
      }
      if (instance.public_ip.split(":").length === 2 || instance.ssh_port) {
        const [ip, port] = instance.public_ip.split(":");

        const sshPort = instance.ssh_port?.toString() || port || "22";

        console.log(chalk.dim(`ssh -p ${sshPort} ${options.user}@${ip}`));
        procResult = new Deno.Command("ssh", {
          args: ["-p", sshPort, util.format("%s@%s", options.user, ip)],
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        }).outputSync();
      } else {
        console.log(chalk.dim(`ssh ${options.user}@${instance.public_ip}`));
        procResult = new Deno.Command("ssh", {
          args: [util.format("%s@%s", options.user, instance.public_ip)],
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        }).outputSync();
      }
      if (procResult.code === 255) {
        console.log(
          "The ssh command appears to possibly have failed. To set up ssh keys please run `sf ssh --init`.",
        );
      }
      Deno.exit(0);
    }

    if (options.init || options.add) {
      let pubkey: string;
      if (options.init) {
        pubkey = await findDefaultKey();
      } else if (options.add) {
        pubkey = await readFileOrKey(options.add);
      } else {
        unreachable();
      }

      const api = await apiClient();
      await api.POST("/v0/credentials", {
        body: {
          pubkey,
          username: options.user,
        },
      });

      console.log("Added ssh key");

      Deno.exit(0);
    }

    cmd.help();
  });
}
