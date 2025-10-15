import path from "path";
import { promises as fs } from "fs";
import { DateTime } from "luxon";
import { ClobClient } from "@polymarket/clob-client";
import { loadConfig, TrackerConfig } from "./config";
import { MarketCache } from "./markets";
import { EtherscanClient } from "./etherscan";
import { StateManager } from "./state";
import { Tracker } from "./tracker";
import { AlertRecord } from "./types";
import { ensureDirectory, formatEasternTime, formatUsd } from "./utils";

export interface EnrichedAlert extends AlertRecord {
  summary: string;
  marketUrl: string;
  directionText: string;
  stake: string;
  blockLocal: string;
  impliedPosition: string;
  currency: string;
}

export interface TrackerRunResult {
  timestamp: string;
  message: string;
  alerts: EnrichedAlert[];
  logLines: string[];
  logPath?: string;
}

export interface RunOptions {
  saveLog?: boolean;
  scanMode?: "calendar-day" | "custom-range" | "recent";
  calendarDay?: string;
  recentMinutes?: number;
  from?: string;
  to?: string;
  walletAgeHours?: number;
}

type ScanRangeParams = {
  calendarDay?: string;
  recentMinutes?: number;
  from?: string;
  to?: string;
};

export const runTracker = async (
  options: RunOptions = {},
): Promise<TrackerRunResult> => {
  const {
    saveLog = true,
    scanMode = "recent",
    calendarDay,
    recentMinutes,
    from,
    to,
    walletAgeHours,
  } = options;
  const config = await loadConfig();
  const {
    polymarketHost,
    chainId,
    marketsCacheFile,
    marketsCacheTtlHours,
    stateFile,
    maxAlertHistory,
    etherscanApiKey,
    etherscanRateLimitMs,
    scanLogDir,
  } = config;

  const clobClient = new ClobClient(polymarketHost, chainId);
  const marketCache = new MarketCache(
    clobClient,
    marketsCacheFile,
    marketsCacheTtlHours,
  );
  const stateManager = new StateManager(stateFile, maxAlertHistory);
  const etherscan = etherscanApiKey
    ? new EtherscanClient(etherscanApiKey, etherscanRateLimitMs, "polygon")
    : undefined;

  const tracker = new Tracker(
    config,
    stateManager,
    marketCache,
    etherscan,
  );
  const rangeParams: ScanRangeParams = {};
  if (calendarDay) {
    rangeParams.calendarDay = calendarDay;
  }
  if (typeof recentMinutes === "number") {
    rangeParams.recentMinutes = recentMinutes;
  }
  if (from) {
    rangeParams.from = from;
  }
  if (to) {
    rangeParams.to = to;
  }

  const range = normalizeRange(scanMode, rangeParams);
  const walletAgeCutoff = walletAgeHours ?? config.walletMaxAgeHours;
  const alerts = range
    ? await tracker.run({
        startTime: range.from,
        endTime: range.to,
        walletAgeHours: walletAgeCutoff,
      })
    : await tracker.run({
        walletAgeHours: walletAgeCutoff,
      });
  const timestamp = new Date().toISOString();

  const enrichedAlerts = alerts.map((alert) =>
    enrichAlert(alert, config),
  );

  const baseMessage = alerts.length
    ? `[ALERT] Detected ${alerts.length} high-value trades from newly created wallets.`
    : "No newly created wallets exceeded the configured trade threshold.";
  const windowMessage = range
    ? `${baseMessage} (window: ${range.from} to ${range.to})`
    : baseMessage;

  const logLines = [timestamp, windowMessage];
  if (range) {
    logLines.push(`Requested window: ${range.from} to ${range.to}`);
  }
  logLines.push(`Wallet age cutoff: ${walletAgeCutoff} hours`);
  for (const alert of enrichedAlerts) {
    logLines.push(
      [
        alert.summary,
        `Transaction: ${alert.txHash}`,
        `Direction: ${alert.directionText}`,
        `Implied Position: ${alert.impliedPosition}`,
        `Wallet First Seen: ${alert.walletFirstSeen} (${alert.walletAgeHours.toFixed(1)} hours old)`,
        `Market: ${alert.market.question} -> ${alert.market.outcome}`,
        `Stake: ${alert.stake} ${alert.currency}`,
        `Block: ${alert.blockNumber} @ ${alert.blockLocal}`,
        `Slug: ${alert.market.slug}`,
        `Link: ${alert.marketUrl}`,
      ].join("\n"),
    );
    logLines.push("-".repeat(80));
  }

  let logPath: string | undefined;
  if (saveLog) {
    logPath = await writeRunLog(scanLogDir, timestamp, logLines);
  }

  return {
    timestamp,
    message: windowMessage,
    alerts: enrichedAlerts,
    logLines,
    ...(logPath ? { logPath } : {}),
  };
};

