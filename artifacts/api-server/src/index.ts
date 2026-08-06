import app from "./app";
import { logger } from "./lib/logger";
import { registerSubscribers } from "./lib/subscribers";

// AppSail injects the listen port via X_ZOHO_CATALYST_LISTEN_PORT (not
// PORT), and requires the process to bind it within 10 seconds of start —
// checked first so a Catalyst deploy doesn't need PORT set at all. PORT
// remains the fallback and is still required when neither is set, same
// fail-fast contract as before for local dev / non-Catalyst runs.
const rawPort =
  process.env["X_ZOHO_CATALYST_LISTEN_PORT"] ?? process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "Neither X_ZOHO_CATALYST_LISTEN_PORT nor PORT was provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  registerSubscribers();
});
