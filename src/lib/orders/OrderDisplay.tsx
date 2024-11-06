import { Box, Text } from "ink";
import type { HydratedOrder } from "./types";
import { GPUS_PER_NODE } from "../constants";
import dayjs from "dayjs";
import { formatDuration } from ".";
import { Row } from "../Row";


function Order(props: { order: HydratedOrder }) {
    const duration = dayjs(props.order.end_at).diff(props.order.start_at);
    const durationInHours = duration === 0 ? 1 : duration / 1000 / 60 / 60;
    const pricePerGPUHour = props.order.price * props.order.quantity / GPUS_PER_NODE / durationInHours / 100;
    const durationFormatted = formatDuration(duration);

    return (
        <Box flexDirection="column" marginBottom={1}>
            <Box gap={1}>
                <Text color={props.order.side === "buy" ? "green" : "red"}>{props.order.side === "buy" ? "↑" : "↓"}</Text>
                <Text color={"yellow"}>{props.order.side}</Text>
                <Text color={"yellow"} >{props.order.id}</Text>
                <Text dimColor>({props.order.status})</Text>
            </Box>
            <Row headWidth={7} head="nodes" value={`${props.order.quantity} x ${props.order.instance_type} (${props.order.quantity * GPUS_PER_NODE} gpus)`} />
            <Row headWidth={7} head="price" value={`$${pricePerGPUHour.toFixed(2)}/gpu/hr`} />
            <Row headWidth={7} head="time" value={durationFormatted} />
            <Row headWidth={7} head="total" value={`$${props.order.price / 100}/total`} />
            <Row headWidth={7} head="start" value={dayjs(props.order.start_at).format("MMM D h:mm a").toLowerCase()} />
            <Row headWidth={7} head="end" value={dayjs(props.order.end_at).format("MMM D h:mm a").toLowerCase()} />
        </Box>
    );
}

export function OrderDisplay(props: { orders: HydratedOrder[] }) {
    if (props.orders.length === 0) {
        return <Box flexDirection="column" gap={1} paddingBottom={1}>
            <Text>No orders found.</Text>

            <Box paddingLeft={4} flexDirection="column" >
                <Text dimColor># View all public standing orders</Text>
                <Text color="yellow">sf orders list --public</Text>
            </Box>

            <Box paddingLeft={4} flexDirection="column" >
                <Text dimColor># Place an order to buy compute</Text>
                <Text color="yellow">sf buy</Text>
            </Box>
        </Box>
    }

    return props.orders.map((order) => {
        return <Order order={order} key={order.id} />;
    });
}
