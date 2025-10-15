import { BigNumber, utils } from "ethers";
import { promises as fs } from "fs";
import path from "path";
import { DateTime } from "luxon";

export const COLLATERAL_DECIMALS = 6;

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const bigNumberToNumber = (
  value: BigNumber,
  decimals: number = COLLATERAL_DECIMALS,
): number => Number(utils.formatUnits(value, decimals));

export const formatUsd = (value: number): string =>
  `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: value >= 1000 ? 2 : 4,
  })}`;

export const nowIso = (): string => new Date().toISOString();

export const unixToIso = (seconds: number): string =>
  new Date(seconds * 1000).toISOString();

export const hoursToMs = (hours: number): number => hours * 60 * 60 * 1000;

export const msSince = (iso: string): number =>
  Date.now() - new Date(iso).getTime();

export const ensureDirectory = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const readJsonFile = async <T>(
  filePath: string,
): Promise<T | undefined> => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

export const writeJsonFile = async <T>(
  filePath: string,
  data: T,
): Promise<void> => {
  await ensureDirectory(path.dirname(filePath));
  const serialized = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, `${serialized}\n`, "utf8");
};

export const toLowerAddress = (address: string): string => address.toLowerCase();

export const formatEasternTime = (seconds: number): string => {
  const dt = DateTime.fromSeconds(seconds, { zone: "utc" }).setZone(
    "America/New_York",
  );
  return `${dt.toFormat("yyyy-MM-dd HH:mm")} ET`;
};
