import { delay, toLowerAddress } from "./utils";

interface EtherscanResponse {
  status: string;
  message: string;
  result: Array<{
    timeStamp?: string;
  }>;
}

export class EtherscanClient {
  private readonly cache = new Map<string, number>();
  private lastRequestAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly rateLimitMs: number,
    private readonly chain: string = "polygon",
  ) {}

  async getFirstTransactionTimestamp(
    address: string,
  ): Promise<number | undefined> {
    const key = toLowerAddress(address);
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    await this.enforceRateLimit();

    const params = new URLSearchParams({
      chain: this.chain,
      module: "account",
      action: "txlist",
      address: key,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: "1",
      sort: "asc",
      apikey: this.apiKey,
    });

    const response = await fetch(
      `https://api.etherscan.io/v2/api?${params.toString()}`,
    );

    if (!response.ok) {
      throw new Error(
        `Etherscan request failed with status ${response.status}`,
      );
    }

    const payload = (await response.json()) as EtherscanResponse;
    if (payload.status !== "1" || !Array.isArray(payload.result)) {
      if (payload.message?.toLowerCase().includes("no transactions found")) {
        this.cache.set(key, Number.NaN);
        return undefined;
      }
      throw new Error(
        `Etherscan responded with status ${payload.status} (${payload.message})`,
      );
    }

    const first = payload.result[0];
    const timestamp = Number(first?.timeStamp);
    if (!Number.isFinite(timestamp)) {
      return undefined;
    }

    this.cache.set(key, timestamp);
    return timestamp;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.rateLimitMs) {
      await delay(this.rateLimitMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }
}
