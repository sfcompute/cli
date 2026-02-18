import console from "node:console";
import crypto from "node:crypto";
import fs from "node:fs";
import { open, stat } from "node:fs/promises";
import process from "node:process";
import { clearInterval, setInterval } from "node:timers";
import { Command } from "@commander-js/extra-typings";
import retry from "async-retry";
import chalk from "chalk";
import cliProgress from "cli-progress";
import cliSpinners from "cli-spinners";
import ora, { type Ora } from "ora";
import { apiClient } from "../../apiClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";

async function readChunk(
  filePath: string,
  start: number,
  length: number,
  onProgress?: (bytesRead: number) => void,
): Promise<Uint8Array> {
  const fileHandle = await open(filePath, "r");
  try {
    const buffer = new Uint8Array(length);
    let offset = 0;

    while (offset < length) {
      const { bytesRead } = await fileHandle.read(
        buffer,
        offset,
        length - offset,
        start + offset,
      );
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
      if (onProgress) {
        onProgress(bytesRead);
      }
    }

    if (offset !== length) {
      throw new Error(
        `Short read: expected ${length} bytes, got ${offset} bytes`,
      );
    }

    return buffer;
  } finally {
    await fileHandle.close();
  }
}

const upload = new Command("upload")
  .description("Upload an image file (multipart)")
  .requiredOption("-f, --file <file>", "Path to the image file")
  .requiredOption("-n, --name <name>", "Image name")
  .option(
    "-c, --concurrency <number>",
    "Number of parts to upload concurrently",
    (value) => {
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        throw new Error("Concurrency must be a positive integer");
      }
      return parsed;
    },
    1,
  )
  .action(async ({ name, file: filePath, concurrency: concurrencyLimit }) => {
    let preparingSpinner: Ora | undefined;
    let finalizingSpinner: Ora | undefined;
    let spinnerTimer: NodeJS.Timeout | undefined;
    let progressBar: cliProgress.SingleBar | undefined;

    try {
      const client = await apiClient();

      preparingSpinner = ora(`Preparing upload for ${name}...`).start();

      // Create image via v2 API
      const startResponse = await client.POST("/v2/images", {
        body: { name },
      });

      if (!startResponse.response.ok || !startResponse.data) {
        const errorText = await startResponse.response.text().catch(() => "");
        throw new Error(
          `Failed to start upload: ${startResponse.response.status} ${startResponse.response.statusText}${errorText ? ` - ${errorText}` : ""}`,
        );
      }

      const imageId = startResponse.data.id;

      preparingSpinner.succeed(
        `Started upload for image ${chalk.cyan(name)} (${chalk.blackBright(
          imageId,
        )})`,
      );

      // Get file info
      const fileInfo = await stat(filePath);
      const fileSize = fileInfo.size;

      // Check file size limit (128 GiB)
      const maxFileSize = 128 * 1024 * 1024 * 1024;
      if (fileSize > maxFileSize) {
        logAndQuit(
          `File size exceeds maximum allowed size of 128 GiB. File size: ${(
            fileSize / (1024 * 1024 * 1024)
          ).toFixed(2)} GiB`,
        );
      }

      // Calculate parts
      const minChunk = 5 * 1024 * 1024; // 5 MiB
      const defaultChunk = 64 * 1024 * 1024; // 64 MiB
      const maxParts = 10000;

      const chunkSize =
        fileSize <= defaultChunk
          ? Math.max(fileSize, minChunk)
          : Math.max(minChunk, Math.ceil(fileSize / maxParts), defaultChunk);

      const totalParts = Math.ceil(fileSize / chunkSize);

      const uploadParts: Array<{
        part: number;
        start: number;
        end: number;
      }> = [];

      for (let idx = 0; idx < totalParts; idx++) {
        const part = idx + 1;
        const start = idx * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        uploadParts.push({ part, start, end });
      }

      // Progress tracking
      const startTime = Date.now();
      const partProgress = new Map<number, number>();

      const getTotalBytesUploaded = () => {
        let total = 0;
        for (const bytes of partProgress.values()) {
          total += bytes;
        }
        return total;
      };

      const spinner = cliSpinners.dots;
      let spinnerIndex = 0;

      progressBar = new cliProgress.SingleBar({
        format:
          "{spinner} Uploading [{bar}] {percentage}% | {uploadedMB}/{totalMB} MB | {speed}",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
        forceRedraw: false,
      });

      progressBar.start(fileSize, 0, {
        spinner: spinner.frames[0],
        speed: "0 B/s",
        uploadedMB: "0.0",
        totalMB: (fileSize / (1024 * 1024)).toFixed(1),
      });

      const UI_UPDATE_INTERVAL_MS = 200;
      let lastUIUpdate = 0;

      const renderProgress = () => {
        const totalBytesUploaded = getTotalBytesUploaded();
        const elapsedTime = (Date.now() - startTime) / 1000;
        const speed = totalBytesUploaded / elapsedTime;

        let speedStr: string;
        if (speed > 1024 * 1024) {
          speedStr = `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
        } else if (speed > 1024) {
          speedStr = `${(speed / 1024).toFixed(1)} KB/s`;
        } else {
          speedStr = `${speed.toFixed(0)} B/s`;
        }

        progressBar?.update(totalBytesUploaded, {
          spinner: spinner.frames[spinnerIndex % spinner.frames.length],
          speed: speedStr,
          uploadedMB: (totalBytesUploaded / (1024 * 1024)).toFixed(1),
          totalMB: (fileSize / (1024 * 1024)).toFixed(1),
        });
      };

      spinnerTimer = setInterval(() => {
        spinnerIndex++;
        const now = Date.now();
        if (now - lastUIUpdate >= UI_UPDATE_INTERVAL_MS) {
          renderProgress();
          lastUIUpdate = now;
        }
      }, spinner.interval);

      const updateProgress = (part: number, bytesUploaded: number) => {
        const previousBytes = partProgress.get(part) || 0;
        partProgress.set(part, previousBytes + bytesUploaded);
      };

      const resetPartProgress = (part: number) => {
        partProgress.set(part, 0);
      };

      // Upload parts
      const uploadPart = async ({
        part,
        start,
        end,
      }: {
        part: number;
        start: number;
        end: number;
      }) => {
        const partSize = end - start;

        await retry(
          async (bail: (e: Error) => void, attemptNumber: number) => {
            if (attemptNumber > 1) {
              resetPartProgress(part);
            }

            // Get presigned URL via v2 API
            const partResponse = await client.POST("/v2/images/{id}/parts", {
              params: { path: { id: imageId } },
              body: { part_id: part },
            });

            if (!partResponse.response.ok || !partResponse.data) {
              const status = partResponse.response.status;
              const errorText = await partResponse.response
                .text()
                .catch(() => "");

              if (
                status >= 400 &&
                status < 500 &&
                status !== 408 &&
                status !== 429
              ) {
                bail(
                  new Error(
                    `Failed to get upload URL for part ${part}: ${status} ${partResponse.response.statusText} - ${errorText}`,
                  ),
                );
                return;
              }

              throw new Error(
                `Failed to get upload URL for part ${part}: ${status} ${partResponse.response.statusText} - ${errorText}`,
              );
            }

            const url = partResponse.data.url;

            // Read chunk from disk with progress tracking
            const payload = await readChunk(
              filePath,
              start,
              partSize,
              (bytesRead) => {
                updateProgress(part, bytesRead);
              },
            );

            const res = await fetch(url, {
              method: "PUT",
              headers: {
                "Content-Type": "application/octet-stream",
              },
              body: payload as BodyInit,
            });

            if (!res.ok) {
              if (
                res.status >= 400 &&
                res.status < 500 &&
                res.status !== 408 &&
                res.status !== 429
              ) {
                bail(
                  new Error(
                    `Part ${part} upload failed: ${res.status} ${res.statusText}`,
                  ),
                );
                return;
              }

              throw new Error(
                `Part ${part} upload failed: ${res.status} ${res.statusText}`,
              );
            }
          },
          {
            retries: 5,
            factor: 2,
            randomize: true,
          },
        );

        return part;
      };

      // Process uploads with concurrency limit
      const results: number[] = [];
      try {
        for (let i = 0; i < uploadParts.length; i += concurrencyLimit) {
          const batch = uploadParts.slice(i, i + concurrencyLimit);
          const batchResults = await Promise.allSettled(batch.map(uploadPart));

          for (const result of batchResults) {
            if (result.status === "fulfilled") {
              results.push(result.value);
            } else {
              throw new Error(`Upload failed: ${result.reason}`);
            }
          }
        }
      } finally {
        if (spinnerTimer) {
          clearInterval(spinnerTimer);
          spinnerTimer = undefined;
        }
      }

      progressBar.update(fileSize, {
        spinner: chalk.green("\u2714"),
        speed: "0 B/s",
        uploadedMB: (fileSize / (1024 * 1024)).toFixed(1),
        totalMB: (fileSize / (1024 * 1024)).toFixed(1),
      });
      progressBar.stop();

      finalizingSpinner = ora("Validating upload...").start();

      // Calculate SHA256 hash
      const hash = crypto.createHash("sha256");
      const fileStream = fs.createReadStream(filePath);
      for await (const chunk of fileStream) {
        hash.update(chunk);
      }

      const sha256Hash = hash.digest("hex");

      // Complete upload via v2 API
      const completeResponse = await client.POST("/v2/images/{id}/complete", {
        params: { path: { id: imageId } },
        body: { sha256: sha256Hash },
      });

      if (!completeResponse.response.ok || !completeResponse.data) {
        throw new Error(
          `Failed to complete upload: ${completeResponse.response.status} ${completeResponse.response.statusText}${completeResponse.error ? ` - ${JSON.stringify(completeResponse.error)}` : ""}`,
        );
      }

      finalizingSpinner.succeed("Image uploaded and verified");

      console.log(chalk.gray("\nNext steps:"));
      console.log(`  sf images get ${chalk.cyan(completeResponse.data.id)}`);
    } catch (err) {
      if (spinnerTimer) {
        clearInterval(spinnerTimer);
        spinnerTimer = undefined;
      }

      try {
        progressBar?.stop();
      } catch {
        // Ignore if progress bar not started
      }

      if (preparingSpinner?.isSpinning) {
        preparingSpinner.fail(
          `Upload preparation failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } else if (finalizingSpinner?.isSpinning) {
        finalizingSpinner.fail(
          `Failed to finalize upload: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } else {
        console.error(
          `\n${chalk.red("\u2717")} ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      process.exit(1);
    }
  });

export default upload;
