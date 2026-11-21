import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { env } from "./config/env.js";
import { corsOptions } from "./config/cors.js";
import requestId from "./middleware/requestId.js";
import originGuard from "./middleware/originGuard.js";
import sanitize from "./middleware/sanitize.js";
import { globalLimiter } from "./middleware/rateLimiters.js";
import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";
import routes from "./routes/index.js";

const app = express();

app.disable("x-powered-by");
if (env.isProd) app.set("trust proxy", 1); // correct client IPs behind a proxy, needed for rate limiting

app.use(requestId);
if (!env.isTest) app.use(morgan(env.isProd ? "combined" : "dev"));
app.use(helmet());
app.use(cors(corsOptions));
app.use(originGuard);
app.use(globalLimiter);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
app.use(sanitize);

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
