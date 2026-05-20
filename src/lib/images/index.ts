import { Command } from "@commander-js/extra-typings";
import { createGet } from "./get.tsx";
import { createList } from "./list.ts";
import { createUpload } from "./upload.ts";

export interface CreateImagesOptions {
  /**
   * Path users invoke this command under, used in help text and "next steps"
   * suggestions (e.g. `"sf images"`, `"sf nodes images"`, `"sf vm images"`).
   * Defaults to `"sf images"`.
   */
  parentPath?: string;
  /**
   * When true, `list --json` prints just the bare image array and `get --json`
   * prints just the bare image object. Matches the pre-shared-factory output
   * shape of `sf nodes images` / `sf vm images` so existing scripts piping
   * `... --json | jq` keep working. Defaults to `false` (envelope shape).
   */
  legacyJsonShape?: boolean;
}

export function createImagesCommand(opts: CreateImagesOptions = {}) {
  const { parentPath = "sf images", legacyJsonShape = false } = opts;
  const subOpts = { parentPath, legacyJsonShape };
  const images = new Command("images")
    .alias("image")
    .description("Manage images")
    .showHelpAfterError()
    .addHelpText(
      "after",
      `
Examples:\n
  \x1b[2m# Upload an image file\x1b[0m
  $ ${parentPath} upload -f ./my-image.raw -n my-image

  \x1b[2m# List all images\x1b[0m
  $ ${parentPath} list

  \x1b[2m# Get image details and download URL\x1b[0m
  $ ${parentPath} get <image-id>
`,
    )
    .addCommand(createList(subOpts))
    .addCommand(createUpload(subOpts))
    .addCommand(createGet(subOpts))
    .action(() => {
      images.help();
    });
  return images;
}

export function registerImages(program: Command) {
  program.addCommand(createImagesCommand());
}
