import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import router from "./routes/index";

const app = express();

// Middleware
app.use(pinoHttp({ logger }));
app.use(cors());
app.use(express.json());

// API Routes
app.use("/api", router);

// Fallback
app.use((_req, res) => {
  res.status(404).json({ error: "API Route Not Found" });
});

export default app;