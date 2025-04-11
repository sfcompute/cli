import ora from "ora";
import { setTimeout } from "node:timers";
import { logAndQuit } from "./errors.ts";
import { getOrder } from "./fetchers.ts";

export async function waitForOrderToNotBePending(orderId: string) {
  const spinner = ora(
    `Order ${orderId} - pending (this can take a moment)`
  ).start();

  // 1 minute
  const maxTries = 120;
  for (let i = 0; i < maxTries; i++) {
    const order = await getOrder(orderId);

    if (order && order?.status !== "pending") {
      spinner.text = `Order ${orderId} - ${order?.status}`;
      spinner.succeed();
      return order;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  spinner.fail();
  logAndQuit(`Order ${orderId} - possibly failed`);
}
