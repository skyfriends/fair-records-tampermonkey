// ==UserScript==
// @name         Discogs Release Rarity Finder v1.0
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Expand all releases on a Discogs master page, score desirability, and highlight the top pick.
// @author       rova_records
// @match        https://www.discogs.com/master/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_release-desirability-highlighter.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_release-desirability-highlighter.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    highlightClass: "best-release-highlight",
    badgeClass: "best-release-badge",
    buttonId: "discogs-desirability-analyzer",
    highlightColor: "#d9f6d1",
    badgeBg: "#2e7d32",
    badgeText: "Best Pick",
    analysisDelayMs: 120,
    expandCheckAttempts: 15,
    expandCheckIntervalMs: 120,
    recheckIntervalMs: 1500,
    trayReadyAttempts: 30,
    trayReadyIntervalMs: 150,
    scorePillClass: "release-score-pill",
    debugPanelId: "discogs-desirability-debug",
    showInlineScores: true,
    showDebugPanel: true,
  };

  const METRIC_KEYS = [
    "medianPrice",
    "lowestPrice",
    "highestPrice",
    "wantedCount",
    "collectedCount",
    "forSaleCount",
    "rating",
  ];

  const REQUIRED_KEYS = [
    "medianPrice",
    "wantedCount",
    "collectedCount",
    "forSaleCount",
  ];

  const METRIC_TOLERANCES = {
    medianPrice: 0.01,
    lowestPrice: 0.01,
    highestPrice: 0.01,
    wantedCount: 0,
    collectedCount: 0,
    forSaleCount: 0,
    rating: 0.01,
  };

  const SELECTORS = {
    table: "table[class*='table_']",
    rows: "table[class*='table_'] tbody tr[class*='row_']",
    toggleCell: "td[class*='toggle_'] button",
    trayRoot: "td[class*='tray_'] div[class*='tray_']",
    forSale: "div[class*='forsale_'] strong",
    historyColumns: "div[class*='columns_'][class*='history'] div[class*='column_']",
    historyLabel: "div[class*='name_']",
    statsBlocks: "div[class*='blocks_'] div[class*='block_']",
    ratings: "div[class*='ratings_']",
    titleCell: "td[class*='title_']",
    titleLink: "td[class*='title_'] a[href*='/release/']",
    footer: "div[class*='footer_'] span[class*='id_']",
    preheader: "div[class*='preheader_']",
  };

  const WEIGHTS = {
    medianPrice: 0.45,
    wantedCount: 0.2,
    wantedRatio: 0.1,
    rating: 0.15,
    scarcity: 0.1,
  };

  function injectStyles() {
    if (document.getElementById(`${CONFIG.buttonId}-styles`)) return;
    const style = document.createElement("style");
    style.id = `${CONFIG.buttonId}-styles`;
    style.textContent = `
      .${CONFIG.highlightClass} {
        background: ${CONFIG.highlightColor} !important;
        transition: background-color 0.4s ease;
      }
      .${CONFIG.badgeClass} {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: 8px;
        padding: 2px 8px;
        border-radius: 12px;
        background: ${CONFIG.badgeBg};
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .${CONFIG.badgeClass} svg {
        width: 12px;
        height: 12px;
        fill: currentColor;
      }
      #${CONFIG.buttonId} {
        margin-left: 12px;
        background: #1976d2;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 2px 6px rgba(0,0,0,0.18);
        transition: background 0.2s ease;
      }
      #${CONFIG.buttonId}:hover:not([disabled]) {
        background: #145aa0;
      }
      #${CONFIG.buttonId}[disabled] {
        cursor: progress;
        opacity: 0.7;
      }
    `;
    document.head.appendChild(style);
  }

  function waitForElement(selector, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      if (timeoutMs) {
        setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Timeout waiting for selector: ${selector}`));
        }, timeoutMs);
      }
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findPreheaderContainer() {
    return (
      document.querySelector(SELECTORS.preheader) ||
      document.querySelector("#view [class*='preheader']") ||
      document.querySelector("div[class*='well_']") ||
      document.querySelector("main") ||
      document.body
    );
  }

  function injectAnalyzeButton() {
    if (document.getElementById(CONFIG.buttonId)) return;
    const container = findPreheaderContainer();
    if (!container) return;

    const button = document.createElement("button");
    button.id = CONFIG.buttonId;
    button.type = "button";
    button.textContent = "Highlight Best Release";
    button.addEventListener("click", () => analyze(button));

    const anchor = container.querySelector("#wantlist-button") || container.firstElementChild;
    if (anchor && anchor.nextSibling) {
      container.insertBefore(button, anchor.nextSibling);
    } else {
      container.appendChild(button);
    }
  }

  async function analyze(button, options = {}) {
    const { auto = false } = options;
    try {
      const originalText = button ? button.textContent : "";
      if (button) {
        button.disabled = true;
        button.textContent = auto ? "Auto analyzing…" : "Analyzing…";
      }

      const rows = Array.from(document.querySelectorAll(SELECTORS.rows));

      if (!rows.length) {
        if (button) {
          button.textContent = "No releases found";
          await sleep(2000);
          button.textContent = originalText;
          button.disabled = false;
        }
        return;
      }

      const togglesOpened = await expandAllRows(rows);
      await ensureTraysReady(rows);
      await sleep(CONFIG.analysisDelayMs);

      const results = rows
        .map((row) => parseRowData(row))
        .filter((data) => data !== null);

      if (!results.length) {
        if (button) {
          button.textContent = "No data available";
          await sleep(2000);
          button.textContent = originalText;
          button.disabled = false;
        }
        await collapseToggles(togglesOpened);
        return;
      }

      computeScores(results);
      const best = selectBest(results);

      annotateRows(results);
      logResults(results, best);
      renderDebugPanel(results, best);
      highlightBest(rows, best);
      await collapseToggles(togglesOpened);

      if (best) {
        console.table(
          results.map((entry) => ({
            title: entry.title,
            releaseId: entry.releaseId,
            medianPrice: entry.metrics.medianPrice,
            wanted: entry.metrics.wantedCount,
            collected: entry.metrics.collectedCount,
            forSale: entry.metrics.forSaleCount,
            rating: entry.metrics.rating,
            score: entry.score.toFixed(3),
          }))
        );
        if (button) {
          button.textContent = `Highlighted: ${best.title}`;
        }
      } else {
        if (button) {
          button.textContent = "Unable to pick best";
        }
      }

      if (button) {
        await sleep(2500);
        button.textContent = originalText;
        button.disabled = false;
      }
    } catch (error) {
      console.error("Discogs desirability highlighter error", error);
      if (button) {
        button.textContent = "Something went wrong";
        await sleep(2500);
        button.textContent = "Try Again";
        button.disabled = false;
      }
    }
  }

  async function expandAllRows(rows) {
    const togglesOpened = [];
    for (const row of rows) {
      const toggle = row.querySelector(SELECTORS.toggleCell);
      if (!toggle) continue;
      if (toggle.getAttribute("aria-expanded") === "true") {
        continue;
      }
      toggle.click();
      togglesOpened.push(toggle);
      await waitForExpanded(toggle);
    }
    return togglesOpened;
  }

  async function ensureTraysReady(rows) {
    await Promise.all(rows.map((row) => waitForTrayData(row)));
  }

  async function waitForTrayData(row) {
    const tray = row.querySelector(SELECTORS.trayRoot);
    if (!tray) return;

    let previous = null;
    let stableAttempts = 0;

    for (let attempt = 0; attempt < CONFIG.trayReadyAttempts; attempt += 1) {
      const snapshot = getMetricsSnapshot(tray);

      if (metricsArePopulated(snapshot)) {
        if (previous && metricsAreStable(previous, snapshot)) {
          stableAttempts += 1;
        } else {
          stableAttempts = 0;
        }

        previous = snapshot;

        if (stableAttempts >= 1) {
          row.dataset.desirabilitySnapshot = JSON.stringify(snapshot);
          return;
        }
      } else {
        previous = null;
        stableAttempts = 0;
      }

      await sleep(CONFIG.trayReadyIntervalMs);
    }
  }

  function getMetricsSnapshot(tray) {
    return {
      forSaleCount: parseIntFromText(
        tray.querySelector(SELECTORS.forSale)?.textContent
      ),
      lowestPrice: extractPriceFromHistory(tray, "Lowest"),
      medianPrice: extractPriceFromHistory(tray, "Median"),
      highestPrice: extractPriceFromHistory(tray, "Highest"),
      collectedCount: extractLabeledCount(tray, "Collected"),
      wantedCount: extractLabeledCount(tray, "Wanted"),
      rating: extractRating(tray),
    };
  }

  async function waitForExpanded(toggle) {
    for (let attempt = 0; attempt < CONFIG.expandCheckAttempts; attempt += 1) {
      if (toggle.getAttribute("aria-expanded") === "true") {
        return true;
      }
      await sleep(CONFIG.expandCheckIntervalMs);
    }
    return false;
  }

  async function collapseToggles(toggles) {
    for (const toggle of toggles) {
      if (!toggle || toggle.getAttribute("aria-expanded") !== "true") continue;
      toggle.click();
      await waitForCollapsed(toggle);
    }
  }

  async function waitForCollapsed(toggle) {
    for (let attempt = 0; attempt < CONFIG.expandCheckAttempts; attempt += 1) {
      if (toggle.getAttribute("aria-expanded") !== "true") {
        return true;
      }
      await sleep(CONFIG.expandCheckIntervalMs);
    }
    return false;
  }

  function parseRowData(row) {
    const tray = row.querySelector(SELECTORS.trayRoot);
    if (!tray) return null;

    const cached = row.dataset.desirabilitySnapshot
      ? JSON.parse(row.dataset.desirabilitySnapshot)
      : null;

    const metrics = cached ?? getMetricsSnapshot(tray);

    metrics.wantedRatio = deriveWantedRatio(
      metrics.wantedCount,
      metrics.collectedCount
    );

    const title = row.querySelector(SELECTORS.titleLink)?.textContent?.trim() ?? "";
    const releaseIdRaw = tray.querySelector(SELECTORS.footer)?.textContent?.trim() ?? "";
    const releaseId = releaseIdRaw.replace(/[^0-9]/g, "");

    return {
      row,
      title,
      releaseId: releaseId || null,
      metrics,
      score: 0,
    };
  }

  function parseCurrency(value) {
    if (!value) return null;
    const normalized = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseIntFromText(value) {
    if (!value) return null;
    const parsed = parseInt(value.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function extractPriceFromHistory(tray, label) {
    const column = Array.from(tray.querySelectorAll(SELECTORS.historyColumns)).find(
      (col) => {
        const name = col.querySelector(SELECTORS.historyLabel);
        return name && name.textContent.trim().toLowerCase() === label.toLowerCase();
      }
    );

    if (!column) return null;
    const priceText = column.firstElementChild?.textContent?.trim();
    return parseCurrency(priceText);
  }

  function extractLabeledCount(tray, labelText) {
    const block = Array.from(tray.querySelectorAll(SELECTORS.statsBlocks)).find(
      (element) => {
        const label = element.querySelector("label");
        return label && label.textContent.trim().toLowerCase() === labelText.toLowerCase();
      }
    );
    if (!block) return null;
    const label = block.querySelector("label");
    if (!label) return null;
    const valueText = block.textContent
      .replace(label.textContent, "")
      .trim()
      .replace(/[^0-9]/g, "");
    return parseInt(valueText, 10) || null;
  }

  function extractRating(tray) {
    const ratingsBlock = tray.querySelector(SELECTORS.ratings);
    if (!ratingsBlock) return null;
    const match = ratingsBlock.textContent.match(/([0-9]+\.[0-9]+|[0-9]+)/);
    if (!match) return null;
    const rating = parseFloat(match[1]);
    return Number.isFinite(rating) ? rating : null;
  }

  function deriveWantedRatio(wanted, collected) {
    if (wanted == null) return null;
    const denominator = collected && collected > 0 ? collected : 1;
    return wanted / denominator;
  }

  function normalize(value, min, max) {
    if (value == null || !Number.isFinite(value)) return null;
    if (max === min) return 0.5;
    return (value - min) / (max - min);
  }

  function computeScores(results) {
    const collect = (keyFn) =>
      results
        .map((entry) => keyFn(entry.metrics))
        .filter((value) => value != null && Number.isFinite(value));

    const medians = collect((metrics) => metrics.medianPrice);
    const wantedCounts = collect((metrics) => metrics.wantedCount);
    const ratios = collect((metrics) => metrics.wantedRatio);
    const ratings = collect((metrics) => metrics.rating);
    const forSaleCounts = collect((metrics) => metrics.forSaleCount);

    const ranges = {
      medianPrice: getRange(medians),
      wantedCount: getRange(wantedCounts),
      wantedRatio: getRange(ratios),
      rating: getRange(ratings.length ? ratings : [0, 5]),
      forSaleCount: getRange(forSaleCounts),
    };

    results.forEach((entry) => {
      const components = [];
      const { metrics } = entry;

      const priceScore = normalize(
        metrics.medianPrice,
        ranges.medianPrice.min,
        ranges.medianPrice.max
      );
      pushComponent(components, priceScore, WEIGHTS.medianPrice, "medianPrice");

      const wantedScore = normalize(
        metrics.wantedCount,
        ranges.wantedCount.min,
        ranges.wantedCount.max
      );
      pushComponent(components, wantedScore, WEIGHTS.wantedCount, "wantedCount");

      const ratioScore = normalize(
        metrics.wantedRatio,
        ranges.wantedRatio.min,
        ranges.wantedRatio.max
      );
      pushComponent(components, ratioScore, WEIGHTS.wantedRatio, "wantedRatio");

      const ratingScore = metrics.rating != null ? metrics.rating / 5 : null;
      pushComponent(components, ratingScore, WEIGHTS.rating, "rating");

      const scarcityScore = (() => {
        const norm = normalize(
          metrics.forSaleCount,
          ranges.forSaleCount.min,
          ranges.forSaleCount.max
        );
        return norm != null ? 1 - norm : null;
      })();
      pushComponent(components, scarcityScore, WEIGHTS.scarcity, "scarcity");

      const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
      const weightedSum = components.reduce(
        (sum, c) => sum + c.weight * c.value,
        0
      );

      entry.score = totalWeight ? weightedSum / totalWeight : 0;
      entry.scoreBreakdown = components;
    });
  }

  function getRange(values) {
    if (!values.length) return { min: 0, max: 0 };
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  function pushComponent(list, value, weight, name) {
    if (value == null || !Number.isFinite(value)) return;
    list.push({ name, value, weight });
  }

  function selectBest(results) {
    if (!results.length) return null;
    return results.reduce((best, current) => {
      if (!best) return current;
      if (current.score > best.score) return current;
      if (current.score < best.score) return best;

      const aMedian = current.metrics.medianPrice ?? 0;
      const bMedian = best.metrics.medianPrice ?? 0;
      if (aMedian !== bMedian) {
        return aMedian > bMedian ? current : best;
      }

      const aWanted = current.metrics.wantedCount ?? 0;
      const bWanted = best.metrics.wantedCount ?? 0;
      if (aWanted !== bWanted) {
        return aWanted > bWanted ? current : best;
      }

      const aScarcity = current.metrics.forSaleCount ?? Number.MAX_VALUE;
      const bScarcity = best.metrics.forSaleCount ?? Number.MAX_VALUE;
      if (aScarcity !== bScarcity) {
        return aScarcity < bScarcity ? current : best;
      }

      return best;
    }, null);
  }

  function annotateRows(results) {
    if (!CONFIG.showInlineScores) return;

    results.forEach((entry) => {
      const { row, score, metrics } = entry;
      row.dataset.desirabilityScore = score.toFixed(4);
      row.dataset.desirabilityMetrics = JSON.stringify(metrics);

      const titleCell = row.querySelector(SELECTORS.titleCell);
      if (!titleCell) return;

      const existing = titleCell.querySelector(`.${CONFIG.scorePillClass}`);
      if (existing) existing.remove();

      const pill = document.createElement("span");
      pill.className = CONFIG.scorePillClass;
      pill.textContent = `Score: ${score.toFixed(3)}`;
      pill.title = buildMetricsTooltip(metrics);
      titleCell.appendChild(pill);
    });
  }

  function logResults(results, best) {
    const sorted = [...results].sort((a, b) => b.score - a.score);
    console.group("Discogs desirability metrics");
    console.table(
      sorted.map((entry) => ({
        title: entry.title,
        releaseId: entry.releaseId,
        score: Number(entry.score.toFixed(4)),
        medianPrice: entry.metrics.medianPrice ?? null,
        wanted: entry.metrics.wantedCount ?? null,
        collected: entry.metrics.collectedCount ?? null,
        wantedRatio: entry.metrics.wantedRatio
          ? Number(entry.metrics.wantedRatio.toFixed(3))
          : null,
        rating: entry.metrics.rating ?? null,
        forSale: entry.metrics.forSaleCount ?? null,
      }))
    );
    if (best) {
      console.info(
        "Selected best release:",
        best.title,
        "(ID:",
        best.releaseId,
        ")",
        best.metrics
      );
    }
    console.groupEnd();
  }

  function renderDebugPanel(results, best) {
    if (!CONFIG.showDebugPanel) return;

    const container = ensureDebugPanel();
    if (!container) return;

    const sorted = [...results].sort((a, b) => b.score - a.score);

    const rowsHtml = sorted
      .map((entry) => {
        const highlight = best && entry.releaseId === best.releaseId;
        const cells = [
          entry.title,
          entry.releaseId || "—",
          formatNumber(entry.metrics.medianPrice, "$"),
          formatNumber(entry.metrics.wantedCount),
          formatNumber(entry.metrics.collectedCount),
          entry.metrics.wantedRatio != null
            ? entry.metrics.wantedRatio.toFixed(3)
            : "—",
          entry.metrics.rating != null ? entry.metrics.rating.toFixed(2) : "—",
          formatNumber(entry.metrics.forSaleCount),
          entry.score.toFixed(3),
        ].map((value) => `<td>${value ?? "—"}</td>`);
        return `<tr${highlight ? ' class="is-best"' : ""}>${cells.join("")}</tr>`;
      })
      .join("");

    container.innerHTML = `
      <details open>
        <summary>Release desirability scores</summary>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>ID</th>
              <th>Median $</th>
              <th>Wanted</th>
              <th>Collected</th>
              <th>Wanted/Collected</th>
              <th>Rating</th>
              <th>For Sale</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </details>
    `;
  }

  function ensureDebugPanel() {
    if (!CONFIG.showDebugPanel) return null;

    let panel = document.getElementById(CONFIG.debugPanelId);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = CONFIG.debugPanelId;
    panel.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      max-width: 420px;
      max-height: 60vh;
      overflow: auto;
      background: rgba(17, 24, 39, 0.95);
      color: #f3f4f6;
      padding: 12px;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      font-size: 12px;
      z-index: 99999;
    `;

    panel.innerHTML = "<em>Collecting desirability metrics…</em>";
    document.body.appendChild(panel);

    const styleId = `${CONFIG.debugPanelId}-styles`;
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        #${CONFIG.debugPanelId} table {
          width: 100%;
          border-collapse: collapse;
        }
        #${CONFIG.debugPanelId} th,
        #${CONFIG.debugPanelId} td {
          padding: 4px 6px;
          text-align: left;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        #${CONFIG.debugPanelId} tr.is-best {
          background: rgba(46, 125, 50, 0.25);
        }
        .${CONFIG.scorePillClass} {
          margin-left: 6px;
          padding: 2px 6px;
          background: rgba(25, 118, 210, 0.15);
          color: #0d47a1;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.3px;
        }
      `;
      document.head.appendChild(style);
    }

    return panel;
  }

  function formatNumber(value, prefix = "") {
    if (value == null || Number.isNaN(value)) return "—";
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) return "—";
    return prefix ? `${prefix}${num.toFixed(2)}` : num.toLocaleString();
  }

  function buildMetricsTooltip(metrics) {
    const lines = [
      [`Median Price`, metrics.medianPrice != null ? `$${metrics.medianPrice}` : "—"],
      [`Lowest Price`, metrics.lowestPrice != null ? `$${metrics.lowestPrice}` : "—"],
      [`Highest Price`, metrics.highestPrice != null ? `$${metrics.highestPrice}` : "—"],
      [`Wanted`, metrics.wantedCount ?? "—"],
      [`Collected`, metrics.collectedCount ?? "—"],
      [
        `Wanted / Collected`,
        metrics.wantedRatio != null ? metrics.wantedRatio.toFixed(3) : "—",
      ],
      [`Rating`, metrics.rating != null ? metrics.rating.toFixed(2) : "—"],
      [`For Sale`, metrics.forSaleCount ?? "—"],
    ];

    return lines.map((line) => `${line[0]}: ${line[1]}`).join("\n");
  }

  function metricsArePopulated(metrics) {
    const hasRequired = REQUIRED_KEYS.every((key) => {
      const value = metrics[key];
      return value != null && Number.isFinite(value);
    });

    const hasAnyOptional = METRIC_KEYS.some((key) => {
      const value = metrics[key];
      return value != null && Number.isFinite(value);
    });

    return hasRequired && hasAnyOptional;
  }

  function metricsAreStable(previous, current) {
    return METRIC_KEYS.every((key) => {
      const prevValue = previous[key];
      const currValue = current[key];

      if (prevValue == null && currValue == null) return true;
      if (prevValue == null || currValue == null) return false;

      const tolerance = METRIC_TOLERANCES[key] ?? 0.01;
      return Math.abs(prevValue - currValue) <= tolerance;
    });
  }

  function highlightBest(rows, best) {
    rows.forEach((row) => {
      row.classList.remove(CONFIG.highlightClass);
      row.removeAttribute("data-best-release-score");
      const badge = row.querySelector(`.${CONFIG.badgeClass}`);
      if (badge) badge.remove();
    });

    if (!best) return;

    best.row.classList.add(CONFIG.highlightClass);
    best.row.setAttribute("data-best-release-score", best.score.toFixed(4));

    const titleCell = best.row.querySelector(SELECTORS.titleCell);
    if (!titleCell) return;

    const badge = document.createElement("span");
    badge.className = CONFIG.badgeClass;
    badge.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
      ${CONFIG.badgeText}
    `;

    titleCell.appendChild(badge);
  }

  let initialAnalysisDone = false;

  async function scheduleAutoAnalysis() {
    if (initialAnalysisDone) return;
    try {
      await waitForElement(SELECTORS.rows);
      if (initialAnalysisDone) return;
      initialAnalysisDone = true;
      await analyze(null, { auto: true });
    } catch (error) {
      console.warn("Discogs desirability highlighter: auto analysis failed", error);
    }
  }

  async function init() {
    injectStyles();

    try {
      await waitForElement(SELECTORS.table);
      injectAnalyzeButton();
      setInterval(injectAnalyzeButton, CONFIG.recheckIntervalMs);
      scheduleAutoAnalysis();
    } catch (error) {
      console.warn("Discogs desirability highlighter: table not found", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
