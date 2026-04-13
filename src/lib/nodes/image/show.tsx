import console from "node:console";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import dayjs from "dayjs";
import advanced from "dayjs/plugin/advancedFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { Box, render, Text } from "ink";
import Link from "ink-link";
import { apiClient } from "../../../apiClient.ts";
import { logAndQuit } from "../../../helpers/errors.ts";
import { formatDate } from "../../../helpers/format-time.ts";
import { Row } from "../../Row.tsx";

dayjs.extend(utc);
dayjs.extend(advanced);
dayjs.extend(timezone);

export function ImageDisplay({
  image,
  download,
}: {
  image: {
    name: string;
    id: string;
    upload_status: string;
  };
  download: { url: string; expires_at: number } | null;
}) {
  const expiresAt = download?.expires_at
    ? new Date(download.expires_at * 1000)
    : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;

  return (
    <Box flexDirection="column" padding={0} width={80}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>
          Image: {image.name} ({image.id})
        </Text>
      </Box>

      <Box paddingX={1} flexDirection="column">
        <Row
          head="Status: "
          value={
            <Box gap={1}>
              <Text color={formatStatusColor(image.upload_status)}>
                {formatStatusText(image.upload_status)}
              </Text>
            </Box>
          }
        />
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

function formatStatusColor(status: string): string {
  switch (status) {
    case "started":
      return "green";
    case "uploading":
      return "yellow";
    case "completed":
      return "cyan";
    case "failed":
      return "red";
    default:
      return "gray";
  }
}

function formatStatusText(status: string): string {
  switch (status) {
    case "started":
      return "Started";
    case "uploading":
      return "Uploading";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Unknown";
  }
}

const show = new Command("show")
  .description("Show VM image details and download URL")
  .argument("<image-id>", "ID of the image")
  .option("--json", "Output JSON")
  .action(async (imageId, opts) => {
    const client = await apiClient();

    const { data: image, response } = await client.GET("/v2/images/{id}", {
      params: { path: { id: imageId } },
    });
    if (!response.ok || !image) {
      logAndQuit(
        `Failed to get image: ${response.status} ${response.statusText}`,
      );
    }

    let download = null;
    if (image.upload_status === "completed") {
      const { data: downloadData, response: downloadResponse } =
        await client.GET("/v2/images/{id}/download", {
          params: { path: { id: imageId } },
        });
      if (downloadResponse.ok && downloadData) {
        download = downloadData;
      }
    }

    if (opts.json) {
      console.log(JSON.stringify({ ...image, download }, null, 2));
      return;
    }

    render(<ImageDisplay image={image} download={download} />);
  });

export default show;
