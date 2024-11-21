import { box, BoxKeyPair, randomBytes, } from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import * as path from "node:path";
import * as os from "node:os";
import { Buffer } from "node:buffer";

export async function getKeys(): Promise<{ publicKey: string; privateKey: string }> {
    const keys = await loadKeys();
    if (keys && typeof keys.privateKey === 'string' && typeof keys.publicKey === 'string') {
        return {
            publicKey: keys.publicKey,
            privateKey: keys.privateKey
        };
    }
    const newKeys = generateKeyPair();
    console.error("generating new keys")
    await saveKeys(newKeys);
    return newKeys;
}

function generateKeyPair() {
    // generate a key pair
    const pair = box.keyPair();
    const publicKey = encodeBase64(pair.publicKey);
    const privateKey = encodeBase64(pair.secretKey);

    return {
        publicKey,
        privateKey,
    };
}

export function decryptSecret(props: { encrypted: string, secretKey: string, nonce: string, ephemeralPublicKey: string }) {
    // Generate nonce and message from encrypted secret
    const decrypted = box.open(
        decodeBase64(props.encrypted),
        decodeBase64(props.nonce),
        decodeBase64(props.secretKey),
        decodeBase64(props.ephemeralPublicKey)
    );

    if (!decrypted) {
        throw new Error("Failed to decrypt secret");
    }
    return Buffer.from(decrypted).toString('utf8');
}


async function saveKeys(keys: { publicKey: string; privateKey: string }) {
    const { publicKey, privateKey } = keys;
    const publicKeyPath = path.join(os.homedir(), ".sf", "public_key");
    const privateKeyPath = path.join(os.homedir(), ".sf", "private_key");

    try {
        // Create .sf directory if it doesn't exist
        await Deno.mkdir(path.dirname(publicKeyPath), { recursive: true });

        // Write keys to files
        await Deno.writeTextFile(publicKeyPath, publicKey);
        await Deno.writeTextFile(privateKeyPath, privateKey);

        // Set private key permissions to be readable only by owner
        await Deno.chmod(privateKeyPath, 0o600);
    } catch (err) {
        throw new Error(`Failed to store keys: ${err}`);
    }
}

async function loadKeys() {
    const publicKeyPath = path.join(os.homedir(), ".sf", "public_key");
    const privateKeyPath = path.join(os.homedir(), ".sf", "private_key");

    let publicKey = null;
    let privateKey = null;

    try {
        publicKey = await Deno.readTextFile(publicKeyPath);
    } catch (err) {
        // Leave publicKey as null if read fails
    }

    try {
        privateKey = await Deno.readTextFile(privateKeyPath);
    } catch (err) {
        // Leave privateKey as null if read fails
    }

    return {
        publicKey,
        privateKey,
    };
}
