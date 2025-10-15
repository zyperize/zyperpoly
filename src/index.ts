import { runTracker } from "./trackerService";

const main = async (): Promise<void> => {
  const result = await runTracker();

  console.log(result.message);
  if (result.alerts.length) {
    console.log(
      `\n[ALERT] Detected ${result.alerts.length} high-value trades from newly created wallets:\n`,
    );
    for (const alert of result.alerts) {
      console.log(
        [
          alert.summary,
          `Transaction: ${alert.txHash}`,
          `Direction: ${alert.directionText}`,
          `Implied Position: ${alert.impliedPosition}`,
          `Wallet First Seen: ${alert.walletFirstSeen} (${alert.walletAgeHours.toFixed(1)} hours old)`,
          `Stake: ${alert.stake} ${alert.currency}`,
          `Market: ${alert.market.question} -> ${alert.market.outcome}`,
          `Block: ${alert.blockNumber} @ ${alert.blockLocal}`,
          `Slug: ${alert.market.slug}`,
          `Link: ${alert.marketUrl}`,
        ].join("\n"),
      );
      console.log("-".repeat(80));
    }
  }

  if (result.logPath) {
    console.log(`\nRun archived at: ${result.logPath}`);
  }
};

main().catch((error) => {
  console.error("Tracker execution failed:", error);
  process.exitCode = 1;
});
