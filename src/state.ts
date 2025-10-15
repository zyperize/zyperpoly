import { AlertRecord, TrackerStateData, WalletState } from "./types";
import {
  nowIso,
  readJsonFile,
  toLowerAddress,
  writeJsonFile,
} from "./utils";

const DEFAULT_STATE: TrackerStateData = {
  lastProcessedBlock: 0,
  wallets: {},
  alerts: [],
};

export class StateManager {
  private data: TrackerStateData = { ...DEFAULT_STATE };
  private loaded = false;

  constructor(
    private readonly filePath: string,
    private readonly maxAlerts: number,
  ) {}

  async init(): Promise<void> {
    if (this.loaded) {
      return;
    }
    const stored = await readJsonFile<TrackerStateData>(this.filePath);
    this.data = stored
      ? {
          ...DEFAULT_STATE,
          ...stored,
          wallets: stored.wallets ?? {},
          alerts: stored.alerts ?? [],
        }
      : { ...DEFAULT_STATE };
    Object.values(this.data.wallets).forEach((wallet) => {
      if (!wallet.firstActivityTimestamp) {
        wallet.firstActivityTimestamp = Math.floor(
          new Date(wallet.firstSeenAt).getTime() / 1000,
        );
      }
    });
    this.loaded = true;
  }

  getLastProcessedBlock(): number {
    return this.data.lastProcessedBlock;
  }

  setLastProcessedBlock(block: number): void {
    if (block > this.data.lastProcessedBlock) {
      this.data.lastProcessedBlock = block;
    }
  }

  getWallet(address: string): WalletState | undefined {
    return this.data.wallets[toLowerAddress(address)];
  }

  upsertWallet(address: string, state: WalletState): void {
    this.data.wallets[toLowerAddress(address)] = state;
  }

  updateWallet(
    address: string,
    mutator: (current: WalletState | undefined) => WalletState,
  ): WalletState {
    const key = toLowerAddress(address);
    const next = mutator(this.data.wallets[key]);
    this.data.wallets[key] = next;
    return next;
  }

  addAlert(alert: AlertRecord): void {
    this.data.alerts.push(alert);
    if (this.data.alerts.length > this.maxAlerts) {
      this.data.alerts.splice(0, this.data.alerts.length - this.maxAlerts);
    }
  }

  getAlerts(): AlertRecord[] {
    return [...this.data.alerts];
  }

  touch(): void {
    // ensures state considered changed even if no updates (for metadata)
    this.data.lastProcessedBlock = this.data.lastProcessedBlock;
  }

  async persist(): Promise<void> {
    if (!this.loaded) {
      throw new Error("State manager must be initialised before saving");
    }
    await writeJsonFile(this.filePath, {
      ...this.data,
      // ensure deterministic ordering for alerts by timestamp ascending
      alerts: [...this.data.alerts].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    });
  }

  snapshot(): TrackerStateData {
    return { ...this.data, alerts: [...this.data.alerts] };
  }

  static createNewWalletState(
    blockNumber: number,
    txHash: string,
    usdValue: number,
    market: WalletState["firstTradeMarket"],
    direction: WalletState["firstTradeDirection"],
    firstSeenAtIso?: string,
  ): WalletState {
    const firstSeenAt = firstSeenAtIso ?? nowIso();
    return {
      firstSeenBlock: blockNumber,
      firstSeenAt,
      firstTradeTx: txHash,
      firstTradeUsd: usdValue,
      firstTradeMarket: market,
      firstTradeDirection: direction,
      firstActivityTimestamp: Math.floor(
        new Date(firstSeenAt).getTime() / 1000,
      ),
    };
  }
}
