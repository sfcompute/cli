import { useEffect, useState } from "react";
import { centicentsToWhole, type Centicents } from "../../helpers/units";
import { getBalance } from "../balance";
import type { Nullable } from "../../types/empty";

export function useBalance() {
  const [balance, setBalance] = useState<Nullable<Centicents>>(null);
  const [fetching, setFetching] = useState<boolean>(false);
  useEffect(() => {
    setFetching(true);

    getBalance().then(({ data }) => {
      if (data) {
        setBalance(centicentsToWhole(data.available.amount));
      }

      setFetching(false);
    });
  }, []);

  return { balance, loadingBalance: fetching };
}
