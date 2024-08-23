import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Text } from "ink";
import { useEffect, useState } from "react";

dayjs.extend(utc);

interface Props {
  color?: string;
}

export const UTCLive: React.FC<Props> = ({ color = "white" }) => {
  const [currentTime, setCurrentTime] = useState<string>(
    dayjs().utc().format(),
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(dayjs().utc().format());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return <Text color={color}>{currentTime}</Text>;
};
