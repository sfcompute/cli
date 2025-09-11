import { Command } from "@commander-js/extra-typings";
import { cyan, gray, green, red, yellow } from "jsr:@std/fmt/colors";
import console from "node:console";
import ora from "ora";
import Table from "cli-table3";

import { getAuthToken } from "../../../helpers/config.ts";
import { logAndQuit } from "../../../helpers/errors.ts";
import { formatDate } from "../../../helpers/format-date.ts";
import { handleNodesError, nodesClient } from "../../../nodesClient.ts";

const list = new Command("list")
  .alias("ls")
  .description("List all VM images")
  .showHelpAfterError()
  .option("--json", "Output in JSON format")
  .addHelpText(
    "after",
    `
Next Steps:\n
  \x1b[2m# List all images\x1b[0m
  $ sf vms images list

  \x1b[2m# Get detailed info for a specific image\x1b[0m
  $ sf vms images show <image-id>

  \x1b[2m# List images in JSON format\x1b[0m
  $ sf vms images list --json
`,
  )
  .action(async (options) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        logAndQuit("Not logged in. Please run 'sf login' first.");
      }
      const client = await nodesClient(token);

      const spinner = ora("Fetching images...").start();
      const { data: images } = await client.vms.images.list();

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(images, null, 2));
        return;
      }

      if (images.length === 0) {
        console.log("No images found.");
        console.log(gray("\nUpload your first image:"));
        console.log("  sf vms images upload -f ./my-image.img -n my-image");
        return;
      }

      // Sort images by created_at (newest first)
      const sortedImages = [...images].slice(0, 5).sort((a, b) => {
        const aTime = a.created_at || 0;
        const bTime = b.created_at || 0;
        return bTime - aTime;
      });

      // Create and display images table
      const table = new Table({
        head: [
          cyan("NAME"),
          cyan("ID"),
          cyan("STATUS"),
          cyan("CREATED"),
        ],
        style: {
          head: [],
          border: ["gray"],
        },
      });

      for (const image of sortedImages) {
        const createdAt = image.created_at
          ? formatDate(new Date(image.created_at * 1000))
          : "Unknown";

        const status = (() => {
          switch (image.upload_status) {
            case "started":
              return green("Started");
            case "uploading":
              return yellow("Uploading");
            case "completed":
              return cyan("Completed");
            case "failed":
              return red("Failed");
            default:
              return gray("Unknown");
          }
        })();

        table.push([
          image.name,
          image.image_id,
          status,
          createdAt,
        ]);
      }

      console.log(table.toString());
      console.log(
        gray(
          `Found ${images.length} ${images.length === 1 ? "image" : "images"}.`,
        ),
      );

      // Show next steps
      console.log(gray("\nNext steps:"));

      // Always show how to get info for a specific image
      const firstImage = sortedImages[0];
      if (firstImage) {
        console.log(`  sf vms images show ${firstImage.image_id}`);
      }
    } catch (err) {
      handleNodesError(err);
    }
  });

export default list;
