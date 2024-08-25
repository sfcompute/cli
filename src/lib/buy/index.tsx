import type { Command } from "commander";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import duration from "dayjs/plugin/duration";
import { nullifyIfEmpty } from "../../helpers/empty";
import parseDuration from "parse-duration";
import { priceWholeToCenticents } from "../../helpers/units";
import * as chrono from "chrono-node";
import SFBuy from "./SFBuy";
import { renderCommand } from "../../ui/render";
import type { InstanceType } from "../../api/instances";
import { isLoggedIn } from "../../helpers/config";
import { logLoginMessageAndQuit } from "../../helpers/errors";

dayjs.extend(relativeTime);
dayjs.extend(duration);

interface SfBuyOptions {
  type?: string;
  nodes?: string;
  duration?: string;
  start?: string;
  price?: string;
  ioc?: boolean;
  yes?: boolean;
}

export function registerBuy(program: Command) {
  program
    .command("buy")
    .description("Place a buy order for compute")
    .option("-t, --type <type>", "Specify the type of node")
    .option("-n, --nodes <quantity>", "Specify the number of nodes")
    .option(
      "-d, --duration <duration>",
      "Specify the duration (e.g. 1h, 1d, 1w)",
    )
    .option(
      "-s, --start <start>",
      "Specify the start date (e.g. 'at 2pm' or 'tomorrow at 3pm')",
    )
    .option(
      "-p, --price <price>",
      "Specify a limit price (the most you'd pay for the compute block)",
    )
    .option("--ioc", "Cancel immediately if not filled")
    .option("-y, --yes", "Automatically confirm and place the order")
    .action(async (options: SfBuyOptions) => {
      // check auth
      const loggedIn = await isLoggedIn();
      if (!loggedIn) {
        logLoginMessageAndQuit();
        return;
      }

      // collect args
      const argInstanceType = (options.type as InstanceType) ?? null;
      const argTotalNodes = options.nodes ? Number(options.nodes) : null;
      const argDurationSeconds = options.duration
        ? nullifyIfEmpty(parseDuration(options.duration, "s"))
        : null;

      // parse start at
      const startAtDate = options.start
        ? nullifyIfEmpty(chrono.parseDate(options.start as string))
        : null;
      const argStartAtIso = startAtDate?.toISOString() ?? null;

      const { centicents: argLimitPrice } = priceWholeToCenticents(
        options.price,
      );
      const argImmediateOrCancel = options.ioc ?? null;
      const automaticallyPlaceOrder = options.yes ?? false;

      renderCommand(
        <SFBuy
          instanceType={argInstanceType}
          totalNodes={argTotalNodes}
          durationSeconds={argDurationSeconds}
          startAtIso={argStartAtIso}
          limitPrice={argLimitPrice}
          immediateOrCancel={argImmediateOrCancel}
          forceAutomaticallyPlaceOrder={automaticallyPlaceOrder}
        />,
      );
    });
}
