import { useEffect, useState } from "react";
import type { Nullable } from "../../helpers/empty";
import { ApiErrorCode, type ApiError } from "..";
import { getOrderById, type HydratedOrder } from "../orders";

interface UseOrderReturn {
  order: Nullable<HydratedOrder>;
  err: Nullable<ApiError>;
  orderNotFound?: boolean;
  loadingOrder: boolean;
}
export function useOrder(orderId: string): UseOrderReturn {
  const [order, setOrder] = useState<Nullable<HydratedOrder>>(null);
  const [fetching, setFetching] = useState<boolean>(false);
  const [err, setErr] = useState<Nullable<ApiError>>(null);
  const [orderNotFound, setOrderNotFound] = useState<boolean>(false);

  useEffect(() => {
    if (orderId) {
      setFetching(true);
      setOrderNotFound(false);
      setErr(null);

      getOrderById(orderId).then(({ data, err }) => {
        if (data) {
          setOrder(data);
        } else if (err) {
          setErr(err);

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
    err,
    orderNotFound,
    loadingOrder: fetching,
  };
}
