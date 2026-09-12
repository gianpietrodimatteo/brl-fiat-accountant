import { createServer } from "node:http";
import { activeExchangeMode } from "./exchanges/exchangeClients";

const port = Number(process.env.PORT) || 3001;

function main(): void {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("backend placeholder: scaffolding OK");
  });

  server.listen(port, () => {
    console.log(
      `backend placeholder listening on port ${port} (exchange mode: ${activeExchangeMode})`,
    );
  });
}

main();
