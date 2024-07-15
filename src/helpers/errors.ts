export function logAndQuit(message: string) {
	console.error(message);
	process.exit(1);
}

export function logLoginMessageAndQuit() {
	logAndQuit("You need to login first.\n\n\t$ sf login\n");
}
