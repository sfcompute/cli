export function clearScreen() {
  process.stdout.write("\x1Bc");
}
