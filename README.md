## Polymarket High-Value Wallet Tracker

Monitor Polymarket for large trades placed by newly created wallets. The tracker:

- Streams OrdersMatched logs from the Polymarket exchange contract on Polygon
- Uses the public CLOB REST API to resolve outcome token metadata
- Optionally queries Etherscan v2 (chain=polygon) to determine when a wallet first appeared on-chain

Each scan prints plain-English summaries, updates data/state.json, and writes a TXT report into ./runs.

> **Ethics & Compliance**
> Use this tool responsibly and ensure your monitoring aligns with local laws, privacy guidelines, and Polymarket’s terms of service.

---

### Prerequisites

- Node.js 18 or later (Node 22 recommended)
- Internet access (Polygon RPC, Polymarket CLOB, optional Etherscan v2)

---

### Setup

1. **Install dependencies**
   `ash
   npm install
   `

2. **Configure environment (optional)** – copy .env.example to .env and tweak values.

   | Variable | Default | Notes |
   | --- | --- | --- |
   | POLYGON_RPC_URL | https://polygon-rpc.com | Replace with a dedicated endpoint (e.g., Alchemy) for higher limits. |
   | POLYMARKET_HOST | https://clob.polymarket.com | Polymarket CLOB REST host. |
   | POLYMARKET_CHAIN_ID | 137 | Polygon mainnet chain ID. |
   | TRADE_THRESHOLD_USD | 10000 | Minimum USDC notional required for an alert. |
   | NEW_WALLET_WINDOW_HOURS | 72 | Maximum age (hours) for a wallet to qualify as “new.” |
   | INITIAL_LOOKBACK_BLOCKS | 90000 | Historical catch-up window (~48 hours) when state is empty. |
   | BLOCK_BATCH_SIZE | 9 | Blocks per eth_getLogs call (9 + 1 keeps Alchemy’s free tier happy). |
   | MAX_ALERT_HISTORY | 500 | Alerts retained in data/state.json. |
   | MARKETS_CACHE_TTL_HOURS | 6 | How often to refresh the cached market metadata. |
   | ETHERSCAN_API_KEY | _(unset)_ | Supply to fetch wallet-creation timestamps. |
   | ETHERSCAN_RATE_LIMIT_MS | 300 | Delay between Etherscan requests (ms). |
   | WALLET_MAX_AGE_HOURS | 48 | Default wallet-age cutoff for alerts (overridable in the UI). |
   | SCAN_LOG_DIR | ./runs | Directory for archived TXT reports. |
   | TRACKER_DATA_DIR | ./data | Directory for state/market cache files. |

   Example .env snippet:
   `ini
   POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/<YOUR_KEY>
   ETHERSCAN_API_KEY=your_api_key_here
   WALLET_MAX_AGE_HOURS=48
   `

3. **First run**
   `ash
   npm run dev
   `
   Cached market metadata is reused until it expires.

---

### Running the Tracker

- **CLI (development)**
  `ash
  npm run dev
  `
- **CLI (compiled)**
  `ash
  npm run build
  npm start
  `
- **Desktop app (Electron UI)**
  `ash
  npm run app
  `
  The app exposes a *Scan Options* dropdown:
  - **Recent Activity (default)** - preset windows (15-240 minutes) with a rolling cutoff
  - **Specific Day** - scan 00:00-23:59 Eastern for a selected day
  - **Custom UTC Range** - manual start/end (max 24 hours)

  You can also set the “Wallet Age = (hours)” filter (defaults to 48). The **View Reports** button opens the uns/ folder.

All modes reuse the same logic—each scan processes the requested window, prints summaries, and archives uns/scan-<timestamp>.txt.

---

### Outputs

- **Console / UI** – summaries like Wallet 0x… bet ,000 USDC that “Chiefs” will NOT happen in “Raiders vs. Chiefs”, with implied positions, wallet age (in hours), Eastern Time timestamps, and market links.
- **TXT archive** – every scan logs the same content in uns/scan-YYYY-MM-DDTHH-mm-ssZ.txt.
- **State** – data/state.json tracks wallet history, alerts, and the last processed block for reference.

---

### How It Works (Quick Tour)

1. Tracker pulls OrdersMatched logs in block batches via Polygon RPC.
2. Trades are decoded to determine BUY/SELL, USDC notional, and outcome token IDs.
3. Outcome tokens are resolved with the CLOB API (cached in data/markets.json).
4. Wallet age is computed from state plus optional Etherscan timestamps; alerts are gated by your wallet-age cutoff.
5. Alerts are enriched (implied position, link, stake) and persisted to state + TXT logs.

---

### Troubleshooting

- **RPC throttling / “too many requests”** – lower BLOCK_BATCH_SIZE, slow down scans, or upgrade to a higher-tier RPC.
- **eth_getLogs 10-block limit (Alchemy free)** – keep BLOCK_BATCH_SIZE = 9 (already set in .env).
- **Missing alerts** – adjust TRADE_THRESHOLD_USD, widen NEW_WALLET_WINDOW_HOURS, or lower the wallet-age cutoff.
- **Slow replays** – shrink INITIAL_LOOKBACK_BLOCKS or use a faster RPC endpoint.

Stay ethical, verify your insights, and proceed responsibly.


