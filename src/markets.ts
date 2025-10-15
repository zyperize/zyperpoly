import { ClobClient } from "@polymarket/clob-client";
import {
  END_CURSOR,
  INITIAL_CURSOR,
} from "@polymarket/clob-client/dist/constants";
import { MarketCacheSnapshot, MarketTokenInfo } from "./types";
import {
  nowIso,
  readJsonFile,
  writeJsonFile,
} from "./utils";

interface RawMarket {
  condition_id: string;
  question: string;
  market_slug: string;
  closed: boolean;
  tokens: Array<{
    token_id: string;
    outcome: string;
  }>;
}

interface MarketsResponse {
  data: RawMarket[];
  next_cursor: string;
}

export class MarketCache {
  private tokens = new Map<string, MarketTokenInfo>();
  private marketOutcomes = new Map<string, string[]>();
  private lastFetchedAt?: string;

  constructor(
    private readonly client: ClobClient,
    private readonly cacheFile: string,
    private readonly ttlHours: number,
  ) {}

  async init(): Promise<void> {
    const snapshot = await readJsonFile<MarketCacheSnapshot>(this.cacheFile);
    if (snapshot && !this.isStale(snapshot.fetchedAt)) {
      this.applySnapshot(snapshot);
      return;
    }
    await this.refresh();
  }

  private isStale(fetchedAtIso: string): boolean {
    const ageMs = Date.now() - new Date(fetchedAtIso).getTime();
    const ttlMs = this.ttlHours * 60 * 60 * 1000;
    return Number.isNaN(ageMs) || ageMs > ttlMs;
  }

  private applySnapshot(snapshot: MarketCacheSnapshot): void {
    this.tokens = new Map(
      Object.entries(snapshot.tokens ?? {}).map(([, info]) => [
        info.tokenId,
        info,
      ]),
    );
    this.marketOutcomes = new Map(
      Object.entries(snapshot.outcomes ?? {}),
    );
    this.lastFetchedAt = snapshot.fetchedAt;
  }

  async refresh(): Promise<void> {
    const { tokens, outcomes } = await this.fetchAllMarkets();
    this.marketOutcomes = outcomes;
    const snapshot: MarketCacheSnapshot = {
      fetchedAt: nowIso(),
      tokens: Object.fromEntries(
        tokens.map((info) => [info.tokenId, info]),
      ),
      outcomes: Object.fromEntries(outcomes.entries()),
    };
    this.applySnapshot(snapshot);
    await writeJsonFile(this.cacheFile, snapshot);
  }

  async getTokenInfo(tokenId: string): Promise<MarketTokenInfo | undefined> {
    if (!this.tokens.size) {
      await this.init();
    }
    let info = this.tokens.get(tokenId);
    if (!info) {
      await this.refresh();
      info = this.tokens.get(tokenId);
    }
    return info;
  }

  getOutcomes(conditionId: string): string[] {
    return this.marketOutcomes.get(conditionId) ?? [];
  }

  private async fetchAllMarkets(): Promise<{
    tokens: MarketTokenInfo[];
    outcomes: Map<string, string[]>;
  }> {
    const collected: MarketTokenInfo[] = [];
    const outcomesMap = new Map<string, string[]>();
    let cursor: string | undefined;

    // limit to avoid infinite loops
    const safetyLimit = 200;
    let iterations = 0;

    while (iterations < safetyLimit) {
      iterations += 1;
      const response = (await this.client.getMarkets(
        cursor ?? INITIAL_CURSOR,
      )) as MarketsResponse;
      const markets = response.data ?? [];
      for (const market of markets) {
        const outcomeNames = (market.tokens ?? []).map(
          (token) => token.outcome,
        );
        outcomesMap.set(market.condition_id, outcomeNames);
        for (const token of market.tokens ?? []) {
          collected.push({
            tokenId: token.token_id,
            conditionId: market.condition_id,
            outcome: token.outcome,
            question: market.question,
            slug: market.market_slug,
            closed: market.closed,
          });
        }
      }
      cursor = response.next_cursor;
      if (!cursor || cursor === END_CURSOR) {
        break;
      }
    }
    return { tokens: collected, outcomes: outcomesMap };
  }
}
