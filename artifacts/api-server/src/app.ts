import express, { type Express, type RequestHandler } from "express";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./routes/auth";

export function createApp(
  options: {
    sessionHandler?: RequestHandler;
    beforeApi?: (app: Express) => void;
  } = {},
): Express {
  const app: Express = express();

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  app.set("trust proxy", 1);
  app.use(options.sessionHandler ?? sessionMiddleware);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  options.beforeApi?.(app);
  app.use("/api", router);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found." });
  });

  if (process.env.NODE_ENV === "production") {
    const frontendDist = fileURLToPath(
      new URL("../../cultural-collision-atlas/dist/public", import.meta.url),
    );
    const frontendIndex = fileURLToPath(
      new URL(
        "../../cultural-collision-atlas/dist/public/index.html",
        import.meta.url,
      ),
    );

    app.use(express.static(frontendDist, { index: false }));
    app.use((req, res, next) => {
      const acceptHeader = req.get("accept") ?? "";
      if (
        !["GET", "HEAD"].includes(req.method) ||
        !acceptHeader.includes("text/html")
      ) {
        next();
        return;
      }
      res.sendFile(frontendIndex, (error) => {
        if (error) next(error);
      });
    });
  }

  return app;
}

const app = createApp();

export default app;
