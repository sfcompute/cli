import { Box, Text } from "ink";
import { useOrder } from "../../api/hooks/useOrder";
import { OrderStatus, type HydratedOrder } from "../../api/orders";
import type { Nullable } from "../../helpers/empty";
import Spinner from "ink-spinner";
import type { ApiError } from "../../api";

interface SFBuyProps {
  orderId: string;
}

const SFOrdersStatus: React.FC<SFBuyProps> = ({ orderId }) => {
  const { order, loadingOrder, orderNotFound, orderFetchError } =
    useOrder(orderId);

  const primaryColor = usePrimaryColor(order, orderNotFound, loadingOrder);

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
        <Text color={primaryColor}>order status</Text>
        <Box>
          <Text color={primaryColor}>{orderId}</Text>
        </Box>
      </Box>
      {loadingOrder ? (
        <Box marginTop={1}>
          <Box marginRight={2}>
            <Text color="gray">Checking order status.</Text>
          </Box>
          <Spinner type="dots" />
        </Box>
      ) : (
        <OrderStatusInfo
          order={order}
          orderNotFound={orderNotFound}
          orderFetchError={orderFetchError}
          orderId={orderId}
        />
      )}
    </Box>
  );
};

const OrderStatusInfo = ({
  order,
  orderNotFound,
  orderFetchError,
  orderId,
}: {
  order: Nullable<HydratedOrder>;
  orderNotFound: Nullable<boolean>;
  orderFetchError: Nullable<ApiError>;
  orderId: string;
}) => {
  const Content = () => {
    if (orderNotFound) {
      return (
        <Box flexDirection="column">
          <Text color="white">
            <Text bold>Order not found.</Text> If this is a mistake,
            double-check that you entered your order id correctly.
          </Text>
          <Box marginTop={1}>
            <Text>
              Here is the id you entered: <Text bold>{` ${orderId}`}</Text>
            </Text>
          </Box>
        </Box>
      );
    }

    return null;
  };

  return (
    <Box marginTop={1}>
      <Content />
    </Box>
  );
};

const usePrimaryColor = (
  order: Nullable<HydratedOrder>,
  notFound: Nullable<boolean>,
  loadingOrder: boolean,
) => {
  if (loadingOrder) {
    return "white";
  }

  if (notFound) {
    return "yellow";
  }
  if (!order) {
    return "gray"; // should never happen (order found but not resolved)
  }

  // check order status
  switch (order.status) {
    case OrderStatus.Pending:
      return "blue";
    case OrderStatus.Rejected:
      return "red";
    case OrderStatus.Open:
      return "green";
    case OrderStatus.Cancelled:
      return "red";
    case OrderStatus.Filled:
      return "green";
    case OrderStatus.Expired:
      return "yellow";
    default:
      return "gray";
  }
};

export default SFOrdersStatus;
