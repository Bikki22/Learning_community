import { createServer } from "node:http";
import { createApplication } from "./app/app";
import logger from "./app/lib/logger";

async function main() {
  try {
    const server = createServer(createApplication());

    const PORT: number = Number(process.env.PORT) ?? 8000;

    server.listen(PORT, () => {
      logger.info(`HTTP server is running on port ${PORT}`);
    });

    server.on("error", (error) => {
      logger.error(`HTTP server error: ${error.message}`);
      process.exit(1);
    });
  } catch (error) {
    logger.error(`Error starting HTTP server: ${error}`);
    process.exit(1);
  }
}

main();