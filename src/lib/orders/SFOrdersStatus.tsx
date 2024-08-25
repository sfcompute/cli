import { Box, Text } from "ink";
import { useOrder } from "../../api/hooks/useOrder";

interface SFBuyProps {
  orderId: string;
}

const SFOrdersStatus: React.FC<SFBuyProps> = ({ orderId }) => {
  console.log(orderId);
  const { order, orderNotFound, err } = useOrder(orderId);
  console.log(order);

  return (
    <Box>
      <Text>SF Orders Status</Text>
    </Box>
  );
};

export default SFOrdersStatus;
