import { useEffect, useState } from "react";
import type { Nullable } from "../types/empty";
import { getWebAppUrl, type webPaths } from "../helpers/urls";

export const useWebUrl = (key: keyof typeof webPaths, params?: any) => {
  const [url, setUrl] = useState<Nullable<string>>(null);

  useEffect(() => {
    const fetchUrl = async () => {
      const url = await getWebAppUrl(key, params);
      setUrl(url);
    };

    fetchUrl();
  }, [key, params]);

  return url;
};
