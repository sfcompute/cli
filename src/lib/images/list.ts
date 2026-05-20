import console from "node:console";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";
import { apiClient } from "../../apiClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { formatDate } from "../../helpers/format-time.ts";
import type { CreateImagesOptions } from "./index.ts";
import { getDefaultWorkspace } from "./utils.ts";

export function createList(opts: CreateImagesOptions = {}) {
  const { parentPath = "sf images", legacyJsonShape = false } = opts;
  return new Command("list")
    .alias("ls")
    .description("List images")
    .showHelpAfterError()
    .option("--json", "Output in JSON format")
    .addHelpText(
      "after",
      `
Examples:\n
  \x1b[2m# List all images\x1b[0m
  $ ${parentPath} list

  \x1b[2m# Get detailed info for a specific image\x1b[0m
  $ ${parentPath} get <image-id>

  \x1b[2m# List images in JSON format\x1b[0m
  $ ${parentPath} list --json
`,
    )
    .action(async (options) => {
      const client = await apiClient();
      const workspace = await getDefaultWorkspace();

      const spinner = ora("Fetching images...").start();
      const { data, response } = await client.GET("/preview/v2/images", {
        params: { query: { workspace } },
      });
      spinner.stop();

      if (!response.ok || !data) {
        logAndQuit(
          `Failed to list images: ${response.status} ${response.statusText}`,
        );
      }

      if (options.json) {
        // legacyJsonShape: print just the bare array so existing scripts
        // piping `... --json | jq '.[].id'` keep working under `sf nodes
        // images list` / `sf vm images list`. Default (envelope) is the
        // shape preferred for the new top-level `sf images list`.
        console.log(
          JSON.stringify(legacyJsonShape ? data.data : data, null, 2),
        );
        return;
      }

      const images = data.data;

      if (images.length === 0) {
        console.log("No images found.");
        console.log(chalk.gray("\nUpload your first image:"));
        console.log(`  ${parentPath} upload -f ./my-image.img -n my-image`);
        return;
      }

      const sortedImages = [...images].sort(
        (a, b) => (b.created_at || 0) - (a.created_at || 0),
      );
      const imagesToShow = sortedImages.slice(0, 5);

      const table = new Table({
        head: [
          chalk.cyan("NAME"),
          chalk.cyan("ID"),
          chalk.cyan("STATUS"),
          chalk.cyan("CREATED"),
        ],
        style: { head: [], border: ["gray"] },
      });

      for (const image of imagesToShow) {
        const createdAt = image.created_at
          ? formatDate(new Date(image.created_at * 1000))
          : "Unknown";
        table.push([
          image.name,
          image.id,
          formatStatus(image.upload_status),
          createdAt,
        ]);
      }

      if (images.length > 5) {
        table.push([
          {
            colSpan: 4,
            content: chalk.blackBright(
              `${images.length - 5} older ${
                images.length - 5 === 1 ? "image" : "images"
              } not shown. Use ${parentPath} list --json to list all images.`,
            ),
          },
        ]);
      }

      console.log(table.toString());

      console.log(chalk.gray("\nNext steps:"));
      const firstImage = sortedImages[0];
      if (firstImage) {
        console.log(`  ${parentPath} get ${chalk.cyan(firstImage.id)}`);
      }
      const firstCompletedImage = sortedImages.find(
        (image) => image.upload_status === "completed",
      );
      if (firstCompletedImage) {
        console.log(
          `  sf nodes create -z hayesvalley -d 2h -p 13.50 --image ${chalk.cyan(
            firstCompletedImage.id,
          )}`,
        );
      }
    });
}

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
    case "revoked":
      return chalk.red("Revoked");
    default:
      return chalk.gray("Unknown");
  }
}
