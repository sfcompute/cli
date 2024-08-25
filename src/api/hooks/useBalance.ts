import { useEffect, useState } from "react";
import { getBalance } from "../balance";
import type { Nullable } from "../../helpers/empty";
import type { Centicents } from "../../helpers/units";

interface UseBalanceReturn {
  balance: Nullable<Centicents>;
  loadingBalance: boolean;
}
export function useBalance(): UseBalanceReturn {
  const [balance, setBalance] = useState<Nullable<Centicents>>(null);
  const [fetching, setFetching] = useState<boolean>(false);
  useEffect(() => {
    setFetching(true);

    getBalance().then(({ data }) => {
      if (data) {
        setBalance(data.available.amount);
      }

      setFetching(false);
    });
  }, []);

  return { balance, loadingBalance: fetching };
}
