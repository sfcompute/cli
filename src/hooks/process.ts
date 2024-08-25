import { useCallback } from "react";

export function useExit() {
  const exit = useCallback(() => {
    setTimeout(() => {
      process.exit(0); // allow Ink to update UI before exiting (TODO: find a better way to do this)
    }, 500);
  }, []);

  return exit;
}
