import process from "node:process";

export function clearScreen() {
  process.stdout.write("\x1Bc");
}
