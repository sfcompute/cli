import boxen from "boxen";
import chalk from "chalk";
import * as console from "node:console";

type AppBanner = {
  type: "warning";
  content: string;
};

export const getAppBanner = async () => {
  try {
    const response = await fetch("https://sfcompute.com/api/banner", {
      signal: AbortSignal.timeout(300),
    });
    const data = await response.json() as AppBanner;

    if (data.type === "warning" && data.content) {
      const message = `${data.content}`;

      console.log(
        boxen(chalk.yellow(message), {
          padding: 1,
          borderColor: "yellow",
          borderStyle: "round",
        }),
      );
    }

    return;
  } catch {
    // Silently fail
    return;
  }
};
