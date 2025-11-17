// ==UserScript==
// @name         Discogs Feedback Helper - Fast
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Fast and efficient auto-fill positive feedback on Discogs order pages + payment reminders
// @author       rova_records
// @match        https://www.discogs.com/sell/order/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/discogs-feedback-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/discogs-feedback-helper.user.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function () {
  "use strict";

  /*************************************************************************
   * Configuration
   *************************************************************************/
  const FEEDBACKS = [
    "Wonderful buyer! Quick payment and pleasant to deal with. Thanks!",
    "Great transaction — fast payment and excellent communication. Recommended!",
    "Perfect buyer. Paid quickly and was easy to work with. Thank you!",
    "Excellent buyer — smooth transaction and fast payment. A+!",
    "Fantastic buyer! Fast payment and friendly communication. Pleasure to sell to.",
    "Fast payment and pleasant to deal with. Would gladly trade again!",
    "Top-notch buyer. Prompt payment and courteous communication. Thanks!",
    "A+ transaction — great communication and fast payment. Highly recommended!"
  ];

  // Reduced delays for faster execution
  const MIN_DELAY = 200;
  const MAX_DELAY = 400;

  let autoIntervalSeconds = 5;

  /*************************************************************************
   * Payment Reminder Configuration
   *************************************************************************/

  // Extract order data from the page
  function extractOrderData() {
    const data = {};

    // Order number from URL
    const orderMatch = window.location.pathname.match(/\/order\/(\d+-\d+)/);
    data.orderNumber = orderMatch ? orderMatch[1] : "Unknown";

    // Order status from page header
    const statusElement = document.querySelector('.order-status, h2, h1');
    data.status = statusElement ? statusElement.textContent.trim() : "";

    // Creation date - look for "Created:" label
    const pageText = document.body.innerText;
    const createdMatch = pageText.match(/Created:\s*([A-Za-z]+\s+\d+,\s+\d+\s+\d+:\d+\s+[AP]M)/i);
    if (createdMatch) {
      data.createdDate = new Date(createdMatch[1]);
      data.daysElapsed = Math.floor((Date.now() - data.createdDate.getTime()) / (1000 * 60 * 60 * 24));
    } else {
      // Fallback: try to find in timeline
      const timelineText = Array.from(document.querySelectorAll('*'))
        .find(el => el.textContent.includes('created the order'));
      if (timelineText) {
        const dateMatch = timelineText.textContent.match(/([A-Za-z]+\s+\d+,\s+\d+\s+\d+:\d+\s+[AP]M)/);
        if (dateMatch) {
          data.createdDate = new Date(dateMatch[1]);
          data.daysElapsed = Math.floor((Date.now() - data.createdDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      }
    }

    // Total amount - look for "Total" row
    const totalMatch = pageText.match(/Total\s+\$?([\d,]+\.?\d*)/);
    data.total = totalMatch ? `$${totalMatch[1]}` : "$0.00";

    // Items - find all release links and titles
    data.items = [];
    const itemLinks = document.querySelectorAll('a[href*="/release/"]');
    const seenItems = new Set();
    itemLinks.forEach(link => {
      const title = link.textContent.trim();
      // Avoid duplicates and empty strings
      if (title && title.length > 3 && !seenItems.has(title)) {
        seenItems.add(title);
        data.items.push(title);
      }
    });

    // Also try to get from media condition context
    if (data.items.length === 0) {
      const mediaCondElements = Array.from(document.querySelectorAll('*'))
        .filter(el => el.textContent.includes('Media Condition:'));
      mediaCondElements.forEach(el => {
        const prevText = el.previousElementSibling?.textContent.trim();
        if (prevText && prevText.length > 5) {
          data.items.push(prevText);
        }
      });
    }

    // Buyer info - find username and email
    const buyerLinks = document.querySelectorAll('a[href*="/user/"]');
    if (buyerLinks.length > 0) {
      // Usually the buyer is one of the user links
      data.buyerName = buyerLinks[0].textContent.trim();
    } else {
      data.buyerName = "Customer";
    }

    const emailMatch = pageText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    data.buyerEmail = emailMatch ? emailMatch[1] : "";

    // If we couldn't parse date, set to 0 days
    if (!data.daysElapsed && data.daysElapsed !== 0) {
      data.daysElapsed = 0;
    }

    return data;
  }

  // Generate email based on days elapsed
  function generatePaymentEmail(orderData) {
    const { orderNumber, total, items, buyerName, daysElapsed } = orderData;
    const itemList = items.length > 0 ? items.map(item => `  • ${item}`).join('\n') : '  (See order details)';

    let subject, body;

    if (daysElapsed >= 3) {
      // Urgent notice for day 3+
      subject = `URGENT: Payment Required - Order #${orderNumber} Will Be Cancelled`;
      body = `Hi ${buyerName},

This is an urgent notice regarding your unpaid order #${orderNumber}.

Order Details:
• Order #: ${orderNumber}
• Total: ${total}
• Days since order: ${daysElapsed}
• Items:
${itemList}

Your order will be cancelled if payment is not received soon. Please complete payment immediately to avoid cancellation.

If you have any questions or concerns, please let me know.

Best regards`;
    } else {
      // Friendly reminder for days 1-2
      subject = `Payment Reminder - Order #${orderNumber}`;
      body = `Hi ${buyerName},

I hope this message finds you well! I wanted to send a friendly reminder that your invoice for Order #${orderNumber} is still pending payment.

Order Details:
• Order #: ${orderNumber}
• Total: ${total}
• Items:
${itemList}

If you've already sent payment, please disregard this message. Otherwise, please complete your payment at your earliest convenience.

Thank you for your purchase!

Best regards`;
    }

    return `Subject: ${subject}\n\n${body}`;
  }

  // Copy text to clipboard
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
      }
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  }

  /*************************************************************************
   * Utility helpers
   *************************************************************************/
  function randDelay(min = MIN_DELAY, max = MAX_DELAY) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Much faster element waiting using MutationObserver
  function waitForSelector(selector, timeout = 3000) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // Simplified click
  function fastClick(el) {
    if (!el) return;
    el.click();
  }

  /*************************************************************************
   * Core automation - streamlined and faster
   *************************************************************************/
  async function sendFeedbackWithText(text) {
    try {
      // 1) Find and click feedback link
      const feedbackLink = document.querySelector("a.send-feedback-link") ||
                          await waitForSelector("a.send-feedback-link", 2000);

      if (!feedbackLink) {
        showToast("Feedback link not found", 2000);
        return false;
      }

      fastClick(feedbackLink);
      await wait(randDelay(150, 300));

      // 2) Wait for modal and select positive
      const textarea = await waitForSelector("textarea.send-feedback-comment-field", 2000);
      if (!textarea) {
        showToast("Modal not found", 2000);
        return false;
      }

      // Click positive rating - try multiple selectors quickly
      const positiveLabel = document.querySelector("label.send-feedback-button-positive");
      const positiveInput = document.querySelector("input#feedback-rating-positive-field");

      if (positiveLabel) {
        fastClick(positiveLabel);
      } else if (positiveInput) {
        positiveInput.checked = true;
        positiveInput.dispatchEvent(new Event("change", { bubbles: true }));
      }

      await wait(randDelay(100, 200));

      // 3) Fill textarea
      textarea.value = text;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));

      await wait(randDelay(150, 250));

      // 4) Find and click submit button
      const submitBtn = document.querySelector('button[type="submit"].button-green') ||
                       document.querySelector('button.button-green[type="submit"]') ||
                       Array.from(document.querySelectorAll('button[type="submit"]'))
                         .find(b => b.textContent.toLowerCase().includes("send"));

      if (!submitBtn) {
        showToast("Submit button not found", 2000);
        return false;
      }

      await wait(randDelay(100, 200));
      fastClick(submitBtn);

      showToast("✓ Feedback sent", 2000);
      return true;

    } catch (error) {
      showToast("Error: " + error.message, 3000);
      return false;
    }
  }

  /*************************************************************************
   * UI - Compact and clean
   *************************************************************************/
  let autoRunning = false;
  let autoTimer = null;

  function createControlUI() {
    if (document.getElementById("discogs-feedback-helper")) return;

    const container = document.createElement("div");
    container.id = "discogs-feedback-helper";
    Object.assign(container.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      width: "240px",
      zIndex: 999999,
      fontFamily: "system-ui, -apple-system, sans-serif",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      borderRadius: "10px",
      overflow: "hidden",
      border: "1px solid #ddd"
    });

    // Header
    const header = document.createElement("div");
    header.textContent = "📬 Feedback Helper";
    Object.assign(header.style, {
      padding: "10px 14px",
      background: "linear-gradient(135deg, #667eea, #764ba2)",
      color: "white",
      fontWeight: "600",
      cursor: "pointer",
      userSelect: "none",
      fontSize: "14px"
    });

    // Content
    const content = document.createElement("div");
    Object.assign(content.style, {
      background: "white",
      padding: "12px",
      display: "grid",
      gap: "8px"
    });

    // Buttons
    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, { display: "flex", gap: "8px" });

    const sendOneBtn = createButton("Send One", async () => {
      sendOneBtn.disabled = true;
      sendOneBtn.textContent = "Sending...";
      const text = FEEDBACKS[Math.floor(Math.random() * FEEDBACKS.length)];
      await sendFeedbackWithText(text);
      sendOneBtn.disabled = false;
      sendOneBtn.textContent = "Send One";
    });

    const toggleAutoBtn = createButton("Start Auto", () => {
      autoRunning = !autoRunning;
      if (autoRunning) {
        toggleAutoBtn.textContent = "Stop Auto";
        toggleAutoBtn.style.background = "#ef4444";
        toggleAutoBtn.style.color = "white";
        startAutoRun();
      } else {
        toggleAutoBtn.textContent = "Start Auto";
        toggleAutoBtn.style.background = "#10b981";
        toggleAutoBtn.style.color = "white";
        stopAutoRun();
      }
    });
    toggleAutoBtn.style.background = "#10b981";
    toggleAutoBtn.style.color = "white";

    btnRow.appendChild(sendOneBtn);
    btnRow.appendChild(toggleAutoBtn);

    // Interval control
    const intervalRow = document.createElement("div");
    Object.assign(intervalRow.style, { display: "flex", gap: "6px", alignItems: "center", fontSize: "12px" });

    const intervalLabel = document.createElement("span");
    intervalLabel.textContent = "Interval:";
    Object.assign(intervalLabel.style, { color: "#666" });

    const intervalInput = document.createElement("input");
    intervalInput.type = "number";
    intervalInput.value = autoIntervalSeconds;
    intervalInput.min = "3";
    intervalInput.max = "60";
    Object.assign(intervalInput.style, {
      width: "50px",
      padding: "4px 6px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      fontSize: "12px"
    });
    intervalInput.onchange = () => {
      autoIntervalSeconds = Math.max(3, parseInt(intervalInput.value) || 5);
      intervalInput.value = autoIntervalSeconds;
    };

    const secLabel = document.createElement("span");
    secLabel.textContent = "seconds";
    Object.assign(secLabel.style, { color: "#666" });

    intervalRow.appendChild(intervalLabel);
    intervalRow.appendChild(intervalInput);
    intervalRow.appendChild(secLabel);

    // Status
    const status = document.createElement("div");
    status.id = "feedback-status";
    Object.assign(status.style, {
      fontSize: "11px",
      color: "#888",
      padding: "6px 8px",
      background: "#f9f9f9",
      borderRadius: "4px",
      textAlign: "center"
    });
    status.textContent = "Ready";

    content.appendChild(btnRow);
    content.appendChild(intervalRow);
    content.appendChild(status);

    // Collapse behavior
    let collapsed = false;
    header.addEventListener("click", () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? "none" : "grid";
    });

    container.appendChild(header);
    container.appendChild(content);
    document.body.appendChild(container);
  }

  function createButton(text, onClick) {
    const btn = document.createElement("button");
    btn.textContent = text;
    Object.assign(btn.style, {
      flex: "1",
      padding: "8px 12px",
      borderRadius: "6px",
      border: "none",
      cursor: "pointer",
      fontWeight: "600",
      fontSize: "13px",
      background: "#f3f4f6",
      color: "#1f2937",
      transition: "all 0.2s"
    });
    btn.onclick = onClick;
    btn.onmouseover = () => btn.style.background = "#e5e7eb";
    btn.onmouseout = () => btn.style.background = "#f3f4f6";
    return btn;
  }

  function showToast(msg, ttl = 2000) {
    const existing = document.getElementById("feedback-toast");
    if (existing) existing.remove();

    const t = document.createElement("div");
    t.id = "feedback-toast";
    Object.assign(t.style, {
      position: "fixed",
      right: "20px",
      bottom: "280px",
      background: "rgba(0,0,0,0.9)",
      color: "white",
      padding: "10px 16px",
      borderRadius: "8px",
      zIndex: 1000000,
      fontSize: "13px",
      fontWeight: "500",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
    });
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ttl);

    // Update status
    const status = document.getElementById("feedback-status");
    if (status) status.textContent = msg;
  }

  /*************************************************************************
   * Payment Reminder UI
   *************************************************************************/
  function createPaymentReminderUI(orderData) {
    // Don't create if already exists
    if (document.getElementById("payment-reminder-box")) return;

    const { daysElapsed, orderNumber } = orderData;
    const isUrgent = daysElapsed >= 3;

    const container = document.createElement("div");
    container.id = "payment-reminder-box";
    Object.assign(container.style, {
      position: "fixed",
      right: "20px",
      bottom: "320px", // Above feedback helper
      width: "240px",
      zIndex: 999998,
      fontFamily: "system-ui, -apple-system, sans-serif",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      borderRadius: "10px",
      overflow: "hidden",
      border: isUrgent ? "2px solid #ef4444" : "1px solid #ddd"
    });

    // Header
    const header = document.createElement("div");
    header.textContent = isUrgent ? "⚠️ Payment Overdue" : "💰 Payment Pending";
    Object.assign(header.style, {
      padding: "10px 14px",
      background: isUrgent
        ? "linear-gradient(135deg, #ef4444, #dc2626)"
        : "linear-gradient(135deg, #f59e0b, #d97706)",
      color: "white",
      fontWeight: "600",
      cursor: "pointer",
      userSelect: "none",
      fontSize: "14px"
    });

    // Content
    const content = document.createElement("div");
    Object.assign(content.style, {
      background: "white",
      padding: "12px",
      display: "grid",
      gap: "8px"
    });

    // Info text
    const infoText = document.createElement("div");
    Object.assign(infoText.style, {
      fontSize: "12px",
      color: "#666",
      lineHeight: "1.4"
    });
    infoText.innerHTML = `Order <strong>#${orderNumber}</strong><br>Unpaid for <strong>${daysElapsed} day${daysElapsed !== 1 ? 's' : ''}</strong>`;

    // Copy button
    const copyBtn = document.createElement("button");
    copyBtn.textContent = isUrgent ? "Copy Urgent Email" : "Copy Reminder Email";
    Object.assign(copyBtn.style, {
      padding: "10px 12px",
      borderRadius: "6px",
      border: "none",
      cursor: "pointer",
      fontWeight: "600",
      fontSize: "13px",
      background: isUrgent ? "#ef4444" : "#f59e0b",
      color: "white",
      transition: "all 0.2s"
    });

    copyBtn.onclick = async () => {
      copyBtn.disabled = true;
      copyBtn.textContent = "Copying...";

      const email = generatePaymentEmail(orderData);
      const success = await copyToClipboard(email);

      if (success) {
        showToast("✓ Email copied to clipboard!", 2500);
        copyBtn.textContent = "✓ Copied!";
        setTimeout(() => {
          copyBtn.textContent = isUrgent ? "Copy Urgent Email" : "Copy Reminder Email";
          copyBtn.disabled = false;
        }, 2000);
      } else {
        showToast("Failed to copy email", 2000);
        copyBtn.textContent = "Try Again";
        copyBtn.disabled = false;
      }
    };

    copyBtn.onmouseover = () => {
      copyBtn.style.opacity = "0.9";
    };
    copyBtn.onmouseout = () => {
      copyBtn.style.opacity = "1";
    };

    // Preview button
    const previewBtn = document.createElement("button");
    previewBtn.textContent = "Preview Email";
    Object.assign(previewBtn.style, {
      padding: "6px 10px",
      borderRadius: "6px",
      border: "1px solid #ddd",
      cursor: "pointer",
      fontWeight: "500",
      fontSize: "12px",
      background: "#f9f9f9",
      color: "#333",
      transition: "all 0.2s"
    });

    previewBtn.onclick = () => {
      const email = generatePaymentEmail(orderData);
      alert(email);
    };

    previewBtn.onmouseover = () => previewBtn.style.background = "#e5e5e5";
    previewBtn.onmouseout = () => previewBtn.style.background = "#f9f9f9";

    content.appendChild(infoText);
    content.appendChild(copyBtn);
    content.appendChild(previewBtn);

    // Collapse behavior
    let collapsed = false;
    header.addEventListener("click", () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? "none" : "grid";
    });

    container.appendChild(header);
    container.appendChild(content);
    document.body.appendChild(container);
  }

  /*************************************************************************
   * Auto-run logic
   *************************************************************************/
  let autoCount = 0;

  async function startAutoRun() {
    autoCount = 0;
    const status = document.getElementById("feedback-status");

    if (autoTimer) clearInterval(autoTimer);

    autoTimer = setInterval(async () => {
      autoCount++;
      if (status) status.textContent = `Running... (${autoCount} sent)`;

      const text = FEEDBACKS[Math.floor(Math.random() * FEEDBACKS.length)];
      await sendFeedbackWithText(text);
    }, autoIntervalSeconds * 1000);

    showToast("Auto-run started", 2000);
  }

  function stopAutoRun() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    const status = document.getElementById("feedback-status");
    if (status) status.textContent = `Stopped (${autoCount} sent)`;
    showToast("Auto-run stopped", 2000);
  }

  /*************************************************************************
   * Initialize
   *************************************************************************/
  function init() {
    // Wait a bit for page to stabilize
    setTimeout(() => {
      createControlUI();

      // Check for unpaid orders and show payment reminder
      const orderData = extractOrderData();

      // Show payment reminder if:
      // 1. Order has been created (has a valid date)
      // 2. Order is 1+ days old
      // 3. Order appears to be unpaid (status contains "Invoice" or similar)
      if (orderData.daysElapsed >= 1) {
        const pageText = document.body.textContent.toLowerCase();
        const isUnpaid = pageText.includes('invoice sent') ||
                        pageText.includes('awaiting payment') ||
                        pageText.includes('pending payment') ||
                        (orderData.status && orderData.status.toLowerCase().includes('invoice'));

        if (isUnpaid) {
          createPaymentReminderUI(orderData);
        }
      }

      // Check if feedback link is available
      const link = document.querySelector("a.send-feedback-link");
      if (link) {
        showToast("Feedback available!", 2000);
      }
    }, 500);
  }

  // Start when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
