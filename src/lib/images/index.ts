import { Command } from "@commander-js/extra-typings";
import { createGet } from "./get.tsx";
import { createList } from "./list.ts";
import { createUpload } from "./upload.ts";

export function createImagesCommand() {
  const images = new Command("images")
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
    .addCommand(createList())
    .addCommand(createUpload())
    .addCommand(createGet())
    .action(() => {
      images.help();
    });
  return images;
}

export function registerImages(program: Command) {
  program.addCommand(createImagesCommand());
}
