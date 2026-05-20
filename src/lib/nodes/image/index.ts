import { createImagesCommand } from "../../images/index.ts";

/**
 * Returns the shared images command configured for use under `sf nodes`:
 *   - `os` alias is preserved (original `sf nodes images` had `os` and `image`).
 *   - Help text examples reference `sf nodes images …`.
 *   - `list --json` outputs the bare image array (matching pre-shared-factory
 *     behavior so scripts piping `... --json | jq '.[].id'` keep working).
 */
export default function createNodesImagesCommand() {
  return createImagesCommand({
    parentPath: "sf nodes images",
    legacyJsonShape: true,
  }).alias("os");
}
