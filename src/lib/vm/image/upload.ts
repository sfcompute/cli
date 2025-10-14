import { Command } from "@commander-js/extra-typings";
import { brightBlack, cyan, gray, green, red } from "jsr:@std/fmt/colors";
import cliProgress from "cli-progress";
import console from "node:console";
import crypto from "node:crypto";
import { clearInterval, setInterval } from "node:timers";
import retry from "async-retry";
import ora, { type Ora } from "ora";
import cliSpinners from "npm:cli-spinners";
import { apiClient } from "../../../apiClient.ts";

async function readChunk(
  filePath: string,
  start: number,
  length: number,
  onProgress?: (bytesRead: number) => void,
): Promise<Uint8Array> {
  const file = await Deno.open(filePath, { read: true });
  try {
    await file.seek(start, Deno.SeekMode.Start);

    const buffer = new Uint8Array(length);
    let offset = 0;

    while (offset < length) {
      const bytesRead = await file.read(buffer.subarray(offset));
      if (bytesRead === null) {
        // EOF reached
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
    file.close();
  }
}

const upload = new Command("upload")
  .description("Upload a VM image file (multipart)")
  .requiredOption("-f, --file <file>", "Path to the image file")
  .requiredOption("-n, --name <name>", "Image name")
  .option(
    "-c, --concurrency <number>",
    "Number of parts to upload concurrently",
    (value) => {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed) || parsed < 1) {
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
      preparingSpinner = ora(`Preparing upload for ${name}...`).start();
      const client = await apiClient();

      // Start upload
      const startResponse = await client.POST("/v1/vms/images/start_upload", {
        body: {
          name,
        },
      });

      if (!startResponse.data) {
        throw new Error(
          `Failed to start upload: ${startResponse.response.status} ${startResponse.response.statusText}`,
        );
      }

      const imageId = startResponse.data.image_id;
      preparingSpinner.succeed(
        `Started upload for image ${cyan(name)} (${brightBlack(imageId)})`,
      );

      // Get file info and open as stream
      const fileInfo = await Deno.stat(filePath);
      const fileSize = fileInfo.size;

      // Calculate parts for progress tracking
      const minChunk = 5 * 1024 * 1024; // 5 MiB (minimum)
      const defaultChunk = 64 * 1024 * 1024; // 64 MiB
      const maxParts = 10000; // object storage supports up to 10k parts

      // For files smaller than default chunk, use the whole file as one part
      // Otherwise use default chunk size, but ensure we don't exceed maxParts
      const chunkSize = fileSize <= defaultChunk
        ? Math.max(fileSize, minChunk)
        : Math.max(minChunk, Math.ceil(fileSize / maxParts), defaultChunk);

      const totalParts = Math.ceil(fileSize / chunkSize);

      // Calculate upload parts metadata
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

      // Create combined ora + progress bar with per-part progress tracking
      const startTime = Date.now();
      // Track progress per part to handle retries correctly
      const partProgress = new Map<number, number>(); // part -> bytes uploaded

      // Derive total bytes uploaded by summing all parts
      const getTotalBytesUploaded = () => {
        let total = 0;
        for (const bytes of partProgress.values()) {
          total += bytes;
        }
        return total;
      };

      // Use cli-spinners for consistent spinner frames and timing
      const spinner = cliSpinners.dots;
      let spinnerIndex = 0;

      progressBar = new cliProgress.SingleBar({
        format:
          `{spinner} Uploading [{bar}] {percentage}% | {uploadedMB}/{totalMB} MB | {speed}`,
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

      // Throttle UI updates to 200ms
      const UI_UPDATE_INTERVAL_MS = 200;
      let lastUIUpdate = 0;

      const renderProgress = () => {
        const totalBytesUploaded = getTotalBytesUploaded();
        const elapsedTime = (Date.now() - startTime) / 1000;
        const speed = totalBytesUploaded / elapsedTime;

        // Format speed
        let speedStr: string;
        if (speed > 1024 * 1024) {
          speedStr = `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
        } else if (speed > 1024) {
          speedStr = `${(speed / 1024).toFixed(1)} KB/s`;
        } else {
          speedStr = `${speed.toFixed(0)} B/s`;
        }

        progressBar.update(totalBytesUploaded, {
          spinner: spinner.frames[spinnerIndex % spinner.frames.length],
          speed: speedStr,
          uploadedMB: (totalBytesUploaded / (1024 * 1024)).toFixed(1),
          totalMB: (fileSize / (1024 * 1024)).toFixed(1),
        });
      };

      // Create a timer to animate the spinner and update progress
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

      // Upload parts concurrently with specified concurrency limit
      const uploadPart = async (
        { part, start, end }: {
          part: number;
          start: number;
          end: number;
        },
      ) => {
        const chunkSize = end - start;

        // Upload the chunk with retry, fetching fresh URL each attempt
        await retry(
          async (bail: (e: Error) => void, attemptNumber: number) => {
            // Reset progress for this part on retry (except first attempt)
            if (attemptNumber > 1) {
              resetPartProgress(part);
            }

            // Fetch fresh upload URL for this attempt
            const response = await client.POST(
              "/v1/vms/images/{image_id}/upload",
              {
                params: {
                  path: {
                    image_id: imageId,
                  },
                },
                body: {
                  part_id: part,
                },
              },
            );

            if (!response.response.ok || !response.data) {
              const status = response.response.status;
              const errorText = response.response.ok
                ? "No data in response"
                : await response.response.text().catch(() => "");

              // Bail on non-transient 4xx errors (except 408 Request Timeout and 429 Too Many Requests)
              if (
                status >= 400 && status < 500 && status !== 408 &&
                status !== 429
              ) {
                bail(
                  new Error(
                    `Failed to get upload URL for part ${part}: ${status} ${response.response.statusText} - ${errorText}`,
                  ),
                );
                return;
              }

              throw new Error(
                `Failed to get upload URL for part ${part}: ${status} ${response.response.statusText} - ${errorText}`,
              );
            }

            const url = response.data.upload_url;

            // Read chunk from disk with progress tracking
            const payload = await readChunk(
              filePath,
              start,
              chunkSize,
              (bytesRead) => {
                updateProgress(part, bytesRead);
              },
            );

            const res = await fetch(url, {
              method: "PUT",
              headers: {
                "Content-Type": "application/octet-stream",
              },
              body: payload,
            });

            if (!res.ok) {
              // Bail on non-transient 4xx errors (except 408 and 429)
              if (
                res.status >= 400 && res.status < 500 && res.status !== 408 &&
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

        // Mark part as complete
        return part;
      };

      // Process uploads with concurrency limit
      const results: number[] = [];
      try {
        for (let i = 0; i < uploadParts.length; i += concurrencyLimit) {
          const batch = uploadParts.slice(i, i + concurrencyLimit);
          const batchResults = await Promise.allSettled(
            batch.map(uploadPart),
          );

          for (const result of batchResults) {
            if (result.status === "fulfilled") {
              results.push(result.value);
            } else {
              throw new Error(`Upload failed: ${result.reason}`);
            }
          }
        }
      } finally {
        // Always clean up timer, even on error
        if (spinnerTimer) {
          clearInterval(spinnerTimer);
          spinnerTimer = undefined;
        }
      }

      progressBar.update(fileSize, {
        spinner: green("✔"),
        speed: "0 B/s",
        uploadedMB: (fileSize / (1024 * 1024)).toFixed(1),
        totalMB: (fileSize / (1024 * 1024)).toFixed(1),
      });
      progressBar.stop();

      finalizingSpinner = ora(`Validating upload...`).start();
      // Calculate SHA256 hash for integrity verification using streaming
      const hash = crypto.createHash("sha256");

      using file = await Deno.open(filePath, { read: true });
      for await (const chunk of file.readable) {
        hash.update(chunk);
      }

      const sha256Hash = hash.digest("hex");
      const completeResponse = await client.PUT(
        "/v1/vms/images/{image_id}/complete_upload",
        {
          params: {
            path: {
              image_id: imageId,
            },
          },
          body: {
            sha256_hash: sha256Hash,
          },
        },
      );

      if (!completeResponse.data) {
        throw new Error(
          `Failed to complete upload: ${completeResponse.response.status} ${completeResponse.response.statusText}`,
        );
      }

      finalizingSpinner.succeed(`Image uploaded and verified`);

      const object = completeResponse.data;
      console.log(gray("\nNext steps:"));
      console.log(`  sf vm images show ${cyan(object.image_id)}`);
    } catch (err) {
      // Clean up spinner timer
      if (spinnerTimer) {
        clearInterval(spinnerTimer);
        spinnerTimer = undefined;
      }

      // Stop progress bar
      try {
        progressBar?.stop();
      } catch {
        // Ignore if progress bar not started
      }

      // Stop any running spinners on error
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
          `\n${red("✗")} ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      Deno.exit(1);
    }
  });

export default upload;
