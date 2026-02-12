import console from "node:console";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";
import { apiClient } from "../../apiClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { formatDate } from "../../helpers/format-time.ts";

const list = new Command("list")
  .alias("ls")
  .description("List images")
  .showHelpAfterError()
  .option("--json", "Output in JSON format")
  .addHelpText(
    "after",
    `
Examples:\n
  \x1b[2m# List all images\x1b[0m
  $ sf images list

  \x1b[2m# Get detailed info for a specific image\x1b[0m
  $ sf images get <image-id>

  \x1b[2m# List images in JSON format\x1b[0m
  $ sf images list --json
`,
  )
  .action(async (options) => {
    const client = await apiClient();

    const spinner = ora("Fetching images...").start();
    const { data: result, response } = await client.GET("/v2/images");
    spinner.stop();

    if (!response.ok || !result) {
      logAndQuit(`Failed to list images: ${response.status} ${response.statusText}`);
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const images = result.data;

    if (images.length === 0) {
      console.log("No images found.");
      console.log(chalk.gray("\nUpload your first image:"));
      console.log("  sf images upload -f ./my-image.img -n my-image");
      return;
    }

    // Sort images by created_at (newest first)
    const sortedImages = [...images].sort((a, b) => {
      return (b.created_at || 0) - (a.created_at || 0);
    });
    const imagesToShow = sortedImages.slice(0, 5);

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

      const status = formatStatus(image.upload_status);

      table.push([image.name, image.id, status, createdAt]);
    }

    if (images.length > 5) {
      table.push([
        {
          colSpan: 4,
          content: chalk.blackBright(
            `${images.length - 5} older ${
              images.length - 5 === 1 ? "image" : "images"
            } not shown. Use sf images list --json to list all images.`,
          ),
        },
      ]);
    }

    console.log(table.toString());

    console.log(chalk.gray("\nNext steps:"));
    const firstImage = sortedImages[0];
    if (firstImage) {
      console.log(`  sf images get ${chalk.cyan(firstImage.id)}`);
    }
  });

function formatStatus(status: string): string {
  switch (status) {
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
}

export default list;
