import { createServer } from "node:http";
import { createApplication } from "./app/app";

async function main() {
  try {
    const server = createServer(createApplication());

    const PORT: number = Number(process.env.PORT) ?? 8000;

    server.listen(PORT, () => {
      console.log(`HTTP server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error(`Error starting HTTP server ${error}`);
    process.exit(1);
  }
}

main();
