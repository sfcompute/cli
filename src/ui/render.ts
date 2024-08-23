import { render } from "ink";
import type React from "react";

export const renderCommand = (component: React.ReactNode) => {
  /*
    we have to explicitly call this to receive user input & prevent
    the process from exiting after component render (Bun does not)

    see: https://github.com/oven-sh/bun/issues/6862#issuecomment-2146872355
  */
  process.stdin.resume();

  return render(component);
};
