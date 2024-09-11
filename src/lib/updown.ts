import type { Command } from "commander";
import { apiClient } from "../apiClient";
import parseDuration from "parse-duration";
import { logAndQuit } from "../helpers/errors";
import { getBalance } from "./balance";

export function registerUp(program: Command) {
    const cmd = program
        .command("up")
        .description("Automatically buy nodes until you have the desired quantity")
        .option(
            "-n <quantity>",
            "The number of nodes to purchase continuously",
            "1",
        )
        .option("-t, --type <type>", "Specify the type of node", "h100i")
        .option("-d, --duration <duration>", "Specify the minimum duration")
        .option("-p, --price <price>", "Specify the maximum price per node per hour");

    cmd.action(async (options) => {
        up(options);
    });
}

function getDefaultProcurementOptions(props: {
    duration?: string;
    n?: string;
    pricePerNodeHour?: string;
    type?: string;
}) {
    // Minimum block duration is 2 hours
    // which is a bit of a smoother experience (we might want to increase this)
    const duration = props.duration ?? "2h";
    const durationHours = parseDuration(duration, "h");
    if (!durationHours) {
        logAndQuit(`Failed to parse duration: ${duration}`);
    }

    const defaultPrice = 2.65 * 8;
    const pricePerNodeHourInDollars = props.pricePerNodeHour ? Number.parseInt(props.pricePerNodeHour) : defaultPrice;
    const pricePerNodeHourInCenticents = Math.ceil(pricePerNodeHourInDollars * 10_000);

    const totalPriceInCenticents = pricePerNodeHourInCenticents * Number.parseInt(props.n ?? "1") * durationHours;

    return {
        durationHours: Math.ceil(durationHours),
        pricePerNodeHourInCenticents: pricePerNodeHourInCenticents,
        n: Number.parseInt(props.n ?? "1"),
        type: props.type ?? "h100i",
        totalPriceInCenticents
    };
}

async function up(props: {
    n: string;
    type: string;
    duration?: string;
    price?: string;
}) {
    const client = await apiClient();

    const { durationHours, n, type, pricePerNodeHourInCenticents, totalPriceInCenticents } = getDefaultProcurementOptions(props);

    if (durationHours && durationHours < 1) {
        console.error("Minimum duration is 1 hour");
        return;
    }

    const balance = await getBalance();
    if (balance.available.centicents < totalPriceInCenticents) {
        console.error(`Insufficient balance to purchase nodes. Available balance: $${(balance.available.centicents / 1000000).toFixed(2)}, Total price: $${(totalPriceInCenticents / 1000000).toFixed(2)}`);
        return;
    }

    // check if there's already a procurement like this
    const procurements = await client.GET("/v0/procurements");
    if (!procurements.response.ok) {
        console.error(procurements.error?.message, procurements.error?.details);
        throw new Error("Failed to list procurements");
    }

    for (const procurement of procurements.data?.data ?? []) {
        // Currently instance groups are the same name as the instance type
        // in the future they might be different.
        if (procurement.instance_group === props.type) {
            const res = await client.PUT("/v0/procurements/{id}", {
                params: {
                    path: {
                        id: procurement.id,
                    },
                },
                body: {
                    quantity: n,

                    // we only update the duration & price if it's set
                    block_duration_in_hours: props.duration ? durationHours : undefined,
                    max_price_per_node_hour: props.price ? pricePerNodeHourInCenticents : undefined,
                },
            });
            return res.data
        }
    }

    const res = await client.POST("/v0/procurements", {
        body: {
            instance_type: type,
            quantity: n,
            max_price_per_node_hour: pricePerNodeHourInCenticents,
            block_duration_in_hours: Math.max(durationHours, 1),
        },
    });

    if (!res.response.ok) {
        console.error(res.error?.message, res.error?.details);
        throw new Error("Failed to purchase nodes");
    }

    return res.data;
}

