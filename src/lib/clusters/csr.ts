import * as crypto from "node:crypto";

// Generate RSA key pair
export function generateKeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      "rsa",
      {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: "spki",
          format: "pem",
        },
        privateKeyEncoding: {
          type: "pkcs8",
          format: "pem",
        },
      },
      (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
        } else {
          resolve({ privateKey, publicKey });
        }
      }
    );
  });
}

// Generate CSR
export function generateCSR(
  privateKey: string,
  commonName: string,
  organization: string
): string {
  const csrAttributes = [
    {
      name: "commonName",
      value: commonName,
    },
  ];

  const csr = crypto.createSign("SHA256");
  // Set CSR subject
  const subject = `/CN=${commonName}`;

  return crypto.createSign("SHA256").update(subject).sign(privateKey, "base64");
}
