import dayjs from "dayjs";
import { Text } from "ink";
import { useEffect, useState } from "react";

interface Props {
  color?: string;
}

export const NowLive: React.FC<Props> = ({ color = "white" }) => {
  const [currentTime, setCurrentTime] = useState<string>(formatCurrentTime());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(formatCurrentTime());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return <Text color={color}>{currentTime}</Text>;
};

function formatCurrentTime(): string {
  return dayjs().format("ddd MMM DD HH:mm:ss");
}
