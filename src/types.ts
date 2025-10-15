export type TradeDirection = "BUY" | "SELL";

export interface MarketRef {
  conditionId: string;
  question: string;
  outcome: string;
  slug: string;
  allOutcomes?: string[];
}

export interface MarketTokenInfo extends MarketRef {
  tokenId: string;
  closed: boolean;
}

export interface MarketCacheSnapshot {
  fetchedAt: string;
  tokens: Record<string, MarketTokenInfo>;
  outcomes: Record<string, string[]>;
}

export interface WalletState {
  firstSeenBlock: number;
  firstSeenAt: string;
  firstTradeTx: string;
  firstTradeUsd: number;
  firstTradeDirection: TradeDirection;
  firstTradeMarket: MarketRef;
  firstActivityTimestamp?: number;
  explorer?: {
    firstTxTimestamp: number;
    fetchedAt: string;
  };
}

export interface AlertRecord {
  address: string;
  txHash: string;
  blockNumber: number;
  blockTimestamp: number;
  usdValue: number;
  market: MarketRef;
  direction: TradeDirection;
  createdAt: string;
  walletFirstSeen: string;
  walletAgeHours: number;
}

export interface TrackerStateData {
  lastProcessedBlock: number;
  wallets: Record<string, WalletState>;
  alerts: AlertRecord[];
}
