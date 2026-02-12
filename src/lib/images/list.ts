import console from "node:console";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";

import { getAuthToken } from "../../../helpers/config.ts";
import { logAndQuit } from "../../../helpers/errors.ts";
import { formatDate } from "../../../helpers/format-time.ts";
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
  $ sf node images list

  \x1b[2m# Get detailed info for a specific image\x1b[0m
  $ sf node images show <image-id>

  \x1b[2m# List images in JSON format\x1b[0m
  $ sf node images list --json
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
        console.log(chalk.gray("\nUpload your first image:"));
        console.log("  sf node images upload -f ./my-image.img -n my-image");
        return;
      }

      // Sort images by created_at (newest first)
      const sortedImages = [...images].sort((a, b) => {
        const aTime = a.created_at || 0;
        const bTime = b.created_at || 0;
        return bTime - aTime;
      });
      const imagesToShow = sortedImages.slice(0, 5);

      // Create and display images table
      const table = new Table({
        head: [
          chalk.cyan("NAME"),
          chalk.cyan("ID"),
          chalk.cyan("STATUS"),
          chalk.cyan("CREATED"),
        ],
        style: {
          head: [],
          border: ["gray"],
        },
      });

      for (const image of imagesToShow) {
        const createdAt = image.created_at
          ? formatDate(new Date(image.created_at * 1000))
          : "Unknown";

        const status = (() => {
          switch (image.upload_status) {
            case "started":
              return chalk.green("Started");
            case "uploading":
              return chalk.yellow("Uploading");
            case "completed":
              return chalk.cyan("Completed");
            case "failed":
              return chalk.red("Failed");
            default:
              return chalk.gray("Unknown");
          }
        })();

        table.push([image.name, image.image_id, status, createdAt]);
      }
      if (images.length > 5) {
        table.push([
          {
            colSpan: 4,
            content: chalk.blackBright(
              `${images.length - 5} older ${
                images.length - 5 === 1 ? "image" : "images"
              } not shown. Use sf node images list --json to list all images.`,
            ),
          },
        ]);
      }

      console.log(table.toString());

      // Show next steps
      console.log(chalk.gray("\nNext steps:"));

      // Always show how to get info for a specific image
      const firstImage = sortedImages[0];
      if (firstImage) {
        console.log(`  sf node images show ${chalk.cyan(firstImage.image_id)}`);
      }
      const firstCompletedImage = sortedImages.find(
        (image) => image.upload_status === "completed",
      );
      if (firstCompletedImage) {
        console.log(
          `  sf nodes create -z hayesvalley -d 2h -p 13.50 --image ${chalk.cyan(
            firstCompletedImage.image_id,
          )}`,
        );
      }
    } catch (err) {
      handleNodesError(err);
    }
  });

export default list;
