import type { Command } from "@commander-js/extra-typings";
import get from "./get.tsx";
import list from "./list.ts";
import upload from "./upload.ts";

export function registerImages(program: Command) {
  const images = program
    .command("images")
    .alias("image")
    .description("Manage images")
    .showHelpAfterError()
    .addHelpText(
      "after",
      `
Examples:\n
  \x1b[2m# Upload an image file\x1b[0m
  $ sf images upload -f ./my-image.raw -n my-image

  \x1b[2m# List all images\x1b[0m
  $ sf images list

  \x1b[2m# Get image details and download URL\x1b[0m
  $ sf images get <image-id>
`,
    )
    .addCommand(list)
    .addCommand(upload)
    .addCommand(get)
    .action(() => {
      images.help();
    });
}
