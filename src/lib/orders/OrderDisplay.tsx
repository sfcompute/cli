import { Box, Text } from "ink";
import type { HydratedOrder } from "./types";
import { GPUS_PER_NODE } from "../constants";
import dayjs from "dayjs";
import { formatDuration } from ".";

function Order(props: { order: HydratedOrder }) {

    const duration = dayjs(props.order.end_at).diff(props.order.start_at);
    const durationInHours = duration === 0 ? 1 : duration / 1000 / 60 / 60;
    const pricePerGPUHour = props.order.price * props.order.quantity * GPUS_PER_NODE / durationInHours / 100;

    const durationFormatted = formatDuration(duration);

    return (
        <Box flexDirection="column" marginBottom={1}>
            <Box gap={1}>
                <Text color={props.order.side === "buy" ? "green" : "red"}>{props.order.side === "buy" ? "↑" : "↓"}</Text>
                <Text color={"yellow"}>{props.order.side}</Text>
                <Text color={"yellow"} >{props.order.id}</Text>
                <Text dimColor>({props.order.status})</Text>
            </Box>
            <Box gap={1}>
                <Text>{props.order.quantity * GPUS_PER_NODE}</Text>
                <Text>{props.order.instance_type}</Text>
                <Text>${pricePerGPUHour.toFixed(2)}/gpu/hr</Text>
                <Text>{durationFormatted}</Text>
            </Box>
            <Box gap={1}>
                <Text>{dayjs(props.order.start_at).format("MMM D h:mm a").toLowerCase()}</Text>
                <Text>{"→"}</Text>
                <Text>{dayjs(props.order.end_at).format("MMM D h:mm a").toLowerCase()}</Text>
            </Box>
        </Box>
    );
}

export function OrderDisplay(props: { orders: HydratedOrder[] }) {

    if (props.orders.length === 0) {
        return <Text>No orders found</Text>;
    }

    return props.orders.map((order) => {
        return <Order order={order} key={order.id} />;
    });
}
