import path from "node:path";
import dotenv from "dotenv";

interface Environment {
	environment: string;
	isDevelopment: boolean;
	isProduction: boolean;

	webapp: {
		host: string;
		port: number;
	};
	api: {
		host: string;
		port: number;
	};
}

const isDevelopment =
	!process.env.ENV ||
	process.env.ENV === "development" ||
	process.env.ENV === "dev";
const isProduction =
	process.env.ENV === "production" || process.env.ENV === "prod";

const env: Environment = {
	environment: process.env.ENV ?? "development",
	isDevelopment,
	isProduction,

	webapp: {
		host: process.env.WEBAPP_HOST ?? "localhost",
		port: Number.parseInt(process.env.WEBAPP_PORT ?? "3000", 10),
	},
	api: {
		host: process.env.API_HOST ?? "localhost",
		port: Number.parseInt(process.env.API_PORT ?? "8080", 10),
	},
};

// loads data from .env → process.env
// (call as early as possible in application lifecycle)
export const loadEnvironment = (): boolean => {
	const envPath =
		!process.env.ENV || process.env.ENV === "development"
			? path.join(__dirname, "..", ".env.development")
			: path.join(__dirname, "..", ".env.production");

	const { error } = dotenv.config({ path: envPath });
	if (error) {
		return false;
	}

	return true;
};

export default env;
