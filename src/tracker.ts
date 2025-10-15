import { getContractConfig } from "@polymarket/clob-client";
import { Contract, Event, providers, constants, BigNumber } from "ethers";
import { TrackerConfig } from "./config";
import { MarketCache } from "./markets";
import { EtherscanClient } from "./etherscan";
import { StateManager } from "./state";
import { AlertRecord, MarketRef, TradeDirection } from "./types";
import {
  bigNumberToNumber,
  formatEasternTime,
  hoursToMs,
  nowIso,
  unixToIso,
} from "./utils";
import exchangeAbi from "@polymarket/order-utils/dist/abi/Exchange.json";

interface TradeDetails {
  wallet: string;
  usdValue: number;
  tokenId: string;
  direction: TradeDirection;
  txHash: string;
  logIndex: number;
}

export interface TrackerRunOptions {
  startTime?: string;
  endTime?: string;
  walletAgeHours?: number;
}

export class Tracker {
  private readonly provider: providers.JsonRpcProvider;
  private readonly exchange: Contract;
  private readonly blockTimestampCache = new Map<number, number>();
  private readonly etherscan: EtherscanClient | undefined;

  constructor(
    private readonly config: TrackerConfig,
    private readonly state: StateManager,
    private readonly marketCache: MarketCache,
    etherscanClient?: EtherscanClient,
  ) {
    this.provider = new providers.JsonRpcProvider(config.polygonRpcUrl);
    const contractConfig = getContractConfig(config.chainId);
    this.exchange = new Contract(
      contractConfig.exchange,
      exchangeAbi,
      this.provider,
    );
    this.etherscan = etherscanClient;
  }

  async run(options: TrackerRunOptions = {}): Promise<AlertRecord[]> {
    const { startTime, endTime } = options;
    const useStateWindow = !startTime && !endTime;
    const mutateState = useStateWindow;

    await this.state.init();
    await this.marketCache.init();

    const latestBlock = await this.provider.getBlockNumber();
    let toBlock = latestBlock;

    if (endTime) {
      const endSeconds = Math.floor(new Date(endTime).getTime() / 1000);
      toBlock = await this.findBlockByTimestamp(endSeconds, latestBlock);
    }

    let fromBlock: number;
    if (startTime) {
      const startSeconds = Math.floor(new Date(startTime).getTime() / 1000);
      fromBlock = await this.findBlockByTimestamp(startSeconds, toBlock);
    } else if (useStateWindow) {
      const lastProcessed = this.state.getLastProcessedBlock();
      if (lastProcessed <= 0) {
        fromBlock = Math.max(
          0,
          toBlock - this.config.initialLookbackBlocks,
        );
      } else {
        fromBlock = lastProcessed + 1;
      }
    } else {
      fromBlock = Math.max(
        0,
        toBlock - this.config.initialLookbackBlocks,
      );
    }

    if (fromBlock > toBlock) {
      return [];
    }

    const events = await this.fetchOrdersMatchedEvents(fromBlock, toBlock);
    const alerts: AlertRecord[] = [];
    const walletAgeCutoffHours =
      options.walletAgeHours ?? this.config.walletMaxAgeHours ?? this.config.newWalletWindowHours;

    for (const event of events) {
      const trade = this.extractTradeDetails(event);
      if (!trade) {
        continue;
      }
      if (trade.usdValue < this.config.tradeThresholdUsd) {
        continue;
      }

      const marketInfo = await this.marketCache.getTokenInfo(trade.tokenId);
      if (!marketInfo) {
        continue;
      }

      const blockTimestamp = await this.getBlockTimestamp(
        event.blockNumber,
      );
      const marketRef: MarketRef = {
        conditionId: marketInfo.conditionId,
        question: marketInfo.question,
        outcome: marketInfo.outcome,
        slug: marketInfo.slug,
        allOutcomes: this.marketCache.getOutcomes(
          marketInfo.conditionId,
        ),
      };

      let walletState = this.state.getWallet(trade.wallet);
      if (!walletState) {
        walletState = StateManager.createNewWalletState(
          event.blockNumber,
          trade.txHash,
          trade.usdValue,
          marketRef,
          trade.direction,
          unixToIso(blockTimestamp),
        );
        if (mutateState) {
          this.state.upsertWallet(trade.wallet, walletState);
        }
      }

      let firstActivitySeconds: number | undefined =
        walletState.explorer?.firstTxTimestamp ?? walletState.firstActivityTimestamp;

      if (!firstActivitySeconds && this.etherscan) {
        try {
          const explorerTimestamp =
            await this.etherscan.getFirstTransactionTimestamp(trade.wallet);
          if (
            typeof explorerTimestamp === "number" &&
            Number.isFinite(explorerTimestamp)
          ) {
            firstActivitySeconds = explorerTimestamp;
            if (mutateState) {
              walletState = this.state.updateWallet(
                trade.wallet,
                (current) => {
                  const base = current ?? walletState!;
                  return {
                    ...base,
                    explorer: {
                      firstTxTimestamp: explorerTimestamp,
                      fetchedAt: nowIso(),
                    },
                  firstActivityTimestamp: explorerTimestamp,
                  };
                },
              );
            } else {
              walletState = {
                ...walletState,
                explorer: {
                  firstTxTimestamp: explorerTimestamp,
                  fetchedAt: nowIso(),
                },
                firstActivityTimestamp: explorerTimestamp,
              };
            }
          }
        } catch (error) {
          console.warn(
            `Etherscan lookup failed for ${trade.wallet}:`,
            (error as Error).message,
          );
        }
      }

      if (!firstActivitySeconds) {
        firstActivitySeconds = Math.floor(
          new Date(walletState.firstSeenAt).getTime() / 1000,
        );
        if (mutateState) {
          walletState = this.state.updateWallet(trade.wallet, (current) => ({
            ...(current ?? walletState!),
            firstActivityTimestamp: firstActivitySeconds!,
          }));
        } else {
          walletState = {
            ...walletState,
            firstActivityTimestamp: firstActivitySeconds!,
          };
        }
      }

      if (firstActivitySeconds === undefined) {
        continue;
      }

      const isNewWallet =
        (blockTimestamp - firstActivitySeconds) * 1000 <=
        hoursToMs(walletAgeCutoffHours);

      const walletAgeHours =
        (blockTimestamp - firstActivitySeconds) / 3600;

      if (!isNewWallet) {
        continue;
      }

      const walletFirstSeenLocal = formatEasternTime(firstActivitySeconds);

      const alert: AlertRecord = {
        address: trade.wallet,
        txHash: trade.txHash,
        blockNumber: event.blockNumber,
        blockTimestamp,
        usdValue: trade.usdValue,
        market: marketRef,
        direction: trade.direction,
        createdAt: nowIso(),
        walletFirstSeen: walletFirstSeenLocal,
        walletAgeHours,
      };

      if (mutateState) {
        this.state.addAlert(alert);
      }
      alerts.push(alert);
    }

    if (mutateState) {
      this.state.setLastProcessedBlock(toBlock);
      await this.state.persist();
    }

    return alerts;
  }

