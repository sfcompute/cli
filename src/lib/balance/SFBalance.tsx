import { Box, Text } from "ink";
import { COMMAND_CONTAINER_MAX_WIDTH } from "../../ui/dimensions";
import { useApi } from "../../api/useApi";
import { useEffect, useState } from "react";
import { FetchStatus } from "../../api/fetchStatus";
import Spinner from "ink-spinner";
import {
  logAndQuit,
  logSessionTokenExpiredAndQuit,
} from "../../helpers/errors";
import type { Nullable } from "../../helpers/empty";
import type { Cents } from "../../helpers/units";

interface SFBalanceProps {
  json?: boolean;
}

export default function SFBalance({ json }: SFBalanceProps) {
  const {
    fetchStatus: balanceFetchStatus,
    availableBalance,
    reservedBalance,
  } = useBalance();
  const balanceLoading =
    balanceFetchStatus === FetchStatus.Idle ||
    balanceFetchStatus === FetchStatus.Loading;

  if (balanceLoading) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" />
        </Text>
        <Box marginLeft={1}>
          <Text>Fetching balance...</Text>
        </Box>
      </Box>
    );
  }
  console.log(availableBalance);
  console.log(reservedBalance);

  return (
    <Box width={COMMAND_CONTAINER_MAX_WIDTH} flexDirection="column">
      <Text>SFBalance</Text>
    </Box>
  );
}

function useBalance() {
  const [availableBalance, setAvailableBalance] =
    useState<Nullable<Cents>>(null);
  const [reservedBalance, setReservedBalance] = useState<Nullable<Cents>>(null);

  const { api, apiClientReady } = useApi();
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>(FetchStatus.Idle);
  useEffect(() => {
    if (!apiClientReady || !api) return;

    setFetchStatus(FetchStatus.Loading);
    api
      .GET("/v0/balance")
      .then(({ data, error, response }) => {
        // handle errors
        if (!response.ok) {
          switch (response.status) {
            case 401:
              logSessionTokenExpiredAndQuit();
              break;
            case 500:
              return logAndQuit(`Failed to get balance: ${error?.message}`);
          }
        }

        // parse data
        if (data) {
          setAvailableBalance(data.available.amount);
          setReservedBalance(data.reserved.amount);
        }

        setFetchStatus(FetchStatus.Success);
      })
      .catch((e) => {
        console.error(e.message);
        process.exit(1);
      });
  }, [api, apiClientReady]);

  return {
    fetchStatus,
    availableBalance,
    reservedBalance,
  };
}
