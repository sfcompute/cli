import { useCallback, useEffect } from "react";

export function useExit() {
  const exit = useCallback(() => {
    setTimeout(() => {
      process.exit(0); // allow Ink to update UI before exiting (TODO: find a better way to do this)
    }, 500);
  }, []);

  return exit;
}

export function useExitAfterCondition(condition: boolean) {
  const exit = useExit();

  useEffect(() => {
    if (condition) {
      exit();
    }
  }, [condition, exit]);
}
