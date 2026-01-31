import { Command } from "@commander-js/extra-typings";
import list from "./list.tsx";
import show from "./show.tsx";
import upload from "./upload.ts";

const image = new Command("images")
  .alias("os")
  .alias("image")
  .description("Manage VM images")
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
Examples:\n
  \x1b[2m# Upload an image file\x1b[0m
  $ sf node image upload ./my-image.img

  \x1b[2m# List all images\x1b[0m
  $ sf node image list

  \x1b[2m# Show image details and download URL\x1b[0m
  $ sf node image show <image-id>
`,
  )
  .addCommand(list)
  .addCommand(upload)
  .addCommand(show)
  .action(() => {
    image.help();
  });

export function addImage(program: Command) {
  program.addCommand(image);
}

export default image;
