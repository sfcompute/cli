import { Box, Text } from "ink";
import { useOrder } from "../../api/hooks/useOrder";
import { OrderStatus, type HydratedOrder } from "../../api/orders";
import type { Nullable } from "../../helpers/empty";
import Spinner from "ink-spinner";
import type { ApiError } from "../../api";
import dayjs from "dayjs";
import { centicentsToDollarsFormatted } from "../../helpers/units";

interface SFBuyProps {
  orderId: string;
}

const SFOrdersStatus: React.FC<SFBuyProps> = ({ orderId }) => {
  const { order, loadingOrder, orderNotFound, orderFetchError } =
    useOrder(orderId);

  const primaryColor = usePrimaryColor(
    order,
    orderNotFound,
    loadingOrder,
    orderFetchError,
  );

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
        <>
          <InfoBlrub
            order={order}
            orderNotFound={orderNotFound}
            orderFetchError={orderFetchError}
            orderId={orderId}
          />
          <OrderBreakdown order={order} />
        </>
      )}
    </Box>
  );
};

const OrderBreakdown = ({ order }: { order: Nullable<HydratedOrder> }) => {
  if (!order) {
    return null;
  }

  return (
    <Box marginTop={1}>
      <Text>Order breakdown</Text>
    </Box>
  );
};

const InfoBlrub = ({
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
  const InfoBlurb = () => {
    // error states
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
    if (orderFetchError) {
      return <Text color="red">{orderFetchError.message}</Text>;
    }

    // check order status
    if (order) {
      const endsAtIso = dayjs(order.start_at)
        .add(order.duration, "seconds")
        .toISOString();
      const endAtLabelFormatted = dayjs(endsAtIso).format(
        "ddd MMM D [at] h:mma",
      );

      switch (order.status) {
        case OrderStatus.Pending:
          return (
            <Text>
              This order is in a <Text color="blue">pending</Text> state. You
              may have just submitted it, it will soon be on the market.
            </Text>
          );
        case OrderStatus.Rejected:
          return (
            <Text>This order was rejected for some validation reason.</Text>
          );
        case OrderStatus.Open:
          return (
            <Text>
              This order is <Text color="green">open</Text> and on the market.
              It can be filled at any moment. It will expire on{" "}
              <Text color="yellow">{endAtLabelFormatted}</Text>.
            </Text>
          );
        case OrderStatus.Cancelled: {
          return (
            <Text>
              This order was cancelled. It is no longer on the market.
            </Text>
          );
        }
        case OrderStatus.Filled:
          // TODO: if a buy order, show the contract id the user now owns
          return (
            <Box flexDirection="column">
              <Text>
                This order was successfully filled for a price of{" "}
                {centicentsToDollarsFormatted(order.execution_price!)} 🎉
              </Text>
            </Box>
          );
        case OrderStatus.Expired:
          return <Text>This order has expired.</Text>;
      }
    }

    return null;
  };

  return (
    <Box marginTop={1}>
      <InfoBlurb />
    </Box>
  );
};

const usePrimaryColor = (
  order: Nullable<HydratedOrder>,
  notFound: Nullable<boolean>,
  loadingOrder: boolean,
  orderFetchError: Nullable<ApiError>,
) => {
  if (loadingOrder) {
    return "white";
  }

  // error states
  if (notFound) {
    return "yellow";
  }
  if (orderFetchError) {
    return "red";
  }

  // should never happen (order found but not resolved)
  if (!order) {
    return "gray";
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