const enrichAlert = (
  alert: AlertRecord,
  config: TrackerConfig,
): EnrichedAlert => {
  const stake = formatUsd(alert.usdValue);
  const willHappen = alert.direction === "BUY";
  const blockLocal = formatEasternTime(alert.blockTimestamp);
  const allOutcomes = alert.market.allOutcomes ?? [];
  let alternatives = allOutcomes.filter(
    (name) => name !== alert.market.outcome,
  );
  if (!alternatives.length) {
    alternatives = inferAlternatives(
      alert.market.question,
      alert.market.outcome,
    );
  }

  const altLabel = alternatives.length
    ? alternatives
        .map((o) => `"${o}"`)
        .join(alternatives.length > 2 ? ", " : " and ")
    : `alternative outcome(s)`;

  const impliedPosition = willHappen
    ? `Backing "${alert.market.outcome}"`
    : `Backing ${altLabel}`;

  const summary = willHappen
    ? `Wallet ${alert.address} bet ${stake} USDC that "${alert.market.outcome}" will happen in "${alert.market.question}".`
    : `Wallet ${alert.address} bet ${stake} USDC that "${alert.market.outcome}" will NOT happen in "${alert.market.question}".`;

  return {
    ...alert,
    summary,
    stake,
    directionText: willHappen
      ? `FOR ${alert.market.outcome}`
      : `AGAINST ${alert.market.outcome}`,
    blockLocal,
    impliedPosition,
    currency: "USDC",
    marketUrl: `https://polymarket.com/market/${alert.market.slug}`,
  };
};

const inferAlternatives = (question: string, outcome: string): string[] => {
  const normalizedOutcome = outcome.trim().toLowerCase();
  if (normalizedOutcome === "yes") {
    return ["No"];
  }
  if (normalizedOutcome === "no") {
    return ["Yes"];
  }

  const vsMatch = question.split(/\s+vs\.?\s+/i);
  if (vsMatch.length === 2) {
    const teamA = vsMatch[0]?.trim();
    const teamB = vsMatch[1]?.trim();
    if (teamA && teamA.toLowerCase() === normalizedOutcome && teamB) {
      return [teamB];
    }
    if (teamB && teamB.toLowerCase() === normalizedOutcome && teamA) {
      return [teamA];
    }
  }

  return [];
};

const writeRunLog = async (
  directory: string,
  timestampIso: string,
  segments: string[],
): Promise<string> => {
  await ensureDirectory(directory);
  const safeTimestamp = timestampIso.replace(/[:.]/g, "-");
  const filePath = path.join(directory, `scan-${safeTimestamp}.txt`);
  const body = segments.join("\n") + "\n";
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, body, "utf8");
  return filePath;
};

const MAX_RANGE_MS = 24 * 60 * 60 * 1000;

const normalizeRange = (
  mode: RunOptions["scanMode"],
  params: ScanRangeParams,
): { from: string; to: string } | undefined => {
  switch (mode) {
    case "calendar-day": {
      if (!params.calendarDay) {
        throw new Error("Select a calendar day to scan.");
      }
      const day = DateTime.fromISO(params.calendarDay, {
        zone: "America/New_York",
      });
      if (!day.isValid) {
        throw new Error("Invalid calendar day provided.");
      }
      const start = day.startOf("day").toUTC();
      const end = day.endOf("day").toUTC();
      return { from: start.toISO(), to: end.toISO() };
    }
    case "custom-range": {
      if (!params.from || !params.to) {
        throw new Error(
          "Provide both start and end times (maximum window: 24 hours).",
        );
      }
      const fromDate = DateTime.fromISO(params.from, { zone: "utc" });
      const toDate = DateTime.fromISO(params.to, { zone: "utc" });
      if (!fromDate.isValid || !toDate.isValid) {
        throw new Error("Invalid date/time provided.");
      }
      const diff = toDate.diff(fromDate).as("milliseconds");
      if (diff < 0) {
        throw new Error("The end time must be after the start time.");
      }
      if (diff > MAX_RANGE_MS) {
        throw new Error("Scan window cannot exceed 24 hours.");
      }
      return { from: fromDate.toISO(), to: toDate.toISO() };
    }
    case "recent": {
      const minutes = params.recentMinutes ?? 60;
      const now = DateTime.utc();
      const from = now.minus({ minutes });
      if (now.diff(from).as("milliseconds") > MAX_RANGE_MS) {
        throw new Error("Recent scan cannot exceed 24 hours.");
      }
      return { from: from.toISO(), to: now.toISO() };
    }
    default:
      throw new Error(`Unsupported scan mode: ${mode ?? "unspecified"}.`);
  }
};



