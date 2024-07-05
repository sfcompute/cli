import type { Command } from "commander";
import { getAuthorizationHeader } from "../helpers/config";
import { getApiUrl } from "../helpers/urls";

function isPubkey(key: string): boolean {
	const pubKeyPattern = /^ssh-(rsa|dss|ed25519) [A-Za-z0-9+/=]+ ?.*$/;
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

async function addSSHKey(key: string) {
	const pubkey = await readFileOrKey(key);

	const res = await fetch(await getApiUrl("credentials_create"), {
		method: "POST",
		headers: await getAuthorizationHeader(),
		body: JSON.stringify({
			id: key,
			object: "ssh_credential",
			pubkey,
		}),
	});
}

export function registerSSH(program: Command) {
	const cmd = program
		.command("ssh")
		.description("SSH into nodes")
		.option("--add <key>", "Add an acceptable pubkey to all nodes")
		.argument("[name]", "The name of the node to SSH into");

	cmd.action(async (name, options) => {
		if (Object.keys(options).length === 0 && !name) {
			cmd.help();
			return;
		}

		if (options.add) {
			const credential = await postSSHKeys(options.add);
			console.log("Added ssh key.");
			return;
		}

		cmd.help();
	});
}

export type SSHCredential = {
	object: "ssh_credential";
	id: string;
	pubkey: string;
	username: string;
};

export type CredentialObject = SSHCredential;

export type PostSSHCredentialBody = {
	pubkey: string;
	user: string;
};

export async function getSSHKeys() {
	const res = await fetch(await getApiUrl("credentials_list"), {
		headers: await getAuthorizationHeader(),
	});

	const data = await res.json();
	return data as SSHCredential[];
}

export async function postSSHKeys(key: string) {
	const res = await fetch(await getApiUrl("credentials_create"), {
		method: "POST",
		headers: await getAuthorizationHeader(),
		body: JSON.stringify({
			pubkey: key,
			user: "sf",
		}),
	});
	if (!res.ok) {
		console.error(await res.text());
		throw new Error("Failed to add SSH key");
	}

	const data = await res.json();
	return data as SSHCredential;
}
