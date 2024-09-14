import ora from "ora";
import chalk from "chalk";
import { getOrder } from "./fetchers";
import { logAndQuit } from "./errors";

export async function waitForOrderToNotBePending(orderId: string) {
    const spinner = ora(`Order ${orderId} - pending (this can take a moment)`).start();
    const maxTries = 25;
    for (let i = 0; i < maxTries; i++) {
        const order = await getOrder(orderId);

        if (order && order?.status !== "pending") {
            spinner.text = `Order ${orderId} - ${order?.status}`;
            spinner.succeed();
            console.log(chalk.green("Order placed successfully"));
            return order;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    spinner.fail();
    logAndQuit(`Order ${orderId} - possibly failed`);
}