  private async fetchOrdersMatchedEvents(
    fromBlock: number,
    toBlock: number,
  ): Promise<Event[]> {
    const filterFactory = this.exchange.filters?.OrdersMatched;
    if (typeof filterFactory !== "function") {
      throw new Error(
        "OrdersMatched filter is unavailable on the exchange contract",
      );
    }
    const filter = filterFactory();
    const step = Math.max(1, this.config.blockBatchSize);
    const allEvents: Event[] = [];

    for (let start = fromBlock; start <= toBlock; start += step + 1) {
      const end = Math.min(start + step, toBlock);
      const chunk = await this.exchange.queryFilter(filter, start, end);
      allEvents.push(...chunk);
    }

    return allEvents.sort((a, b) => {
      if (a.blockNumber === b.blockNumber) {
        return a.logIndex - b.logIndex;
      }
      return a.blockNumber - b.blockNumber;
    });
  }

  private extractTradeDetails(event: Event): TradeDetails | undefined {
    if (!event.args) {
      return undefined;
    }

    const taker = event.args.takerOrderMaker as string | undefined;
    if (!taker) {
      return undefined;
    }

    const makerAssetId = event.args.makerAssetId as BigNumber;
    const takerAssetId = event.args.takerAssetId as BigNumber;
    const makerAmountFilled = event.args.makerAmountFilled as BigNumber;
    const takerAmountFilled = event.args.takerAmountFilled as BigNumber;
    const txHash = event.transactionHash;

    const isMakerUsdc = makerAssetId.eq(constants.Zero);
    const isTakerUsdc = takerAssetId.eq(constants.Zero);

    if (!isMakerUsdc && !isTakerUsdc) {
      return undefined;
    }

    let usdValue: number;
    let tokenId: string;
    let direction: TradeDirection;

    if (isTakerUsdc) {
      usdValue = bigNumberToNumber(takerAmountFilled);
      tokenId = makerAssetId.toString();
      direction = "BUY";
    } else {
      usdValue = bigNumberToNumber(makerAmountFilled);
      tokenId = takerAssetId.toString();
      direction = "SELL";
    }

    return {
      wallet: taker.toLowerCase(),
      usdValue,
      tokenId,
      direction,
      txHash,
      logIndex: event.logIndex,
    };
  }

  private async getBlockTimestamp(blockNumber: number): Promise<number> {
    if (this.blockTimestampCache.has(blockNumber)) {
      return this.blockTimestampCache.get(blockNumber)!;
    }
    const block = await this.provider.getBlock(blockNumber);
    const timestamp = block.timestamp;
    this.blockTimestampCache.set(blockNumber, timestamp);
    return timestamp;
  }

  private async findBlockByTimestamp(
    targetSeconds: number,
    upperBound?: number,
  ): Promise<number> {
    let high = upperBound ?? (await this.provider.getBlockNumber());
    let low = 0;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const block = await this.provider.getBlock(mid);
      if (!block) {
        high = mid;
        continue;
      }

      if (block.timestamp >= targetSeconds) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    return low;
  }
}
