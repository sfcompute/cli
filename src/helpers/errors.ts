export function logAndQuit(message: string) {
	console.error(message);
	process.exit(1);
}
