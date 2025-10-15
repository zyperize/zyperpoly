const runButton = document.getElementById("run-scan");
const viewButton = document.getElementById("view-scans");
const scanModeSelect = document.getElementById("scan-mode");
const calendarDayInput = document.getElementById("calendar-day");
const calendarDayGroup = document.getElementById("calendar-day-group");
const customRangeGroup = document.getElementById("custom-range-group");
const startInput = document.getElementById("start-time");
const endInput = document.getElementById("end-time");
const recentGroup = document.getElementById("recent-minutes-group");
const recentSelect = document.getElementById("recent-minutes");
const walletAgeSelect = document.getElementById("wallet-age-hours");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

scanModeSelect.value = "recent";

const renderAlerts = (alerts) => {
  resultsEl.innerHTML = "";
  if (!alerts.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No high-value bets from newly created wallets in this scan.";
    resultsEl.appendChild(empty);
    return;
  }

  alerts.forEach((alert) => {
    const card = document.createElement("div");
    card.className = "card";

    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = alert.summary;
    card.appendChild(summary);

    const contextTag = document.createElement("div");
    contextTag.className = "context-tag";
    contextTag.textContent = alert.impliedPosition;
    card.appendChild(contextTag);

    const metaList = document.createElement("ul");
    metaList.className = "meta";

    const pairs = [
      ["Implied Position", alert.impliedPosition],
      ["Stake", `${alert.stake} ${alert.currency}`],
      ["Direction", alert.directionText],
      ["Wallet Age", `${alert.walletAgeHours.toFixed(1)} hours (first seen ${alert.walletFirstSeen})`],
      ["Market", `${alert.market.question} -> ${alert.market.outcome}`],
      ["Block", `${alert.blockNumber} @ ${alert.blockLocal}`],
      ["Transaction", alert.txHash],
    ];

    pairs.forEach(([label, value]) => {
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;
      li.appendChild(strong);
      li.appendChild(document.createTextNode(value));
      metaList.appendChild(li);
    });

    card.appendChild(metaList);

    const linkRow = document.createElement("div");
    linkRow.className = "actions";
    const linkBtn = document.createElement("button");
    linkBtn.className = "link-button";
    linkBtn.textContent = "Open Market";
    linkBtn.addEventListener("click", () => {
      window.tracker.openLink(alert.marketUrl);
    });
    linkRow.appendChild(linkBtn);
    card.appendChild(linkRow);

    resultsEl.appendChild(card);
  });
};

const getIsoValue = (value) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date/time provided.");
  }
  return parsed.toISOString();
};

const updateModeVisibility = () => {
  const mode = scanModeSelect.value;
  calendarDayGroup.classList.toggle("hidden", mode !== "calendar-day");
  customRangeGroup.classList.toggle("hidden", mode !== "custom-range");
  recentGroup.classList.toggle("hidden", mode !== "recent");
};

scanModeSelect.addEventListener("change", updateModeVisibility);
updateModeVisibility();

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  statusEl.textContent = "Scanning Polymarket…";
  resultsEl.innerHTML = "";

  try {
    const mode = scanModeSelect.value;
    const walletAgeHours = parseInt(walletAgeSelect.value, 10) || 48;
    const payload = {
      scanMode: mode,
      walletAgeHours,
    };

    if (mode === "calendar-day") {
      if (!calendarDayInput.value) {
        throw new Error("Select a calendar day to scan.");
      }
      payload.calendarDay = calendarDayInput.value;
    } else if (mode === "custom-range") {
      if (!startInput.value || !endInput.value) {
        throw new Error("Provide both start and end times (maximum window: 24 hours).");
      }
      const fromIso = getIsoValue(startInput.value);
      const toIso = getIsoValue(endInput.value);
      const diff = new Date(toIso).getTime() - new Date(fromIso).getTime();
      if (diff < 0) {
        throw new Error("The end time must be after the start time.");
      }
      if (diff > 24 * 60 * 60 * 1000) {
        throw new Error("Scan window cannot exceed 24 hours.");
      }
      payload.from = fromIso;
      payload.to = toIso;
    } else if (mode === "recent") {
      payload.recentMinutes = parseInt(recentSelect.value, 10);
    }

    const result = await window.tracker.runScan(payload);
    const baseMessage = result.message + (result.logPath ? ` (Report saved to ${result.logPath})` : "");
    statusEl.textContent = `${baseMessage} • Wallet age cutoff: ${walletAgeHours} hours`;
    renderAlerts(result.alerts);
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Scan failed: ${error.message}`;
  } finally {
    runButton.disabled = false;
  }
});

viewButton.addEventListener("click", () => {
  window.tracker.openScans();
});

