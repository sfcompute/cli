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

async function readChunk(
  filePath: string,
  start: number,
  chunkSize: number,
): Promise<Uint8Array> {
  using file = await Deno.open(filePath, { read: true });
  await file.seek(start, Deno.SeekMode.Start);

  const buffer = new Uint8Array(chunkSize);
  let totalBytesRead = 0;
  let emptyReadCount = 0;
  const maxEmptyReads = 100;

  while (totalBytesRead < chunkSize) {
    const bytesRead = await file.read(buffer.subarray(totalBytesRead));
    if (bytesRead === null) {
      // EOF reached
      break;
    }
    if (bytesRead === 0) {
      // No bytes read but not EOF, continue looping
      emptyReadCount++;
      if (emptyReadCount >= maxEmptyReads) {
        throw new Error(
          `Failed to read chunk: reached ${maxEmptyReads} consecutive empty reads without EOF`,
        );
      }
      continue;
    }
    // Non-empty read, reset counter
    emptyReadCount = 0;
    totalBytesRead += bytesRead;
  }

  return buffer.subarray(0, totalBytesRead);
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

    try {
      // Stage 0: Initialization
      const fileInfo = await Deno.stat(filePath);
      const fileSize = fileInfo.size;
      console.error(
        `[DEBUG:init] Starting upload - file=${filePath}, size=${fileSize} bytes (${
          (fileSize / (1024 * 1024 * 1024)).toFixed(2)
        } GB), concurrency=${concurrencyLimit}`,
      );

      preparingSpinner = ora(`Preparing upload for ${name}...`).start();
      const client = await apiClient();

      // Stage 1: Start upload call
      console.error(
        `[DEBUG:api.startUpload] Calling start_upload API for name=${name}`,
      );
      const apiStartTime = Date.now();
      const startResponse = await client.POST("/v1/vms/images/start_upload", {
        body: {
          name,
        },
      });
      const startDuration = Date.now() - apiStartTime;

      if (!startResponse.data) {
        console.error(
          `[DEBUG:api.startUpload] FAILED - status=${startResponse.response.status}, duration=${startDuration}ms`,
        );
        throw new Error(
          `Failed to start upload: ${startResponse.response.status} ${startResponse.response.statusText}`,
        );
      }

      const imageId = startResponse.data.image_id;
      console.error(
        `[DEBUG:api.startUpload] SUCCESS - imageId=${imageId}, duration=${startDuration}ms`,
      );
      preparingSpinner.succeed(
        `Started upload for image ${cyan(name)} (${brightBlack(imageId)})`,
      );

      // Stage 3: Calculate parts for progress tracking
      // These magic numbers are not the hard limits, but we don't trust R2 to document them.
      const minChunk = 6 * 1024 * 1024; // 6 MiB
      const maxParts = 100;
      const chunkSize = Math.max(
        minChunk,
        Math.ceil(fileSize / maxParts),
        250 * 1024 * 1024,
      ); // 250 MiB
      const totalParts = Math.ceil(fileSize / chunkSize);
      console.error(
        `[DEBUG:scheduler.queue] Calculated parts - totalParts=${totalParts}, chunkSize=${chunkSize} bytes (${
          (chunkSize / (1024 * 1024)).toFixed(2)
        } MB)`,
      );
      if (totalParts > 10000) {
        console.error(
          `[DEBUG:scheduler.queue] WARNING: totalParts (${totalParts}) exceeds S3 limit of 10,000`,
        );
      }

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
      console.error(
        `[DEBUG:scheduler.queue] Queue ready - first part: ${
          JSON.stringify(uploadParts[0])
        }, last part: ${JSON.stringify(uploadParts[uploadParts.length - 1])}`,
      );

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
        console.error(
          `[DEBUG:uploadPart] Part ${part} starting - byteRange=[${start}, ${end}), size=${chunkSize}`,
        );

        // Step 1: Fetch upload URL with retry
        const url = await retry(
          async (bail: (err: Error) => void, attemptNumber: number) => {
            console.error(
              `[DEBUG:api.getPresignedUrl] Part ${part} - fetching URL (attempt ${attemptNumber})`,
            );
            const urlFetchStart = Date.now();
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
            const urlFetchDuration = Date.now() - urlFetchStart;

            if (!response.response.ok || !response.data) {
              const errorText = response.response.ok
                ? "No data in response"
                : await response.response.text();
              console.error(
                `[DEBUG:api.getPresignedUrl] Part ${part} FAILED - status=${response.response.status}, duration=${urlFetchDuration}ms, attempt=${attemptNumber}`,
              );
              throw new Error(
                `Failed to get upload URL for part ${part}: ${response.response.status} ${response.response.statusText} - ${errorText}`,
              );
            }

            console.error(
              `[DEBUG:api.getPresignedUrl] Part ${part} SUCCESS - duration=${urlFetchDuration}ms, attempt=${attemptNumber}`,
            );
            return response.data.upload_url;
          },
          {
            retries: 3,
            factor: 2,
            randomize: true,
            onRetry: (err: Error, attemptNumber: number) => {
              console.error(
                `[DEBUG:retry] Part ${part} URL fetch retry ${attemptNumber} - error: ${err.message}`,
              );
            },
          },
        );

        // Step 2: Upload the chunk with retry
        await retry(
          async (_: unknown, attemptNumber: number) => {
            console.error(
              `[DEBUG:r2.uploadPart] Part ${part} - starting upload to R2 (attempt ${attemptNumber})`,
            );
            // Reset progress for this part on retry (except first attempt)
            if (attemptNumber > 1) {
              console.error(
                `[DEBUG:r2.uploadPart] Part ${part} - resetting progress for retry ${attemptNumber}`,
              );
              resetPartProgress(part);
            }

            const readStart = Date.now();
            const chunk = await readChunk(filePath, start, chunkSize);
            const readDuration = Date.now() - readStart;
            console.error(
              `[DEBUG:fs.readPart] Part ${part} - read ${chunk.length} bytes in ${readDuration}ms (${
                ((chunk.length / (1024 * 1024)) / (readDuration / 1000))
                  .toFixed(2)
              } MB/s)`,
            );

            // Track upload progress with axios
            let lastUploadedBytes = 0;
            let lastProgressLog = Date.now();
            const uploadStart = Date.now();

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

                // Log progress every 10 seconds
                const now = Date.now();
                if (now - lastProgressLog > 10000) {
                  const percent = ((uploadedBytes / chunk.length) * 100)
                    .toFixed(1);
                  const elapsed = (now - uploadStart) / 1000;
                  const throughput = uploadedBytes / elapsed / (1024 * 1024);
                  console.error(
                    `[DEBUG:r2.uploadPartProgress] Part ${part} - ${percent}% (${
                      (uploadedBytes / (1024 * 1024)).toFixed(1)
                    }/${(chunk.length / (1024 * 1024)).toFixed(1)} MB), ${
                      throughput.toFixed(2)
                    } MB/s`,
                  );
                  lastProgressLog = now;
                }
              },
              maxRedirects: 0,
              timeout: 15 * 60 * 1000, // 15 minute timeout per part
            });

            const uploadDuration = Date.now() - uploadStart;
            const throughput = chunk.length / (uploadDuration / 1000) /
              (1024 * 1024);

            if (res.status < 200 || res.status >= 300) {
              console.error(
                `[DEBUG:r2.uploadPart] Part ${part} FAILED - status=${res.status}, duration=${uploadDuration}ms, attempt=${attemptNumber}`,
              );
              throw new Error(
                `Part ${part} upload failed: ${res.status} ${res.statusText}`,
              );
            }

            console.error(
              `[DEBUG:r2.uploadPart] Part ${part} SUCCESS - uploaded ${chunk.length} bytes in ${uploadDuration}ms (${
                throughput.toFixed(2)
              } MB/s), ETag=${
                res.headers.etag || "none"
              }, attempt=${attemptNumber}`,
            );
          },
          {
            retries: 5,
            factor: 2,
            randomize: true,
            onRetry: (err: Error, attemptNumber: number) => {
              console.error(
                `[DEBUG:retry] Part ${part} upload retry ${attemptNumber} - error: ${err.message}`,
              );
            },
          },
        );

        // Mark part as complete
        console.error(`[DEBUG:uploadPart] Part ${part} COMPLETE`);
        return part;
      };

      // Process uploads with concurrency limit
      const results: number[] = [];
      let batchId = 0;
      for (let i = 0; i < uploadParts.length; i += concurrencyLimit) {
        batchId++;
        const batch = uploadParts.slice(i, i + concurrencyLimit);
        const batchParts = batch.map((p) => p.part);
        console.error(
          `[DEBUG:scheduler.batch] Batch ${batchId} START - parts=[${
            batchParts[0]
          }..${
            batchParts[batchParts.length - 1]
          }] (${batchParts.length} parts), completed=${results.length}/${uploadParts.length}`,
        );
        const batchStart = Date.now();

        const batchResults = await Promise.allSettled(
          batch.map(uploadPart),
        );

        let succeeded = 0;
        let failed = 0;
        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            results.push(result.value);
            succeeded++;
          } else {
            failed++;
            console.error(
              `[DEBUG:scheduler.batch] Batch ${batchId} - part FAILED: ${result.reason}`,
            );
            throw new Error(`Upload failed: ${result.reason}`);
          }
        }
        const batchDuration = Date.now() - batchStart;
        console.error(
          `[DEBUG:scheduler.batch] Batch ${batchId} DONE - succeeded=${succeeded}, failed=${failed}, duration=${batchDuration}ms (${
            (batchDuration / 1000 / 60).toFixed(2)
          } min)`,
        );
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
      console.error(
        `[DEBUG:hash] Starting SHA256 calculation for ${fileSize} bytes`,
      );
      const hashStart = Date.now();
      const hash = crypto.createHash("sha256");

      using file = await Deno.open(filePath, { read: true });
      let hashBytesProcessed = 0;
      let lastHashLog = Date.now();
      for await (const chunk of file.readable) {
        hash.update(chunk);
        hashBytesProcessed += chunk.length;

        // Log hash progress every 5 seconds
        const now = Date.now();
        if (now - lastHashLog > 5000) {
          const percent = ((hashBytesProcessed / fileSize) * 100).toFixed(1);
          const throughput = hashBytesProcessed / ((now - hashStart) / 1000) /
            (1024 * 1024);
          console.error(
            `[DEBUG:hash] Progress ${percent}% (${
              (hashBytesProcessed / (1024 * 1024 * 1024)).toFixed(2)
            }/${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB), ${
              throughput.toFixed(2)
            } MB/s`,
          );
          lastHashLog = now;
        }
      }

      const sha256Hash = hash.digest("hex");
      const hashDuration = Date.now() - hashStart;
      console.error(
        `[DEBUG:hash] Complete - sha256=${sha256Hash}, duration=${hashDuration}ms (${
          (hashDuration / 1000 / 60).toFixed(2)
        } min)`,
      );

      console.error(
        `[DEBUG:api.completeUpload] Calling complete_upload with ${results.length} parts`,
      );
      const completeStart = Date.now();
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
      const completeDuration = Date.now() - completeStart;

      if (!completeResponse.data) {
        console.error(
          `[DEBUG:api.completeUpload] FAILED - status=${completeResponse.response.status}, duration=${completeDuration}ms`,
        );
        throw new Error(
          `Failed to complete upload: ${completeResponse.response.status} ${completeResponse.response.statusText}`,
        );
      }

      console.error(
        `[DEBUG:api.completeUpload] SUCCESS - duration=${completeDuration}ms`,
      );
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
