import { failedToConnect } from "./errors";

export const fetchAndHandleErrors: typeof fetch = async (url, init) => {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes("Unable to connect")) {
        failedToConnect();
      }
    }

    throw e;
  }
};
