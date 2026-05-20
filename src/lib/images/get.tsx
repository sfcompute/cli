import console from "node:console";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import dayjs from "dayjs";
import advanced from "dayjs/plugin/advancedFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { Box, render, Text } from "ink";
import Link from "ink-link";
import { apiClient } from "../../apiClient.ts";
import { logAndQuit } from "../../helpers/errors.ts";
import { formatDate } from "../../helpers/format-time.ts";
import type { components } from "../../schema.ts";
import { Row } from "../Row.tsx";
import type { CreateImagesOptions } from "./index.ts";

dayjs.extend(utc);
dayjs.extend(advanced);
dayjs.extend(timezone);

type Image = components["schemas"]["sfc-api_ImageListEntry"];
type Download = components["schemas"]["sfc-api_ImageDownloadResponse"];

function ImageDisplay({
  image,
  download,
}: {
  image: Image;
  download: Download | null;
}) {
  const expiresAt = download ? new Date(download.expires_at * 1000) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;

  return (
    <Box flexDirection="column" padding={0} width={80}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>
          Image: {image.name} ({image.id})
        </Text>
      </Box>

      <Box paddingX={1} flexDirection="column">
        <Row head="Status: " value={formatStatusInk(image.upload_status)} />
        {image.sha256 && <Row head="SHA256: " value={image.sha256} />}
        {download && (
          <>
            <Row
              head="URL: "
              value={
                <Box flexDirection="column" paddingRight={1}>
                  <Text color="cyan">Use curl or wget to download.</Text>
                  <Link url={download.url} fallback={false}>
                    {download.url}
                  </Link>
                </Box>
              }
            />
            {expiresAt && (
              <Row
                head="URL Expiry: "
                value={
                  <Box gap={1}>
                    <Text color={isExpired ? "red" : undefined}>
                      {expiresAt.toISOString()}{" "}
                      {chalk.blackBright(
                        `(${formatDate(dayjs(expiresAt).toDate())} ${dayjs(
                          expiresAt,
                        ).format("z")})`,
                      )}
                    </Text>
                    {isExpired && <Text dimColor>(Expired)</Text>}
                  </Box>
                }
              />
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

function formatStatusInk(status: string): React.ReactElement {
  switch (status) {
    case "started":
      return <Text color="green">Started</Text>;
    case "uploading":
      return <Text color="yellow">Uploading</Text>;
    case "completed":
      return <Text color="cyan">Completed</Text>;
    case "failed":
      return <Text color="red">Failed</Text>;
    case "revoked":
      return <Text color="red">Revoked</Text>;
    default:
      return <Text dimColor>Unknown</Text>;
  }
}

export function createGet(_opts: CreateImagesOptions = {}) {
  return new Command("get")
    .alias("show")
    .description("Get image details and download URL")
    .argument("<id>", "Image ID or name")
    .option("--json", "Output JSON")
    .action(async (id, opts) => {
      const client = await apiClient();

      const { data: image, response } = await client.GET(
        "/preview/v2/images/{id}",
        { params: { path: { id } } },
      );
      if (!response.ok || !image) {
        logAndQuit(
          `Failed to get image: ${response.status} ${response.statusText}`,
        );
      }

      let download: Download | null = null;
      if (image.upload_status === "completed") {
        const { data: downloadData } = await client.GET(
          "/preview/v2/images/{id}/download",
          { params: { path: { id } } },
        );
        if (downloadData) {
          download = downloadData;
        }
      }

      if (opts.json) {
        console.log(JSON.stringify({ ...image, download }, null, 2));
        return;
      }

      render(<ImageDisplay image={image} download={download} />);
    });
}
