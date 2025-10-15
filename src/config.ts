import path from "path";
import dotenv from "dotenv";
import { ensureDirectory } from "./utils";

dotenv.config();

export interface TrackerConfig {
  polygonRpcUrl: string;
  polymarketHost: string;
  chainId: number;
  tradeThresholdUsd: number;
  newWalletWindowHours: number;
  stateFile: string;
  marketsCacheFile: string;
  marketsCacheTtlHours: number;
  blockBatchSize: number;
  initialLookbackBlocks: number;
  maxAlertHistory: number;
  etherscanApiKey?: string;
  etherscanRateLimitMs: number;
  scanLogDir: string;
  walletMaxAgeHours: number;
}

const parseNumber = (
  value: string | undefined,
  fallback: number,
): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const loadConfig = async (): Promise<TrackerConfig> => {
  const dataDir =
    process.env.TRACKER_DATA_DIR ?? path.join(process.cwd(), "data");
  await ensureDirectory(dataDir);

  const scanLogDir =
    process.env.SCAN_LOG_DIR ?? path.join(process.cwd(), "runs");
  await ensureDirectory(scanLogDir);

  const stateFile =
    process.env.STATE_FILE ?? path.join(dataDir, "state.json");
  const marketsCacheFile =
    process.env.MARKETS_CACHE_FILE ?? path.join(dataDir, "markets.json");

  const etherscanApiKey = process.env.ETHERSCAN_API_KEY?.trim();

  const baseConfig: TrackerConfig = {
    polygonRpcUrl:
      process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",
    polymarketHost:
      process.env.POLYMARKET_HOST ?? "https://clob.polymarket.com",
    chainId: parseNumber(process.env.POLYMARKET_CHAIN_ID, 137),
    tradeThresholdUsd: parseNumber(process.env.TRADE_THRESHOLD_USD, 10000),
    newWalletWindowHours: parseNumber(
      process.env.NEW_WALLET_WINDOW_HOURS,
      72,
    ),
    stateFile,
    marketsCacheFile,
    marketsCacheTtlHours: parseNumber(
      process.env.MARKETS_CACHE_TTL_HOURS,
      6,
    ),
    blockBatchSize: parseNumber(process.env.BLOCK_BATCH_SIZE, 30),
    initialLookbackBlocks: parseNumber(
      process.env.INITIAL_LOOKBACK_BLOCKS,
      90000,
    ),
    maxAlertHistory: parseNumber(process.env.MAX_ALERT_HISTORY, 500),
    etherscanRateLimitMs: parseNumber(
      process.env.ETHERSCAN_RATE_LIMIT_MS,
      300,
    ),
    walletMaxAgeHours: parseNumber(
      process.env.WALLET_MAX_AGE_HOURS,
      48,
    ),
    scanLogDir,
  };

  if (
    etherscanApiKey &&
    etherscanApiKey !== "YourApiKeyToken"
  ) {
    return { ...baseConfig, etherscanApiKey };
  }

  return baseConfig;
};
