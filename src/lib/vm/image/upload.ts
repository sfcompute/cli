import { Command } from "@commander-js/extra-typings";
import { brightBlack, cyan, gray, green, red } from "jsr:@std/fmt/colors";
import cliProgress from "cli-progress";
import console from "node:console";
import crypto from "node:crypto";
import { clearInterval, setInterval } from "node:timers";
import retry from "async-retry";
import ora, { type Ora } from "ora";
import cliSpinners from "npm:cli-spinners";
import axios from "axios";
import { apiClient } from "../../../apiClient.ts";

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
      // These magic numbers are not the hard limits, but we don't trust R2 to document them.
      const minChunk = 6 * 1024 * 1024; // 6 MiB
      const maxParts = 100;
      const chunkSize = Math.max(
        minChunk,
        Math.ceil(fileSize / maxParts),
        250 * 1024 * 1024,
      ); // 250 MiB
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
      let lastSpeed = "0 B/s";

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

      const progressBar = new cliProgress.SingleBar({
        format:
          `{spinner} Uploading [{bar}] {percentage}% | {uploadedMB}/{totalMB} MB | {speed}`,
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
        forceRedraw: true,
      });

      progressBar.start(fileSize, 0, {
        spinner: spinner.frames[0],
        speed: "0 B/s",
        uploadedMB: "0.0",
        totalMB: (fileSize / (1024 * 1024)).toFixed(1),
      });

      // Create a timer to animate the spinner at the correct interval
      spinnerTimer = setInterval(() => {
        spinnerIndex++;
        const totalBytesUploaded = getTotalBytesUploaded();
        // Force a redraw to animate the spinner
        progressBar.update(totalBytesUploaded, {
          spinner: spinner.frames[spinnerIndex % spinner.frames.length],
          speed: lastSpeed || "0 B/s",
          uploadedMB: (totalBytesUploaded / (1024 * 1024)).toFixed(1),
          totalMB: (fileSize / (1024 * 1024)).toFixed(1),
        });
      }, spinner.interval);

      const updateProgress = (part: number, bytesUploaded: number) => {
        const previousBytes = partProgress.get(part) || 0;
        partProgress.set(part, previousBytes + bytesUploaded);

        const totalBytesUploaded = getTotalBytesUploaded();
        const elapsedTime = (Date.now() - startTime) / 1000; // seconds
        const speed = totalBytesUploaded / elapsedTime; // bytes per second

        // Format speed
        let speedStr: string;
        if (speed > 1024 * 1024) {
          speedStr = `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
        } else if (speed > 1024) {
          speedStr = `${(speed / 1024).toFixed(1)} KB/s`;
        } else {
          speedStr = `${speed.toFixed(0)} B/s`;
        }

        // Store values for spinner animation
        lastSpeed = speedStr;

        progressBar.update(totalBytesUploaded, {
          spinner: spinner.frames[spinnerIndex % spinner.frames.length],
          speed: speedStr,
          uploadedMB: (totalBytesUploaded / (1024 * 1024)).toFixed(1),
          totalMB: (fileSize / (1024 * 1024)).toFixed(1),
        });
      };

      const resetPartProgress = (part: number) => {
        const previousBytes = partProgress.get(part) || 0;
        if (previousBytes > 0) {
          partProgress.set(part, 0);

          const totalBytesUploaded = getTotalBytesUploaded();
          // Update progress bar to reflect the reset
          progressBar.update(totalBytesUploaded, {
            spinner: spinner.frames[spinnerIndex % spinner.frames.length],
            speed: lastSpeed || "0 B/s",
            uploadedMB: (totalBytesUploaded / (1024 * 1024)).toFixed(1),
            totalMB: (fileSize / (1024 * 1024)).toFixed(1),
          });
        }
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

        // Step 1: Fetch upload URL with retry
        const url = await retry(
          async () => {
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
              const errorText = response.response.ok
                ? "No data in response"
                : await response.response.text();
              throw new Error(
                `Failed to get upload URL for part ${part}: ${response.response.status} ${response.response.statusText} - ${errorText}`,
              );
            }

            return response.data.upload_url;
          },
          {
            retries: 3,
            factor: 2,
            randomize: true,
          },
        );

        // Step 2: Upload the chunk with retry
        await retry(
          async (_: unknown, _attemptNumber: number) => {
            // Reset progress for this part on retry (except first attempt)
            if (_attemptNumber > 1) {
              resetPartProgress(part);
            }

            using file = await Deno.open(filePath, { read: true });
            await file.seek(start, Deno.SeekMode.Start);

            // Read exactly the chunk we need
            const buffer = new Uint8Array(chunkSize);
            const bytesRead = await file.read(buffer) ?? 0;
            const chunk = buffer.subarray(0, bytesRead);

            // Track upload progress with axios
            let lastUploadedBytes = 0;

            const res = await axios.put(url, chunk, {
              headers: {
                "Content-Type": "application/octet-stream",
                "Content-Length": chunk.length.toString(),
              },
              onUploadProgress: (progressEvent) => {
                const uploadedBytes = progressEvent.loaded || 0;
                const deltaBytes = uploadedBytes - lastUploadedBytes;

                if (deltaBytes > 0) {
                  updateProgress(part, deltaBytes);
                  lastUploadedBytes = uploadedBytes;
                }
              },
              maxRedirects: 0,
            });

            if (res.status < 200 || res.status >= 300) {
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
      if (spinnerTimer) {
        clearInterval(spinnerTimer);
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
      const completeResponse = await client.PATCH(
        "/v1/vms/images/{image_id}/complete_upload",
        {
          params: {
            path: {
              image_id: imageId,
            },
          },
          // @ts-ignore Schema not yet updated to include request body with sha256_hash
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
