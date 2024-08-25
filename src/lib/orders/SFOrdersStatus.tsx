import { Box, Text } from "ink";
import { useOrder } from "../../api/hooks/useOrder";
import type { HydratedOrder } from "../../api/orders";
import type { Nullable } from "../../helpers/empty";
import Spinner from "ink-spinner";

interface SFBuyProps {
  orderId: string;
}

const SFOrdersStatus: React.FC<SFBuyProps> = ({ orderId }) => {
  const { order, loadingOrder, orderNotFound, err } = useOrder(orderId);

  const primaryColor = useBorderColor(order);

  return (
    <Box
      flexDirection="column"
      marginY={1}
      paddingX={2}
      paddingY={1}
      borderColor={primaryColor}
      borderStyle="single"
      borderDimColor={loadingOrder}
    >
      <Box flexDirection="row" width="100%" justifyContent="space-between">
        <Text color="gray">order status</Text>
        <Box>
          <Text color={primaryColor}>{orderId}</Text>
        </Box>
      </Box>
      {loadingOrder && (
        <Box marginTop={1}>
          <Box marginRight={2}>
            <Text color="gray">Checking order status.</Text>
          </Box>
          <Spinner type="dots" />
        </Box>
      )}
    </Box>
  );
};

const useBorderColor = (order: Nullable<HydratedOrder>) => {
  if (!order) {
    return "gray";
  }

  if (order) {
  }
};

export default SFOrdersStatus;
