import type { Command } from "commander";
import { apiClient } from "../apiClient";

export function registerUp(program: Command) {
    const cmd = program
        .command("up")
        .description("Automatically buy nodes until you have the desired quantity")
        .option(
            "-n <quantity>",
            "The number of nodes to purchase continuously",
            "1",
        )
        .option("-t, --type <type>", "Specify the type of node", "h100i");

    cmd.action(async (options) => {
        up(options);
    });
}

async function up(props: {
    n: string;
    type: string;
}) {
    const client = await apiClient();

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
                    quantity: Number.parseInt(props.n),
                },
            });
            return res.data
        }
    }

    const res = await client.POST("/v0/procurements", {
        body: {
            instance_type: props.type,
            quantity: Number.parseInt(props.n),
            max_price_per_node_hour: 0.1,
            block_duration_in_hours: 1,
        },
    });

    if (!res.response.ok) {
        console.error(res.error?.message, res.error?.details);
        throw new Error("Failed to purchase nodes");
    }

    return res.data;
}

