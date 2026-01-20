import console from "node:console";
import { Command } from "@commander-js/extra-typings";
import type SFCNodes from "@sfcompute/nodes-sdk-alpha";
import chalk from "chalk";
import dayjs from "dayjs";
import advanced from "dayjs/plugin/advancedFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { Box, Text, render } from "ink";
import Link from "ink-link";
import { formatDate } from "../../../helpers/format-date.ts";
import { handleNodesError, nodesClient } from "../../../nodesClient.ts";
import { Row } from "../../Row.tsx";

dayjs.extend(utc);
dayjs.extend(advanced);
dayjs.extend(timezone);

export function ImageDisplay({
  image,
}: {
  image: SFCNodes.VMs.ImageGetResponse;
}) {
  const expiresAt = image.expires_at ? new Date(image.expires_at) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;

  const statusColor = isExpired ? "red" : "green";
  const statusText = isExpired ? "Expired" : "Ready";

  return (
    <Box flexDirection="column" padding={0} width={80}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>
          Image: {image.name} ({image.image_id})
        </Text>
      </Box>

      <Box paddingX={1} flexDirection="column">
        <Row
          head="Status: "
          value={
            <Box gap={1}>
              <Text color={statusColor}>{statusText}</Text>
            </Box>
          }
        />
        <Row
          head="URL: "
          value={
            <Box flexDirection="column" paddingRight={1}>
              <Text color="cyan">Use curl or wget to download.</Text>
              <Link url={image.download_url} fallback={false}>
                {image.download_url}
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
      </Box>
    </Box>
  );
}

const show = new Command("show")
  .description("Show VM image details and download URL")
  .argument("<image-id>", "ID of the image")
  .option("--json", "Output JSON")
  .action(async (imageId, opts) => {
    try {
      const client = await nodesClient();
      const data = await client.vms.images.get(imageId);

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      render(<ImageDisplay image={data} />);
    } catch (err) {
      handleNodesError(err);
    }
  });

export default show;
