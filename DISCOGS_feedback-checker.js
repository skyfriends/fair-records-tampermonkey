// ==UserScript==
// @name         Discogs Feedback Checker v2.1
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Simple red/green feedback indicator with tracking number links
// @author       rova_records
// @match        https://www.discogs.com/sell/orders*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      discogs.com
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_feedback-checker.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_feedback-checker.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function () {
  "use strict";

  // Only run on archived orders page
  if (!window.location.href.includes("archived=Y")) {
    return;
  }

  // Simple styles - just red/green backgrounds
  GM_addStyle(`
    /* Simple feedback status indicators */
    tr.feedback-exists {
      background-color: #c8e6c9 !important; /* Light green */
    }

    tr.feedback-missing {
      background-color: #ffcdd2 !important; /* Light red */
    }

    tr.feedback-checking {
      background-color: #fff3e0 !important; /* Light orange while checking */
    }

    /* Tracking number styles */
    .tracking-number {
      display: inline-block;
      margin-left: 8px;
      padding: 2px 6px;
      background: #e3f2fd;
      border: 1px solid #2196f3;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      color: #1976d2;
      text-decoration: none;
      transition: all 0.2s ease;
    }

    .tracking-number:hover {
      background: #2196f3;
      color: white;
      text-decoration: none;
    }

    .tracking-number:before {
      content: "📦 ";
      margin-right: 2px;
    }

    /* Refetch button styles */
    .feedback-refetch-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ff9800, #f57c00);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 16px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
      z-index: 10000;
      transition: all 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .feedback-refetch-btn:hover:not([disabled]) {
      background: linear-gradient(135deg, #f57c00, #ef6c00);
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(255, 152, 0, 0.4);
    }

    .feedback-refetch-btn[disabled] {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .feedback-refetch-btn:before {
      content: "🔄 ";
      margin-right: 4px;
    }
  `);

  // Cache Manager - simplified from original
  class CacheManager {
    constructor() {
      this.storageKey = "simple_feedback_cache";
      this.maxAge = 24 * 60 * 60 * 1000; // 24 hours
    }

    get(orderId) {
      const cache = this.loadCache();
      const data = cache[orderId];
      if (data && !this.isExpired(data)) {
        return data;
      }
      return null;
    }

    set(orderId, data) {
      const cache = this.loadCache();
      cache[orderId] = {
        ...data,
        timestamp: Date.now(),
      };
      this.saveCache(cache);
    }

    isExpired(data) {
      return Date.now() - data.timestamp > this.maxAge;
    }

    loadCache() {
      try {
        const data = localStorage.getItem(this.storageKey);
        return data ? JSON.parse(data) : {};
      } catch (e) {
        return {};
      }
    }

    saveCache(cache) {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(cache));
      } catch (e) {
        console.error("Cache save error:", e);
      }
    }

    clearCache() {
      try {
        localStorage.removeItem(this.storageKey);
        console.log("Cache cleared");
      } catch (e) {
        console.error("Cache clear error:", e);
      }
    }
  }

  // API Manager - from original
  class APIManager {
    constructor() {
      this.requestDelay = 300;
      this.lastRequest = 0;
    }

    async makeRequest(url) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequest;
      if (timeSinceLastRequest < this.requestDelay) {
        await this.delay(this.requestDelay - timeSinceLastRequest);
      }
      this.lastRequest = Date.now();

      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          timeout: 10000,
          onload: resolve,
          onerror: reject,
          ontimeout: () => reject(new Error("Request timeout"))
        });
      });
    }

    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  // Feedback and Tracking Checker
  class FeedbackChecker {
    constructor(api) {
      this.api = api;
    }

    async check(orderUrl) {
      try {
        const response = await this.api.makeRequest(orderUrl);
        const doc = new DOMParser().parseFromString(response.responseText, "text/html");
        const feedback = this.extractFeedback(doc);
        const tracking = this.extractTracking(doc);
        return { ...feedback, tracking };
      } catch (error) {
        console.error("Feedback check error:", error);
        return { exists: false, error: true, tracking: null };
      }
    }

    extractTracking(doc) {
      // Look for tracking numbers in messages
      const messageElements = doc.querySelectorAll('.message-content, .message-text, .order-message, [class*="message"]');
      
      for (const messageEl of messageElements) {
        const messageText = messageEl.textContent || '';
        
        // Common tracking number patterns
        const trackingPatterns = [
          // USPS
          /\b(9[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{2})\b/g,
          /\b(94[0-9]{20})\b/g,
          /\b(93[0-9]{20})\b/g,
          /\b(92[0-9]{20})\b/g,
          /\b(91[0-9]{20})\b/g,
          // UPS
          /\b(1Z[0-9A-Z]{16})\b/g,
          // FedEx
          /\b([0-9]{12})\b/g,
          /\b([0-9]{14})\b/g,
          // DHL
          /\b([0-9]{10,11})\b/g,
          // Generic long numbers that could be tracking
          /\b([0-9]{15,25})\b/g
        ];
        
        for (const pattern of trackingPatterns) {
          const matches = messageText.match(pattern);
          if (matches) {
            // Return the first match, cleaned up
            const trackingNumber = matches[0].replace(/\s+/g, '');
            return {
              number: trackingNumber,
              carrier: this.detectCarrier(trackingNumber)
            };
          }
        }
      }
      
      return null;
    }

    detectCarrier(trackingNumber) {
      // Detect carrier based on tracking number format
      if (trackingNumber.startsWith('1Z')) return 'UPS';
      if (trackingNumber.startsWith('9')) return 'USPS';
      if (trackingNumber.length === 12 || trackingNumber.length === 14) return 'FedEx';
      if (trackingNumber.length >= 10 && trackingNumber.length <= 11) return 'DHL';
      return 'Unknown';
    }

    getTrackingUrl(trackingNumber, carrier) {
      switch (carrier) {
        case 'UPS':
          return `https://www.ups.com/track?track=yes&trackNums=${trackingNumber}`;
        case 'USPS':
          return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
        case 'FedEx':
          return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
        case 'DHL':
          return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${trackingNumber}`;
        default:
          return `https://www.google.com/search?q=track+package+${trackingNumber}`;
      }
    }

    extractFeedback(doc) {
      // Look for feedback in seller section
      const sellerSections = doc.querySelectorAll(".box-card-content, .box-card, .order-info-box");

      for (const section of sellerSections) {
        // Check if this is the seller info section
        const sellerLink = section.querySelector('a[href*="/seller/"], .seller-info');
        if (!sellerLink) continue;

        // Look for feedback components
        const feedbackSelectors = [
          ".user-feedback-component",
          ".feedback-details",
          ".feedback-component",
          ".rating-and-feedback",
          '[class*="feedback"]',
        ];

        for (const selector of feedbackSelectors) {
          const feedbackEl = section.querySelector(selector);
          if (feedbackEl) {
            const result = this.parseFeedbackElement(feedbackEl);
            if (result.exists) return result;
          }
        }
      }

      return { exists: false };
    }

    parseFeedbackElement(element) {
      const result = {
        exists: false,
        text: "",
        sentiment: "positive",
        date: "",
      };

      // Check for feedback text
      const textSelectors = [
        ".feedback-comment-text",
        ".feedback-text",
        ".comment-text",
        ".feedback-message",
      ];

      for (const selector of textSelectors) {
        const textEl = element.querySelector(selector);
        if (textEl && textEl.textContent.trim()) {
          result.exists = true;
          result.text = textEl.textContent.trim();
          break;
        }
      }

      return result;
    }
  }

  // Order Manager - simplified from original
  class OrderManager {
    constructor() {
      this.cache = new CacheManager();
      this.api = new APIManager();
      this.feedbackChecker = new FeedbackChecker(this.api);
      this.queue = [];
      this.isProcessing = false;
    }

    // Use EXACT selectors from original
    getOrderRows() {
      return Array.from(document.querySelectorAll("tr.shortcut_navigable"));
    }

    getOrderId(row) {
      const link = row.querySelector("td.order_number a");
      return link ? link.textContent.trim() : null;
    }

    getOrderUrl(row) {
      const link = row.querySelector("td.order_number a");
      return link ? link.href : null;
    }

    async scanOrders() {
      const rows = this.getOrderRows();
      console.log(`Found ${rows.length} order rows`);

      for (const row of rows) {
        const orderId = this.getOrderId(row);
        if (!orderId) continue;

        const cachedData = this.cache.get(orderId);

        if (cachedData) {
          // Use cached data
          this.updateRowStatus(row, cachedData.feedback.exists, cachedData.feedback.tracking);
        } else {
          // Add to queue for checking
          this.queue.push({ row, orderId });
        }
      }

      // Process queue
      if (this.queue.length > 0) {
        await this.processQueue();
      }
    }

    async processQueue() {
      if (this.isProcessing) return;
      this.isProcessing = true;

      console.log(`Processing ${this.queue.length} orders...`);

      for (const item of this.queue) {
        await this.processOrder(item.row, item.orderId);
      }

      this.queue = [];
      this.isProcessing = false;
    }

    async processOrder(row, orderId) {
      const orderUrl = this.getOrderUrl(row);
      if (!orderUrl) return;

      try {
        row.classList.add('feedback-checking');

        // Check feedback and tracking
        const result = await this.feedbackChecker.check(orderUrl);

        const data = {
          orderId,
          feedback: result,
          timestamp: Date.now(),
        };

        // Save to cache
        this.cache.set(orderId, data);

        // Update UI
        this.updateRowStatus(row, result.exists, result.tracking);

      } catch (error) {
        console.error("Error processing order:", orderId, error);
        row.classList.remove('feedback-checking');
      }
    }

    updateRowStatus(row, hasFeedback, tracking) {
      row.classList.remove('feedback-exists', 'feedback-missing', 'feedback-checking');

      if (hasFeedback === true) {
        row.classList.add('feedback-exists');
      } else if (hasFeedback === false) {
        row.classList.add('feedback-missing');
      }

      // Add tracking number if available
      if (tracking && tracking.number) {
        this.injectTrackingNumber(row, tracking);
      }
    }

    injectTrackingNumber(row, tracking) {
      // Find the order number cell to inject the tracking link
      const orderNumberCell = row.querySelector('td.order_number');
      if (!orderNumberCell) return;

      // Check if tracking link already exists
      const existingLink = orderNumberCell.querySelector('.tracking-number');
      if (existingLink) {
        existingLink.remove();
      }

      // Create tracking link
      const trackingLink = document.createElement('a');
      trackingLink.className = 'tracking-number';
      trackingLink.href = this.feedbackChecker.getTrackingUrl(tracking.number, tracking.carrier);
      trackingLink.target = '_blank';
      trackingLink.title = `Track with ${tracking.carrier}: ${tracking.number}`;
      trackingLink.textContent = tracking.number;

      // Append to the order number cell
      orderNumberCell.appendChild(trackingLink);
    }

    async init() {
      console.log("Simple Feedback Checker initializing...");
      this.createRefetchButton();
      await this.scanOrders();
    }

    createRefetchButton() {
      // Check if button already exists
      if (document.querySelector('.feedback-refetch-btn')) return;

      const button = document.createElement('button');
      button.className = 'feedback-refetch-btn';
      button.textContent = 'Refetch Feedback & Tracking';
      button.title = 'Clear cache and refetch all feedback and tracking data';
      
      button.addEventListener('click', () => this.handleRefetch(button));
      document.body.appendChild(button);
    }

    async handleRefetch(button) {
      if (this.isProcessing) return;

      try {
        // Update button state
        button.disabled = true;
        button.textContent = 'Refetching...';

        // Clear cache
        this.cache.clearCache();

        // Clear existing visual indicators
        this.clearExistingIndicators();

        // Refetch all data
        await this.scanOrders();

        // Reset button
        button.textContent = 'Refetch Complete!';
        setTimeout(() => {
          button.textContent = 'Refetch Feedback & Tracking';
          button.disabled = false;
        }, 2000);

      } catch (error) {
        console.error('Refetch error:', error);
        button.textContent = 'Refetch Failed';
        setTimeout(() => {
          button.textContent = 'Refetch Feedback & Tracking';
          button.disabled = false;
        }, 2000);
      }
    }

    clearExistingIndicators() {
      // Remove all feedback status classes
      const rows = this.getOrderRows();
      rows.forEach(row => {
        row.classList.remove('feedback-exists', 'feedback-missing', 'feedback-checking');
        
        // Remove existing tracking links
        const trackingLinks = row.querySelectorAll('.tracking-number');
        trackingLinks.forEach(link => link.remove());
      });
    }
  }

  // Initialize when DOM is ready - EXACT from original
  function init() {
    window.orderManager = new OrderManager();
    window.orderManager.init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
