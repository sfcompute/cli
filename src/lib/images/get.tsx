import console from "node:console";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import dayjs from "dayjs";
import advanced from "dayjs/plugin/advancedFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { Box, render, Text } from "ink";
import Link from "ink-link";
import { getAuthToken, loadConfig } from "../../helpers/config.ts";
import { formatDate } from "../../helpers/format-time.ts";
import { handleNodesError, nodesClient } from "../../nodesClient.ts";
import { Row } from "../Row.tsx";

dayjs.extend(utc);
dayjs.extend(advanced);
dayjs.extend(timezone);

function ImageDisplay({
  image,
  download,
}: {
  image: {
    name: string;
    id: string;
    upload_status: string;
    sha256: string | null;
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
    default:
      return <Text dimColor>Unknown</Text>;
  }
}

const get = new Command("get")
  .description("Get image details and download URL")
  .argument("<id>", "Image ID or name")
  .option("--json", "Output JSON")
  .action(async (id, opts) => {
    try {
      const client = await nodesClient();
      const image = await client.vms.images.get(id);

      // Fetch download URL if image is completed
      let download: { url: string; expires_at: number } | null = null;
      if (image.upload_status === "completed") {
        const config = await loadConfig();
        const token = await getAuthToken();
        const downloadResponse = await fetch(
          `${config.api_url}/preview/v2/images/${encodeURIComponent(id)}/download`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (downloadResponse.ok) {
          download = (await downloadResponse.json()) as {
            url: string;
            expires_at: number;
          };
        }
      }

      if (opts.json) {
        console.log(JSON.stringify({ ...image, download }, null, 2));
        return;
      }

      render(
        <ImageDisplay
          image={{ ...image, sha256: image.sha256 ?? null }}
          download={download}
        />,
      );
    } catch (err) {
      handleNodesError(err);
    }
  });

export default get;
