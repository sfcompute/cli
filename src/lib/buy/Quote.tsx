import { Box, Text } from "ink";
import { Row } from "../Row";
import dayjs from "dayjs";
import { GPUS_PER_NODE } from "../constants";
import type { Quote } from "./types";


export default function QuoteDisplay(props: { quote: Quote }) {
    if (!props.quote) {
        return <Box flexDirection="column" gap={1} paddingBottom={1}>
            <Text>No quote available for this configuration. That doesn't mean it's not available, but you'll need to give a price you're willing to pay for it.</Text>
            <Box paddingLeft={4} flexDirection="column" >
                <Text dimColor># Place an order with a price</Text>
                <Text>sf buy --price "2.50"</Text>
            </Box>
        </Box>
    }

    const durationSeconds = dayjs(props.quote.end_at).diff(dayjs(props.quote.start_at), 'seconds');
    const durationHours = durationSeconds / 3600;
    const pricePerHour = props.quote.price / durationHours / GPUS_PER_NODE / props.quote.quantity / 100;
    const priceTotal = props.quote.price / 100;


    return <Box flexDirection="column" paddingBottom={1}>
        <Row headWidth={10} head="Per Hour" value={`$${pricePerHour.toFixed(2)}/gpu/hr`} />
        <Row headWidth={10} head="Total" value={`$${priceTotal.toFixed(2)}`} />
    </Box>
}
