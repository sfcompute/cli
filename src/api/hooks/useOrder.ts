import { useEffect, useState } from "react";
import type { Nullable } from "../../helpers/empty";
import { ApiErrorCode, type ApiError } from "..";
import { getOrderById, type HydratedOrder } from "../orders";

interface UseOrderReturn {
  order: Nullable<HydratedOrder>;
  orderFetchError: Nullable<ApiError>;
  orderNotFound: Nullable<boolean>;
  loadingOrder: boolean;
}
export function useOrder(orderId: string): UseOrderReturn {
  const [order, setOrder] = useState<Nullable<HydratedOrder>>(null);
  const [fetching, setFetching] = useState<boolean>(false);
  const [orderFetchError, setOrderFetchError] =
    useState<Nullable<ApiError>>(null);
  const [orderNotFound, setOrderNotFound] = useState<boolean>(false);

  useEffect(() => {
    if (orderId) {
      setFetching(true);
      setOrderNotFound(false);
      setOrderFetchError(null);

      getOrderById(orderId).then(({ data, err }) => {
        if (data) {
          setOrder(data);
        } else if (err) {
          setOrderFetchError(err);

          if (err.code === ApiErrorCode.Orders.NotFound) {
            setOrderNotFound(true);
          }
        }

        setFetching(false);
      });
    }
  }, []);

  return {
    order,
    orderFetchError,
    orderNotFound,
    loadingOrder: fetching,
  };
}
