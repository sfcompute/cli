import { Command } from "@commander-js/extra-typings";
import upload from "./upload.ts";
import show from "./show.tsx";
import list from "./list.tsx";

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
  $ sf vm image upload ./my-image.img

  \x1b[2m# List all images\x1b[0m
  $ sf vm image list

  \x1b[2m# Show image details and download URL\x1b[0m
  $ sf vm image show <image-id>
`,
  )
  .addCommand(list)
  .addCommand(upload)
  .addCommand(show)
  .action(() => {
    image.help();
  });

export default image;
