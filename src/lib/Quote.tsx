import React from "react";
import { Box, Text } from "ink";
import { Row } from "./Row.tsx";
import { getPricePerGpuHourFromQuote } from "./buy/index.tsx";

export default function QuoteDisplay(props: { quote: Quote }) {
  if (!props.quote) {
    return (
      <Box flexDirection="column" gap={1} paddingBottom={1}>
        <Text>
          No quote available for this configuration. That doesn't mean it's not
          available, but you'll need to give a price you're willing to pay for
          it.
        </Text>
        <Box paddingLeft={4} flexDirection="column">
          <Text dimColor># Place an order with a price</Text>
          <Text>sf buy --price "2.50"</Text>
        </Box>
      </Box>
    );
  }

  const pricePerGpuHourCents = getPricePerGpuHourFromQuote(props.quote);
  const totalPrice = props.quote.price / 100;

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Row
        headWidth={10}
        head="rate"
        value={`~$${(pricePerGpuHourCents / 100).toFixed(2)}/gpu/hr`}
      />
      <Row headWidth={10} head="total" value={`$${totalPrice.toFixed(2)}`} />
    </Box>
  );
}

export type Quote =
  | {
      price: number;
      quantity: number;
      start_at: string;
      end_at: string;
      instance_type: string;
    }
  | {
      price: number;
      quantity: number;
      start_at: string;
      end_at: string;
      contract_id: string;
    }
  | null;
