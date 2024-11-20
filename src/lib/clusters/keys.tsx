import * as crypto from "node:crypto";
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
    // Generate RSA key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    return {
        publicKey,
        privateKey,
    };
}

export function decryptSecret(encrypted_secret: string, privateKey: string) {
    try {
        const decoded = Buffer.from(encrypted_secret, 'base64');
        const decrypted = crypto.privateDecrypt({
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_PADDING,
        }, decoded);

        // Convert decrypted array to Buffer
        const decryptedBuffer = Buffer.isBuffer(decrypted) ? decrypted : Buffer.from(decrypted);

        return decryptedBuffer.toString('utf8');
    } catch (err) {
        throw new Error(`Failed to decrypt secret: ${err}`);
    }
}


async function saveKeys(keys: { publicKey: string; privateKey: string }) {
    const { publicKey, privateKey } = keys;
    const publicKeyPath = path.join(os.homedir(), ".sf", "public.pem");
    const privateKeyPath = path.join(os.homedir(), ".sf", "private.pem");

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
    const publicKeyPath = path.join(os.homedir(), ".sf", "public.pem");
    const privateKeyPath = path.join(os.homedir(), ".sf", "private.pem");

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
