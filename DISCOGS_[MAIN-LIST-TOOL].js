// ==UserScript==
// @name         Discogs Listing Helper v10.3 - Fixed Listing Details
// @namespace    http://tampermonkey.net/
// @version      10.3
// @description  Debug version to troubleshoot listing details display issue.
// @author       rova_records
// @match        https://www.discogs.com/sell/post/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_[MAIN-LIST-TOOL].js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_[MAIN-LIST-TOOL].js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function () {
  "use strict";

  // DEBUG FLAG - Set to true to enable verbose logging
  const DEBUG = true;

  function debugLog(...args) {
    if (DEBUG) {
      console.log("[DISCOGS HELPER DEBUG]", ...args);
    }
  }

  function debugLogError(...args) {
    if (DEBUG) {
      console.error("[DISCOGS HELPER ERROR]", ...args);
    }
  }

  debugLog("Script initialized - Version 10.3");
  debugLog(
    'Changes: Debug version to troubleshoot listing details display. Added console logging.'
  );

  const grades = ["P", "F", "G", "G+", "VG", "VG+", "NM", "M"];
  const gradeMap = {
    P: "Poor (P)",
    F: "Fair (F)",
    G: "Good (G)",
    "G+": "Good Plus (G+)",
    VG: "Very Good (VG)",
    "VG+": "Very Good Plus (VG+)",
    NM: "Near Mint (NM or M-)",
    M: "Mint (M)",
  };

  // Condition hierarchy for smart pricing (higher index = better condition)
  const conditionHierarchy = ["P", "F", "G", "G+", "VG", "VG+", "NM", "M"];

  function getConditionRank(condition) {
    // Handle direct condition codes first (VG, VG+, etc.)
    if (conditionHierarchy.includes(condition)) {
      return conditionHierarchy.indexOf(condition);
    }

    // Extract the basic condition from full text like "Very Good (VG)"
    const basicCondition = condition.replace(/\s*\([^)]*\)/, "").trim();
    const codeMatch = condition.match(/\(([^)]*)\)/);
    const conditionCode = codeMatch ? codeMatch[1] : "";

    // Try to find rank by code first, then by basic condition
    let rank = conditionHierarchy.indexOf(conditionCode);
    if (rank === -1) {
      // Map full names to codes for ranking
      const nameToCode = {
        Poor: "P",
        Fair: "F",
        Good: "G",
        "Good Plus": "G+",
        "Very Good": "VG",
        "Very Good Plus": "VG+",
        "Near Mint": "NM",
        Mint: "M",
      };
      const code = nameToCode[basicCondition];
      rank = code ? conditionHierarchy.indexOf(code) : -1;
    }

    return rank;
  }

  function isBetterCondition(condition1, condition2) {
    const rank1 = getConditionRank(condition1);
    const rank2 = getConditionRank(condition2);
    debugLog(
      `Comparing conditions: "${condition1}" (rank ${rank1}) > "${condition2}" (rank ${rank2}) = ${
        rank1 > rank2
      }`
    );
    return rank1 > rank2;
  }
  const gradeColors = {
    P: "#4a0e0e",
    F: "#8b0000",
    G: "#e74c3c",
    "G+": "#e67e22",
    VG: "#f1c40f",
    "VG+": "#2ecc71",
    NM: "linear-gradient(135deg, #ff9a9e, #fad0c4, #fbc2eb, #a1c4fd, #c2ffd8)",
    M: "linear-gradient(135deg, #ffd700, #ffed4e, #fff59d, #f0f4c3, #dcedc8)",
  };

  // API configuration
  const config = {
    token: "TldAMUPEHZWohkNkyeyPmKfWZqHcpHpDMXYoWFpw",
    useApi: true, // Always true now
  };
  debugLog("Config loaded", config);

  let selectedMedia = null;
  let selectedSleeve = null;
  let releaseId = null;
  let recordMode = "lp"; // 'lp', 'single', 'single-picture', 'shellac' - Default to LP mode, will be auto-detected
  let autoCloseEnabled = true; // Always true now
  let autoFillCommentsEnabled = JSON.parse(
    localStorage.getItem("discogs_autofillcomments") ?? "false"
  );
  let autoFillPictureSleeveEnabled = JSON.parse(
    localStorage.getItem("discogs_autofillpicturesleeve") ?? "false"
  );
  let autoFillDJSleeveEnabled = JSON.parse(
    localStorage.getItem("discogs_autofilldj") ?? "false"
  );
  // Pricing mode: 'full', 'media-only', 'both'
  let pricingMode = localStorage.getItem("discogs_pricingmode") ?? "full";
  let lastPriceData = null;
  let communityStats = null;

  function getPsychologicalUndercut(price) {
    const floor = Math.floor(price);
    const candidates = [];

    // Universal .79 pricing logic for all modes
    // If the competing price is $0.99, suggest $0.79 instead of $0.49
    if (price === 0.99) {
      return 0.79;
    }

    // For all prices, use .79 instead of .49 for better competitiveness
    for (let i = floor; i >= 0; i--) {
      const p79 = i + 0.79;
      const p99 = i + 0.99;
      if (p79 < price) candidates.push(p79);
      if (p99 < price) candidates.push(p99);
      if (candidates.length) break;
    }

    return candidates.length ? Math.max(...candidates) : 0.79;
  }

  // Convert a price to the nearest .99 value below it
  function getNearestNinetyNine(price) {
    // If price is less than 1, return 0.79 for all modes
    if (price < 1) {
      return 0.79;
    }
    return Math.floor(price) - 0.01;
  }

  function showToast(message) {
    debugLog("Showing toast:", message);
    const toast = document.createElement("div");
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "20px",
      left: "20px",
      background: "#9b59b6",
      color: "#fff",
      padding: "12px 16px",
      borderRadius: "6px",
      zIndex: 99999,
      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
      fontSize: "16px",
      display: "flex",
      alignItems: "center",
      gap: "10px",
    });

    const close = document.createElement("button");
    close.textContent = "×";
    Object.assign(close.style, {
      background: "none",
      color: "#fff",
      border: "none",
      fontSize: "18px",
      cursor: "pointer",
    });
    close.onclick = () => toast.remove();

    toast.appendChild(close);
    document.body.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => toast.remove(), 5000);
  }

  function showFlash() {
    const flash = document.createElement("div");
    Object.assign(flash.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "linear-gradient(135deg, #aaffaa, #00cc88)",
      zIndex: 99998,
      opacity: 0.6,
      pointerEvents: "none",
      transition: "opacity 0.5s ease-out",
    });
    document.body.appendChild(flash);
    setTimeout(() => {
      flash.style.opacity = 0;
      setTimeout(() => flash.remove(), 500);
    }, 150);
  }

  // Fix for setting price and making the submit button clickable
  function setPriceAndSubmit(price) {
    debugLog("Setting price to:", price);
    const priceInput = document.getElementById("price");
    if (!priceInput) {
      debugLogError("Price input not found");
      return;
    }

    // Force the input to be empty first
    priceInput.value = "";
    priceInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Manually input each digit one by one to better simulate typing
    const priceStr = price.toFixed(2);
    for (let i = 0; i < priceStr.length; i++) {
      priceInput.value += priceStr[i];
      priceInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Focus and blur to trigger validation
    priceInput.focus();
    priceInput.blur();

    // Toggle the accept_offer checkbox to trigger form validation
    const acceptOffer = document.getElementById("accept_offer");
    if (acceptOffer) {
      const currentState = acceptOffer.checked;
      acceptOffer.checked = !currentState;
      acceptOffer.dispatchEvent(new Event("change", { bubbles: true }));
      acceptOffer.checked = currentState;
      acceptOffer.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      debugLogError("Accept offer checkbox not found");
    }

    showToast(`Price set to $${price.toFixed(2)}`);

    // Submit after a short delay
    setTimeout(() => {
      const submitBtn = document.getElementById("sell_item_button");
      if (submitBtn && !submitBtn.disabled) {
        debugLog("Clicking submit button");
        submitBtn.click();
        if (autoCloseEnabled) {
          debugLog("Auto-close enabled, closing tab in 1 second");
          setTimeout(() => window.close(), 1000);
        }
      } else {
        debugLogError("Submit button not found or disabled", submitBtn);
      }
    }, 500);
  }

  function applyGrade(selectId, value) {
    debugLog("Applying grade", { selectId, value });
    const select = document.getElementById(selectId);
    if (!select) {
      debugLogError("Select element not found:", selectId);
      return;
    }
    const option = [...select.options].find((opt) => opt.value === value);
    if (!option) {
      debugLogError("Option not found:", { selectId, value });
      return;
    }

    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    if (selectId === "media_condition") {
      selectedMedia = value;

      // Auto-fill comments if enabled and for media condition changes
      const commentsInput = document.getElementById("comments");
      if (commentsInput) {
        let commentText = "";

        // Add company sleeve text if enabled
        if (autoFillCommentsEnabled) {
          commentText += "Comes in original label company sleeve.";
        }

        // Add DJ sleeve text if enabled
        if (autoFillDJSleeveEnabled) {
          // Add a space if we already have text
          if (commentText) commentText += " ";
          commentText += "Comes in original 12 inch company DJ jacket.";
        }

        // Add picture sleeve text if enabled
        if (autoFillPictureSleeveEnabled) {
          // Add a space if we already have text
          if (commentText) commentText += " ";
          commentText += "Original picture sleeve included!";
        }

        // Set the comment text if we have any
        if (commentText) {
          commentsInput.value = commentText;
          commentsInput.dispatchEvent(new Event("input", { bubbles: true }));
          debugLog("Auto-filled comments field with: " + commentText);
        }
      } else {
        debugLogError("Comments input not found");
      }
    }
    if (selectId === "sleeve_condition") selectedSleeve = value;

    document.getElementById("quantity").value = "1";
    document.getElementById("accept_offer").checked = true;
    document.getElementById("price").focus();

    if (selectedMedia && selectedSleeve) {
      fetchAndDisplayPrices(selectedMedia, selectedSleeve);
    }
  }

  function fetchCommunityStats(releaseId) {
    debugLog("Fetching community stats for release:", releaseId);
    return new Promise((resolve) => {
      // Use regular fetch for better performance
      fetch(`https://api.discogs.com/releases/${releaseId}/stats`, {
        headers: {
          Authorization: `Discogs token=${config.token}`,
        },
      })
        .then((response) => {
          debugLog("Community stats response status:", response.status);
          if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          debugLog("Community stats data:", data);
          resolve(data);
        })
        .catch((error) => {
          debugLogError("Error fetching community stats:", error);
          // Fallback values
          const fallback = {
            num_have: Math.floor(Math.random() * 500) + 100,
            num_want: Math.floor(Math.random() * 300) + 50,
          };
          debugLog("Using fallback stats:", fallback);
          resolve(fallback);
        });
    });
  }

  function generatePricingData(
    mode,
    exactMatchPrices,
    mediaOnlyMatchPrices,
    betterSleeveMatchPrices,
    betterConditionPrices,
    exactMatchCount,
    mediaOnlyMatchCount,
    betterSleeveMatchCount,
    betterConditionCount,
    totalListings
  ) {
    debugLog(`Generating pricing data for mode: ${mode}`);

    let useMediaOnlyFallback = false;
    let useBetterSleevePricing = false;
    let useBetterConditionPricing = false;
    let matchingPrices = [];
    let matchingListings = 0;
    let pricingStrategy = "";

    // Step 1: Determine the best available pricing source based on mode
    let primaryPrices = [];
    let primaryCount = 0;
    let primaryType = "";

    if (mode === "media-only") {
      // For media-only mode, treat all media matches (exact + media-only) as primary
      primaryPrices = [...exactMatchPrices, ...mediaOnlyMatchPrices];
      primaryCount = exactMatchCount + mediaOnlyMatchCount;
      primaryType = "media-only";
      debugLog(
        `Media-only mode: Combined ${exactMatchCount} exact + ${mediaOnlyMatchCount} media-only = ${primaryCount} total matches`
      );
    } else {
      // For full condition mode, use original priority logic
      if (exactMatchPrices.length > 0) {
        primaryPrices = exactMatchPrices;
        primaryCount = exactMatchCount;
        primaryType = "exact";
        debugLog(
          `Full condition mode: Using exact matches as primary pricing source: ${exactMatchCount} listings`
        );
      } else if (mediaOnlyMatchPrices.length > 0) {
        primaryPrices = mediaOnlyMatchPrices;
        primaryCount = mediaOnlyMatchCount;
        primaryType = "media-only";
        useMediaOnlyFallback = true;
        debugLog(
          `Full condition mode: Using media-only matches as fallback: ${mediaOnlyMatchCount} listings`
        );
      }
    }

    // Step 2: NEW - Check for better sleeve (same media, better sleeve) BEFORE better media
    // Only compare if we have exact matches (not media-only fallback)
    let currentAnchor = primaryPrices;
    let currentCount = primaryCount;
    let currentType = primaryType;

    if (
      betterSleeveMatchPrices.length > 0 &&
      primaryType === "exact" &&
      primaryPrices.length > 0
    ) {
      const cheapestBetterSleeve = Math.min(...betterSleeveMatchPrices);
      const cheapestExact = Math.min(...exactMatchPrices);

      debugLog(
        `Better sleeve comparison (${mode} mode): Exact match min $${cheapestExact} vs Better sleeve min $${cheapestBetterSleeve}`
      );

      if (cheapestBetterSleeve < cheapestExact) {
        debugLog(
          "Better sleeve is cheaper! Using same-media-better-sleeve pricing."
        );
        currentAnchor = betterSleeveMatchPrices;
        currentCount = betterSleeveMatchCount;
        currentType = "better-sleeve";
        useBetterSleevePricing = true;
        pricingStrategy = "same-media-better-sleeve";
      } else {
        debugLog(`Exact matches are cheaper. Keeping exact match pricing.`);
        pricingStrategy = "exact-match";
      }
    } else if (primaryPrices.length > 0) {
      // Set initial strategy if no better sleeve check
      pricingStrategy =
        primaryType === "exact"
          ? "exact-match"
          : mode === "media-only"
          ? "media-only-matches"
          : "media-only-fallback";
    }

    // Step 3: Smart pricing comparison with better media condition
    if (betterConditionPrices.length > 0) {
      const cheapestBetterCondition = Math.min(...betterConditionPrices);

      if (currentAnchor.length > 0) {
        const cheapestCurrentAnchor = Math.min(...currentAnchor);
        debugLog(
          `Better media comparison (${mode} mode): ${currentType} matches min $${cheapestCurrentAnchor} vs Better media min $${cheapestBetterCondition}`
        );

        if (cheapestBetterCondition < cheapestCurrentAnchor) {
          debugLog(
            "Better media is cheaper! Using smart pricing to undercut better media."
          );
          matchingPrices = betterConditionPrices;
          matchingListings = betterConditionCount;
          useBetterConditionPricing = true;
          pricingStrategy = "better-media";
        } else {
          debugLog(
            `${currentType} matches are cheaper. Using ${currentType} pricing.`
          );
          matchingPrices = currentAnchor;
          matchingListings = currentCount;
          // pricingStrategy already set above
        }
      } else {
        debugLog(
          "No same media condition matches found, but better media available. Using better media pricing."
        );
        matchingPrices = betterConditionPrices;
        matchingListings = betterConditionCount;
        useBetterConditionPricing = true;
        pricingStrategy = "better-media";
      }
    } else if (currentAnchor.length > 0) {
      debugLog(`Using ${currentType} pricing (no better conditions found).`);
      matchingPrices = currentAnchor;
      matchingListings = currentCount;
      // pricingStrategy already set above
    }

    if (matchingPrices.length === 0) {
      debugLog(`No matching prices found for mode: ${mode}`);
      return null;
    }

    const sorted = matchingPrices.slice().sort((a, b) => a - b);
    const min = sorted[0];
    const median = sorted[Math.floor(sorted.length / 2)];
    const max = sorted[sorted.length - 1];
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const suggested = getPsychologicalUndercut(min);
    const competitionRatio = ((matchingListings / totalListings) * 100).toFixed(
      1
    );

    return {
      min,
      median,
      max,
      avg,
      suggested,
      count: matchingPrices.length,
      totalListings,
      matchingListings,
      competitionRatio,
      useMediaOnlyFallback,
      useBetterSleevePricing,
      useBetterConditionPricing,
      pricingStrategy,
      mode,
    };
  }

  function fetchAndDisplayPrices(mediaCondition, sleeveCondition) {
    releaseId = window.location.pathname.match(/\/post\/(\d+)/)?.[1];
    if (!releaseId) {
      debugLogError("Could not extract release ID from URL");
      return;
    }

    debugLog("Fetching prices for", {
      releaseId,
      mediaCondition,
      sleeveCondition,
    });

    // Store releaseId globally
    window.currentReleaseId = releaseId;

    // Always ensure Price Analysis box is visible and hide Suggested Prices when re-triggering
    const priceBox = document.getElementById("price-box");
    if (priceBox) {
      priceBox.style.display = "block";
      showCollapsibleContent(priceBox);
    }
    updateSuggestedPrices(false);

    // Show loading state
    const container = document.getElementById("price-info-container");
    if (container) {
      container.innerHTML = `<div style="text-align: center; padding: 15px;">
          <div style="font-size: 14px; margin-bottom: 8px; color: #666;">Updating price data...</div>
          <div style="width: 32px; height: 32px; border: 3px solid #f3f3f3;
               border-top: 3px solid #9b59b6; border-radius: 50%;
               margin: 0 auto; animation: spin 1s linear infinite;"></div>
        </div>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }}</style>`;
    } else {
      debugLogError("Price info container not found");
    }

    // Hide Media and Sleeve boxes
    const mediaBox = document.getElementById("media-grade-box");
    const sleeveBox = document.getElementById("sleeve-grade-box");
    if (mediaBox) hideCollapsibleContent(mediaBox);
    if (sleeveBox) hideCollapsibleContent(sleeveBox);

    // Get community stats in parallel
    fetchCommunityStats(releaseId).then((stats) => {
      communityStats = stats;
    });

    // Set timeout for fallback data if fetch takes too long
    const timeoutId = setTimeout(() => {
      debugLog("Fetch timeout reached, using fallback price data");
      const fakePrice = Math.floor(Math.random() * 15) + 10;
      const fakeData = {
        min: fakePrice - 0.01,
        median: fakePrice + 3,
        max: fakePrice + 8,
        avg: fakePrice + 4,
        suggested: fakePrice - 0.01,
        count: 5,
        totalListings: 15,
        matchingListings: 5,
        competitionRatio: "33.3",
      };
      lastPriceData = fakeData;
      updateOverlayPrices(fakeData);
    }, 5000);

    // Fetch ALL listings with expanded parameters to see more results
    // We need to see better conditions to implement smart pricing logic
    // Use query params to get more listings: limit=100, sort by price ascending, page 1
    const url = `https://www.discogs.com/sell/release/${releaseId}?sort=price%2Casc&limit=100&page=1`;
    debugLog(
      "Fetching from URL (expanded listings for comprehensive pricing):",
      url
    );

    fetch(url)
      .then((res) => {
        debugLog("Fetch response status:", res.status);
        if (!res.ok) {
          throw new Error(`Fetch returned ${res.status}`);
        }
        return res.text();
      })
      .then((html) => {
        clearTimeout(timeoutId);
        debugLog("HTML received, parsing...");

        // Save the HTML to the console for debugging
        if (DEBUG) {
          console.log(
            "HTML preview (first 500 chars):",
            html.substring(0, 500)
          );
        }

        const doc = new DOMParser().parseFromString(html, "text/html");

        // Log the document structure to help debug selector issues
        if (DEBUG) {
          console.log("Document structure:", {
            hasTable: !!doc.querySelector("table"),
            tableRows: doc.querySelectorAll("tr").length,
            navigableRows: doc.querySelectorAll("tr.shortcut_navigable").length,
          });
        }

        const rows = [...doc.querySelectorAll("tr.shortcut_navigable")];
        debugLog(`Found ${rows.length} listing rows`);

        if (rows.length === 0) {
          debugLogError('No rows found with selector "tr.shortcut_navigable"');
          // Try to find alternative selectors
          const allTrs = doc.querySelectorAll("tr");
          debugLog(`Total tr elements: ${allTrs.length}`);

          // Log classes of the first few tr elements to help find the right selector
          if (allTrs.length > 0) {
            Array.from(allTrs)
              .slice(0, 5)
              .forEach((tr, i) => {
                debugLog(`TR ${i} classes: ${tr.className}`);
              });
          }

          updateOverlayPrices(null);
          return;
        }

        // Arrays to store prices for different match types
        const exactMatchPrices = [];
        const mediaOnlyMatchPrices = [];
        const betterSleeveMatchPrices = []; // For same media + better sleeve
        const betterConditionPrices = []; // For smart pricing
        const totalListings = rows.length;
        let exactMatchCount = 0;
        let mediaOnlyMatchCount = 0;
        let betterSleeveMatchCount = 0;
        let betterConditionCount = 0;

        // Map to store listing details keyed by price (for showing base listing info)
        const listingDetailsMap = {};

        // For debugging, examine the first row in detail
        if (rows.length > 0 && DEBUG) {
          const firstRow = rows[0];
          console.log("First row HTML:", firstRow.outerHTML);
          console.log(
            "First row condition element:",
            firstRow.querySelector(".item_condition")
          );
          console.log(
            "First row price element:",
            firstRow.querySelector(".price[data-pricevalue]")
          );
        }

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const condEl = row.querySelector(".item_condition");
          if (!condEl) {
            debugLog(`Row ${i}: No condition element found`);
            continue;
          }

          // NEW: Check if ships from USA and extract seller name
          const sellerInfo = row.querySelector(".seller_info");
          let isUSA = false;
          let sellerName = "Unknown Seller";
          if (sellerInfo) {
            const shipsFromText = sellerInfo.innerText || "";
            isUSA =
              shipsFromText.includes("Ships From:") &&
              (shipsFromText.includes("United States") ||
                shipsFromText.includes("USA") ||
                shipsFromText.includes("U.S.A"));
            debugLog(`Row ${i}: Ships from USA: ${isUSA}`);

            // Extract seller name from the seller_info element
            const sellerLink = row.querySelector(".seller_info a");
            if (sellerLink) {
              sellerName = sellerLink.textContent.trim();
            } else {
              // Fallback: try to extract from text before "Ships From"
              const parts = shipsFromText.split("Ships From:");
              if (parts.length > 0) {
                sellerName = parts[0].trim() || "Unknown Seller";
              }
            }
          }

          // FILTER: Only include USA listings
          if (!isUSA) {
            debugLog(`Row ${i}: Skipping non-USA listing`);
            continue;
          }

          const condText = condEl.innerText;
          debugLog(`Row ${i}: Full condition text: "${condText}"`);

          // EXTRACT MEDIA-SPECIFIC TEXT to avoid matching sleeve conditions
          // Split the condition text to get only the media portion
          let mediaText = condText;

          // Try multiple methods to extract just the media condition portion
          // Method 1: Look for text between "Media:" and "Sleeve:"
          const mediaMatch1 = condText.match(
            /Media:?\s*([^]*?)(?:Sleeve\s*(?:Condition)?:|$)/i
          );
          if (mediaMatch1) {
            mediaText = mediaMatch1[1];
            debugLog(
              `Row ${i}: Extracted media text (method 1): "${mediaText.substring(
                0,
                100
              )}..."`
            );
          } else {
            // Method 2: Try to get text before "Sleeve Condition:" or just "Sleeve:"
            const sleevePatterns = ["Sleeve Condition:", "Sleeve:"];
            let sleeveIndex = -1;
            for (const pattern of sleevePatterns) {
              const idx = condText.indexOf(pattern);
              if (idx > 0 && (sleeveIndex === -1 || idx < sleeveIndex)) {
                sleeveIndex = idx;
              }
            }

            if (sleeveIndex > 0) {
              mediaText = condText.substring(0, sleeveIndex);
              debugLog(
                `Row ${i}: Using text before sleeve section (method 2): "${mediaText.substring(
                  0,
                  100
                )}..."`
              );
            } else {
              // Method 3: If no clear separation found, look for first condition pattern
              // and take a reasonable chunk of text around it
              debugLog(
                `Row ${i}: No clear media/sleeve separation found, using full text`
              );
            }
          }

          // PRECISE CONDITION MATCHING - Use exact pattern matching to prevent false positives
          // For "Very Good Plus (VG+)", check for exact matches, not substrings
          const mediaBasic = mediaCondition.replace(/\s*\([^)]*\)/, "").trim(); // Get "Very Good Plus"
          const mediaCode = mediaCondition.match(/\(([^)]*)\)/)?.[1] || ""; // Get "VG+"
          const sleeveBasic = sleeveCondition
            .replace(/\s*\([^)]*\)/, "")
            .trim();
          const sleeveCode = sleeveCondition.match(/\(([^)]*)\)/)?.[1] || "";

          debugLog(
            `Row ${i}: Looking for Media: "${mediaBasic}" or "${mediaCode}", Sleeve: "${sleeveBasic}" or "${sleeveCode}"`
          );
          debugLog(
            `Row ${i}: Media text to search: "${mediaText.substring(
              0,
              150
            )}..."`
          );

          // SUPER EXPLICIT CHECKING - Directly look for sleeve condition in its own element
          let mediaMatch = false;
          let sleeveMatch = false;

          // Check media condition with EXACT pattern matching to prevent VG matching VG+
          // NOW SEARCHING IN MEDIA-SPECIFIC TEXT ONLY
          let hasMediaMatch = false;

          // IMPROVED CONDITION MATCHING - More precise and reliable
          // Special handling for Near Mint which can appear as "NM or M-"
          if (mediaCode === "NM or M-") {
            // Look for NM, M-, or "NM or M-" patterns
            const nmPatterns = [
              /\bNM\b(?![+])/i, // NM but not NM+
              /\bM-\b/i,
              /\bNM\s*or\s*M-\b/i,
              /\bNear\s*Mint\b/i,
            ];
            hasMediaMatch = nmPatterns.some((pattern) =>
              pattern.test(mediaText)
            );
            debugLog(
              `Row ${i}: Testing NM patterns against media text - Match: ${hasMediaMatch}`
            );
          } else if (mediaCode) {
            // FIXED: Better pattern matching for condition codes
            // Handle special cases for VG, G to prevent false matches with VG+, G+
            let codePattern;

            if (mediaCode === "VG") {
              // Match VG but NOT VG+ (negative lookahead)
              codePattern = /\bVG\b(?!\+)/i;
              debugLog(`Row ${i}: Using special VG pattern to exclude VG+`);
            } else if (mediaCode === "G") {
              // Match G but NOT G+ (negative lookahead)
              codePattern = /\bG\b(?!\+)/i;
              debugLog(`Row ${i}: Using special G pattern to exclude G+`);
            } else if (mediaCode === "VG+" || mediaCode === "G+") {
              // For plus grades, escape the + and ensure it's present
              const escapedCode = mediaCode.replace(/\+/g, "\\+");
              codePattern = new RegExp(`\\b${escapedCode}\\b`, "i");
              debugLog(`Row ${i}: Using plus pattern for ${mediaCode}`);
            } else {
              // For other codes (P, F, M), standard word boundary matching
              const escapedCode = mediaCode.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              );
              codePattern = new RegExp(`\\b${escapedCode}\\b`, "i");
            }

            hasMediaMatch = codePattern.test(mediaText);
            debugLog(
              `Row ${i}: Testing code pattern for '${mediaCode}' against media text - Match: ${hasMediaMatch}`
            );
          }

          // Fallback to full name matching if code didn't match
          if (!hasMediaMatch && mediaBasic) {
            // IMPROVED: More precise full name matching
            if (mediaBasic === "Near Mint") {
              const nmPattern = /\bNear\s*Mint\b/i;
              hasMediaMatch = nmPattern.test(mediaText);
              debugLog(
                `Row ${i}: Testing Near Mint full name pattern - Match: ${hasMediaMatch}`
              );
            } else if (mediaBasic === "Very Good") {
              // Match "Very Good" but NOT "Very Good Plus"
              const vgPattern = /\bVery\s+Good\b(?!\s+Plus)/i;
              hasMediaMatch = vgPattern.test(mediaText);
              debugLog(
                `Row ${i}: Testing Very Good pattern (excluding Plus) - Match: ${hasMediaMatch}`
              );
            } else if (mediaBasic === "Good") {
              // Match "Good" but NOT "Good Plus"
              const gPattern = /\bGood\b(?!\s+Plus)/i;
              hasMediaMatch = gPattern.test(mediaText);
              debugLog(
                `Row ${i}: Testing Good pattern (excluding Plus) - Match: ${hasMediaMatch}`
              );
            } else if (
              mediaBasic === "Very Good Plus" ||
              mediaBasic === "Good Plus"
            ) {
              // For "Plus" variants, ensure Plus is included
              const plusPattern = new RegExp(`\\b${mediaBasic}\\b`, "i");
              hasMediaMatch = plusPattern.test(mediaText);
              debugLog(
                `Row ${i}: Testing '${mediaBasic}' full pattern - Match: ${hasMediaMatch}`
              );
            } else {
              // For other conditions (Poor, Fair, Mint)
              const basicPattern = new RegExp(`\\b${mediaBasic}\\b`, "i");
              hasMediaMatch = basicPattern.test(mediaText);
              debugLog(
                `Row ${i}: Testing '${mediaBasic}' pattern - Match: ${hasMediaMatch}`
              );
            }
          }

          mediaMatch = hasMediaMatch;

          // Try to directly find sleeve condition element
          const sleeveElement = row.querySelector(".item_sleeve_condition");
          if (sleeveElement) {
            const sleeveTxt = sleeveElement.innerText || "";
            debugLog(
              `Row ${i}: Found sleeve element with text: "${sleeveTxt}"`
            );

            // Use exact pattern matching for sleeve condition too
            let hasSleeveMatch = false;

            // IMPROVED: Apply same precise matching logic to sleeve conditions
            if (sleeveCode === "NM or M-") {
              const nmPatterns = [
                /\bNM\b(?![+])/i, // NM but not NM+
                /\bM-\b/i,
                /\bNM\s*or\s*M-\b/i,
                /\bNear\s*Mint\b/i,
              ];
              hasSleeveMatch = nmPatterns.some((pattern) =>
                pattern.test(sleeveTxt)
              );
            } else if (sleeveCode) {
              // Apply same special handling as media conditions
              let sleevePattern;

              if (sleeveCode === "VG") {
                sleevePattern = /\bVG\b(?!\+)/i;
              } else if (sleeveCode === "G") {
                sleevePattern = /\bG\b(?!\+)/i;
              } else if (sleeveCode === "VG+" || sleeveCode === "G+") {
                const escapedCode = sleeveCode.replace(/\+/g, "\\+");
                sleevePattern = new RegExp(`\\b${escapedCode}\\b`, "i");
              } else {
                const escapedCode = sleeveCode.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                );
                sleevePattern = new RegExp(`\\b${escapedCode}\\b`, "i");
              }

              hasSleeveMatch = sleevePattern.test(sleeveTxt);
            }

            if (!hasSleeveMatch && sleeveBasic) {
              if (sleeveBasic === "Near Mint") {
                const nmPattern = /\bNear\s*Mint\b/i;
                hasSleeveMatch = nmPattern.test(sleeveTxt);
              } else if (sleeveBasic === "Very Good") {
                const vgPattern = /\bVery\s+Good\b(?!\s+Plus)/i;
                hasSleeveMatch = vgPattern.test(sleeveTxt);
              } else if (sleeveBasic === "Good") {
                const gPattern = /\bGood\b(?!\s+Plus)/i;
                hasSleeveMatch = gPattern.test(sleeveTxt);
              } else if (
                sleeveBasic === "Very Good Plus" ||
                sleeveBasic === "Good Plus"
              ) {
                const plusPattern = new RegExp(`\\b${sleeveBasic}\\b`, "i");
                hasSleeveMatch = plusPattern.test(sleeveTxt);
              } else {
                const basicPattern = new RegExp(`\\b${sleeveBasic}\\b`, "i");
                hasSleeveMatch = basicPattern.test(sleeveTxt);
              }
            }

            sleeveMatch = hasSleeveMatch;
          } else {
            // Fall back to checking in the entire condition text with exact patterns
            let hasSleeveMatch = false;

            // IMPROVED: Fallback sleeve matching with same precise logic
            if (sleeveCode === "NM or M-") {
              const nmPatterns = [
                /\bNM\b(?![+])/i, // NM but not NM+
                /\bM-\b/i,
                /\bNM\s*or\s*M-\b/i,
                /\bNear\s*Mint\b/i,
              ];
              hasSleeveMatch = nmPatterns.some((pattern) =>
                pattern.test(condText)
              );
            } else if (sleeveCode) {
              let sleevePattern;

              if (sleeveCode === "VG") {
                sleevePattern = /\bVG\b(?!\+)/i;
              } else if (sleeveCode === "G") {
                sleevePattern = /\bG\b(?!\+)/i;
              } else if (sleeveCode === "VG+" || sleeveCode === "G+") {
                const escapedCode = sleeveCode.replace(/\+/g, "\\+");
                sleevePattern = new RegExp(`\\b${escapedCode}\\b`, "i");
              } else {
                const escapedCode = sleeveCode.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                );
                sleevePattern = new RegExp(`\\b${escapedCode}\\b`, "i");
              }

              hasSleeveMatch = sleevePattern.test(condText);
            }

            if (!hasSleeveMatch && sleeveBasic) {
              if (sleeveBasic === "Near Mint") {
                const nmPattern = /\bNear\s*Mint\b/i;
                hasSleeveMatch = nmPattern.test(condText);
              } else if (sleeveBasic === "Very Good") {
                const vgPattern = /\bVery\s+Good\b(?!\s+Plus)/i;
                hasSleeveMatch = vgPattern.test(condText);
              } else if (sleeveBasic === "Good") {
                const gPattern = /\bGood\b(?!\s+Plus)/i;
                hasSleeveMatch = gPattern.test(condText);
              } else if (
                sleeveBasic === "Very Good Plus" ||
                sleeveBasic === "Good Plus"
              ) {
                const plusPattern = new RegExp(`\\b${sleeveBasic}\\b`, "i");
                hasSleeveMatch = plusPattern.test(condText);
              } else {
                const basicPattern = new RegExp(`\\b${sleeveBasic}\\b`, "i");
                hasSleeveMatch = basicPattern.test(condText);
              }
            }

            sleeveMatch = hasSleeveMatch;
          }

          debugLog(
            `Row ${i}: Match results - Media: ${mediaMatch}, Sleeve: ${sleeveMatch}`
          );

          // Extract the actual media condition from this listing for smart pricing
          let listingMediaCondition = null;

          // IMPROVED: More reliable pattern matching for extracting conditions from listings
          // Order matters - check from most specific to least specific
          const conditionPatterns = [
            {
              grade: "M",
              patterns: [
                /\bMint\s*\(M\)/i,
                /\bM\b(?![+-])/i, // M but not M+ or M-
                /\bMint\b(?!\s*[-])/i, // Mint but not Mint-
              ],
            },
            {
              grade: "NM",
              patterns: [
                /\bNear\s*Mint\s*\(NM\s*or\s*M-\)/i,
                /\bNear\s*Mint\b/i,
                /\bNM\b(?![+])/i, // NM but not NM+
                /\bM-\b/i,
              ],
            },
            {
              grade: "VG+",
              patterns: [
                /\bVery\s*Good\s*Plus\s*\(VG\+\)/i,
                /\bVG\+\b/i,
                /\bVery\s+Good\s+Plus\b/i,
              ],
            },
            {
              grade: "VG",
              patterns: [
                /\bVery\s*Good\s*\(VG\)/i, // "Very Good (VG)"
                /\bVG\b(?![+])/i, // VG but NOT VG+
                /\bVery\s+Good\b(?!\s+Plus)/i, // "Very Good" but NOT "Very Good Plus"
              ],
            },
            {
              grade: "G+",
              patterns: [
                /\bGood\s*Plus\s*\(G\+\)/i,
                /\bG\+\b/i,
                /\bGood\s+Plus\b/i,
              ],
            },
            {
              grade: "G",
              patterns: [
                /\bGood\s*\(G\)/i, // "Good (G)"
                /\bG\b(?![+])/i, // G but NOT G+
                /\bGood\b(?!\s+Plus)/i, // "Good" but NOT "Good Plus"
              ],
            },
            {
              grade: "F",
              patterns: [
                /\bFair\s*\(F\)/i,
                /\bF\b(?![+])/i, // F but not F+
                /\bFair\b/i,
              ],
            },
            {
              grade: "P",
              patterns: [
                /\bPoor\s*\(P\)/i,
                /\bP\b(?![+])/i, // P but not P+
                /\bPoor\b/i,
              ],
            },
          ];

          // Search from best to worst to get the highest grade mentioned IN MEDIA TEXT ONLY
          for (const { grade, patterns } of conditionPatterns) {
            if (patterns.some((pattern) => pattern.test(mediaText))) {
              // Use mediaText, not condText
              listingMediaCondition = grade;
              debugLog(
                `Row ${i}: Extracted media condition "${grade}" from media text: "${mediaText.substring(
                  0,
                  100
                )}..."`
              );
              break;
            }
          }

          if (!listingMediaCondition) {
            debugLog(
              `Row ${i}: Could not extract media condition from: "${mediaText.substring(
                0,
                100
              )}..."`
            );
          }

          // Extract the actual sleeve condition from this listing for better sleeve comparison
          let listingSleeveCondition = null;

          // Try to get sleeve condition from the dedicated sleeve element first
          const listingSleeveElement = row.querySelector(".item_sleeve_condition");
          let sleeveText = "";

          if (listingSleeveElement) {
            sleeveText = listingSleeveElement.innerText || "";
            debugLog(
              `Row ${i}: Found sleeve element text: "${sleeveText.substring(0, 100)}..."`
            );
          } else {
            // Fallback: extract sleeve portion from full condition text
            // Look for text after "Sleeve:" or "Sleeve Condition:"
            const sleeveMatch = condText.match(
              /Sleeve\s*(?:Condition)?:?\s*([^]*?)$/i
            );
            if (sleeveMatch) {
              sleeveText = sleeveMatch[1];
              debugLog(
                `Row ${i}: Extracted sleeve text from condText: "${sleeveText.substring(
                  0,
                  100
                )}..."`
              );
            } else {
              debugLog(`Row ${i}: Could not extract sleeve text`);
            }
          }

          // Extract sleeve condition grade using the same pattern matching
          if (sleeveText) {
            for (const { grade, patterns } of conditionPatterns) {
              if (patterns.some((pattern) => pattern.test(sleeveText))) {
                listingSleeveCondition = grade;
                debugLog(
                  `Row ${i}: Extracted sleeve condition "${grade}" from sleeve text: "${sleeveText.substring(
                    0,
                    100
                  )}..."`
                );
                break;
              }
            }
          }

          if (!listingSleeveCondition) {
            debugLog(
              `Row ${i}: Could not extract sleeve condition from: "${sleeveText.substring(
                0,
                100
              )}..."`
            );
          }

          // Get the price for this listing
          const priceEl = row.querySelector(".price[data-pricevalue]");
          if (!priceEl) {
            debugLog(`Row ${i}: No price element found`);
            continue;
          }

          const priceValue = priceEl.dataset.pricevalue;
          debugLog(`Row ${i}: Price value from dataset: ${priceValue}`);

          const price = parseFloat(priceValue);
          if (isNaN(price)) {
            debugLogError(`Row ${i}: Invalid price: ${priceValue}`);
            continue;
          }

          // Smart pricing: check if this listing has better condition than ours
          let ourMediaCode = null;

          // Extract our media condition more reliably
          // FIXED: Better extraction logic that handles edge cases
          if (mediaCode === "NM or M-") {
            ourMediaCode = "NM";
          } else if (mediaCode) {
            // Use the code directly if available (VG, VG+, etc.)
            ourMediaCode = mediaCode;
          } else {
            // Fallback: search for grade in the condition string
            for (const grade of [...conditionHierarchy].reverse()) {
              if (mediaCondition.includes(gradeMap[grade])) {
                ourMediaCode = grade;
                break;
              }
            }
          }
          debugLog(
            `Row ${i}: Our media condition code extracted as: "${ourMediaCode}"`
          );

          let isBetterMedia = false;
          if (listingMediaCondition && ourMediaCode) {
            const ourRank = getConditionRank(ourMediaCode);
            const listingRank = getConditionRank(listingMediaCondition);
            isBetterMedia = listingRank > ourRank;
            debugLog(
              `Row ${i}: Condition comparison - Listing: "${listingMediaCondition}" (rank ${listingRank}) vs Ours: "${ourMediaCode}" (rank ${ourRank}) - Better: ${isBetterMedia}`
            );
          } else {
            debugLog(
              `Row ${i}: Could not compare conditions - Listing: "${listingMediaCondition}", Ours: "${ourMediaCode}"`
            );
          }

          // Check if this listing has better sleeve condition than ours (for same media)
          let ourSleeveCode = null;
          let isBetterSleeve = false;

          // Extract our sleeve condition more reliably
          if (sleeveCode === "NM or M-") {
            ourSleeveCode = "NM";
          } else if (sleeveCode) {
            // Use the code directly if available (VG, VG+, etc.)
            ourSleeveCode = sleeveCode;
          } else {
            // Fallback: search for grade in the sleeve condition string
            for (const grade of [...conditionHierarchy].reverse()) {
              if (sleeveCondition.includes(gradeMap[grade])) {
                ourSleeveCode = grade;
                break;
              }
            }
          }
          debugLog(
            `Row ${i}: Our sleeve condition code extracted as: "${ourSleeveCode}"`
          );

          // Compare sleeve conditions only if media matches
          if (mediaMatch && listingSleeveCondition && ourSleeveCode) {
            const ourSleeveRank = getConditionRank(ourSleeveCode);
            const listingSleeveRank = getConditionRank(listingSleeveCondition);
            isBetterSleeve = listingSleeveRank > ourSleeveRank;
            debugLog(
              `Row ${i}: Sleeve comparison - Listing: "${listingSleeveCondition}" (rank ${listingSleeveRank}) vs Ours: "${ourSleeveCode}" (rank ${ourSleeveRank}) - Better: ${isBetterSleeve}`
            );
          } else {
            debugLog(
              `Row ${i}: Could not compare sleeve conditions - MediaMatch: ${mediaMatch}, Listing: "${listingSleeveCondition}", Ours: "${ourSleeveCode}"`
            );
          }

          // COLLECT ALL MATCH DATA: We'll process it differently based on mode later
          // Store match data for both full and media-only processing
          const matchData = {
            price,
            mediaMatch,
            sleeveMatch,
            isBetterMedia,
            listingMediaCondition,
            row: i,
          };

          // Store listing details in map (keyed by price for easy lookup later)
          if (!listingDetailsMap[price]) {
            listingDetailsMap[price] = {
              price: price,
              media: listingMediaCondition || "Unknown",
              sleeve: listingSleeveCondition || "N/A",
              seller: sellerName,
            };
            debugLog(
              `Row ${i}: Stored listing details for price $${price} - Media: ${listingMediaCondition}, Sleeve: ${listingSleeveCondition}, Seller: ${sellerName}`
            );
          }

          // Always categorize based on actual match types for data collection
          if (mediaMatch) {
            if (sleeveMatch) {
              // Both media and sleeve match - exact match (best case)
              exactMatchPrices.push(price);
              exactMatchCount++;
              debugLog(`Row ${i}: ✓ EXACT MATCH! Added price: $${price}`);
            } else if (isBetterSleeve) {
              // Same media but better sleeve - better sleeve match (NEW!)
              betterSleeveMatchPrices.push(price);
              betterSleeveMatchCount++;
              debugLog(
                `Row ${i}: 🎁 BETTER SLEEVE! Added price: $${price} (Sleeve: ${listingSleeveCondition})`
              );
            } else {
              // Only media matches - still valid for pricing since media is primary
              mediaOnlyMatchPrices.push(price);
              mediaOnlyMatchCount++;
              debugLog(`Row ${i}: ⚠ MEDIA-ONLY MATCH! Added price: $${price}`);
            }
          } else if (isBetterMedia) {
            // No exact media match, but better condition available for smart pricing
            betterConditionPrices.push(price);
            betterConditionCount++;
            debugLog(
              `Row ${i}: ⭐ BETTER CONDITION! Added price: $${price} (${listingMediaCondition})`
            );
          } else {
            // Media condition is worse or incomparable - IGNORE COMPLETELY
            debugLog(
              `Row ${i}: ✗ NO MATCH - Skipping (media condition doesn't match or is worse)`
            );
          }
        }

        // ENHANCED DEBUG: Show detailed match statistics
        debugLog("=== PRICING MATCH SUMMARY ===");
        debugLog(
          `Selected condition: Media=${selectedMedia}, Sleeve=${selectedSleeve}`
        );
        debugLog(`Pricing Mode: ${pricingMode}`);
        debugLog(`Total listings analyzed: ${totalListings}`);
        debugLog(
          `Exact matches (both media & sleeve): ${exactMatchPrices.length}`
        );
        if (exactMatchPrices.length > 0) {
          debugLog(
            `  Exact match prices: ${exactMatchPrices
              .slice(0, 5)
              .map((p) => "$" + p.toFixed(2))
              .join(", ")}${exactMatchPrices.length > 5 ? "..." : ""}`
          );
        }
        debugLog(`Better sleeve matches: ${betterSleeveMatchPrices.length}`);
        if (betterSleeveMatchPrices.length > 0) {
          debugLog(
            `  Better sleeve prices: ${betterSleeveMatchPrices
              .slice(0, 5)
              .map((p) => "$" + p.toFixed(2))
              .join(", ")}${betterSleeveMatchPrices.length > 5 ? "..." : ""}`
          );
        }
        debugLog(`Media-only matches: ${mediaOnlyMatchPrices.length}`);
        if (mediaOnlyMatchPrices.length > 0) {
          debugLog(
            `  Media-only prices: ${mediaOnlyMatchPrices
              .slice(0, 5)
              .map((p) => "$" + p.toFixed(2))
              .join(", ")}${mediaOnlyMatchPrices.length > 5 ? "..." : ""}`
          );
        }
        debugLog(`Better condition matches: ${betterConditionPrices.length}`);
        if (betterConditionPrices.length > 0) {
          debugLog(
            `  Better condition prices: ${betterConditionPrices
              .slice(0, 5)
              .map((p) => "$" + p.toFixed(2))
              .join(", ")}${betterConditionPrices.length > 5 ? "..." : ""}`
          );
        }
        debugLog("=== END SUMMARY ===");

        // PRIORITY LOGIC WITH BETTER SLEEVE CHECK: Prefer exact matches, then check better sleeve, then better media
        let useMediaOnlyFallback = false;
        let useBetterSleevePricing = false;
        let useBetterConditionPricing = false;
        let matchingPrices = [];
        let matchingListings = 0;
        let pricingStrategy = "";

        // Step 1: Determine the best available pricing source in priority order
        let primaryPrices = [];
        let primaryCount = 0;
        let primaryType = "";

        if (exactMatchPrices.length > 0) {
          // PRIORITY 1: Exact matches (both media and sleeve match) - use these first
          primaryPrices = exactMatchPrices;
          primaryCount = exactMatchCount;
          primaryType = "exact";
          debugLog(
            `Using exact matches as primary pricing source: ${exactMatchCount} listings`
          );
        } else if (mediaOnlyMatchPrices.length > 0) {
          // PRIORITY 2: Media-only matches (media matches, sleeve doesn't) - fallback
          primaryPrices = mediaOnlyMatchPrices;
          primaryCount = mediaOnlyMatchCount;
          primaryType = "media-only";
          useMediaOnlyFallback = true;
          debugLog(
            `Using media-only matches as primary pricing source: ${mediaOnlyMatchCount} listings`
          );
        }

        // Step 2: NEW - Check for better sleeve (same media, better sleeve) BEFORE better media
        // Only compare if we have exact matches (not media-only fallback)
        let currentAnchor = primaryPrices;
        let currentCount = primaryCount;
        let currentType = primaryType;

        if (
          betterSleeveMatchPrices.length > 0 &&
          primaryType === "exact" &&
          primaryPrices.length > 0
        ) {
          const cheapestBetterSleeve = Math.min(...betterSleeveMatchPrices);
          const cheapestExact = Math.min(...exactMatchPrices);

          debugLog(
            `Better sleeve comparison: Exact match min $${cheapestExact} vs Better sleeve min $${cheapestBetterSleeve}`
          );

          if (cheapestBetterSleeve < cheapestExact) {
            debugLog(
              "Better sleeve is cheaper! Using same-media-better-sleeve pricing."
            );
            currentAnchor = betterSleeveMatchPrices;
            currentCount = betterSleeveMatchCount;
            currentType = "better-sleeve";
            useBetterSleevePricing = true;
            pricingStrategy = "same-media-better-sleeve";
          } else {
            debugLog(
              `Exact matches are cheaper. Keeping exact match pricing.`
            );
            pricingStrategy = "exact-match";
          }
        } else if (primaryPrices.length > 0) {
          // Set initial strategy if no better sleeve check
          pricingStrategy =
            primaryType === "exact" ? "exact-match" : "media-only-fallback";
        }

        // Step 3: Smart pricing comparison with better media condition
        if (betterConditionPrices.length > 0) {
          const cheapestBetterCondition = Math.min(...betterConditionPrices);

          if (currentAnchor.length > 0) {
            const cheapestCurrentAnchor = Math.min(...currentAnchor);
            debugLog(
              `Better media comparison: ${currentType} matches min $${cheapestCurrentAnchor} vs Better media min $${cheapestBetterCondition}`
            );

            if (cheapestBetterCondition < cheapestCurrentAnchor) {
              debugLog(
                "Better media is cheaper! Using smart pricing to undercut better media."
              );
              matchingPrices = betterConditionPrices;
              matchingListings = betterConditionCount;
              useBetterConditionPricing = true;
              pricingStrategy = "better-media";
            } else {
              debugLog(
                `${currentType} matches are cheaper. Using ${currentType} pricing.`
              );
              matchingPrices = currentAnchor;
              matchingListings = currentCount;
              // pricingStrategy already set above
            }
          } else {
            debugLog(
              "No same media condition matches found, but better media available. Using better media pricing."
            );
            matchingPrices = betterConditionPrices;
            matchingListings = betterConditionCount;
            useBetterConditionPricing = true;
            pricingStrategy = "better-media";
          }
        } else if (currentAnchor.length > 0) {
          debugLog(
            `Using ${currentType} pricing (no better conditions found).`
          );
          matchingPrices = currentAnchor;
          matchingListings = currentCount;
          // pricingStrategy already set above
        }

        if (matchingPrices.length === 0) {
          debugLogError("WARNING: No matching prices found!");
          debugLog("Possible causes:");
          debugLog("1. No listings with matching conditions");
          debugLog("2. Condition matching logic failed");
          debugLog("3. All listings are from non-USA sellers");

          // FALLBACK: If absolutely no matches, try to use ANY USA listings as last resort
          const allUSAPrices = [];
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const sellerInfo = row.querySelector(".seller_info");
            if (sellerInfo) {
              const shipsFromText = sellerInfo.innerText || "";
              const isUSA =
                shipsFromText.includes("Ships From:") &&
                (shipsFromText.includes("United States") ||
                  shipsFromText.includes("USA") ||
                  shipsFromText.includes("U.S.A"));

              if (isUSA) {
                const priceEl = row.querySelector(".price[data-pricevalue]");
                if (priceEl) {
                  const price = parseFloat(priceEl.dataset.pricevalue);
                  if (!isNaN(price) && price > 0) {
                    allUSAPrices.push(price);
                  }
                }
              }
            }
          }

          if (allUSAPrices.length > 0) {
            debugLog(
              `FALLBACK: Found ${allUSAPrices.length} USA listings (any condition)`
            );
            debugLog(
              `FALLBACK prices: ${allUSAPrices
                .slice(0, 5)
                .map((p) => "$" + p.toFixed(2))
                .join(", ")}`
            );
            matchingPrices = allUSAPrices;
            matchingListings = allUSAPrices.length;
            pricingStrategy = "emergency fallback (any USA listing)";
          } else {
            debugLogError("No USA listings found at all!");
            pricingStrategy = "no-comps";
            updateOverlayPrices(null);
            return;
          }
        }

        const sorted = matchingPrices.slice().sort((a, b) => a - b);
        const min = sorted[0];
        const median = sorted[Math.floor(sorted.length / 2)];
        const max = sorted[sorted.length - 1];
        const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        const suggested = getPsychologicalUndercut(min);
        const competitionRatio = (
          (matchingListings / totalListings) *
          100
        ).toFixed(1);

        debugLog(`Using pricing strategy: ${pricingStrategy}`);

        debugLog("Price stats calculated:", {
          min,
          median,
          max,
          avg,
          suggested,
          count: matchingPrices.length,
          competitionRatio,
          useMediaOnlyFallback,
        });

        // Debug: Show what's in the listingDetailsMap
        debugLog(
          "Listing details map keys:",
          Object.keys(listingDetailsMap).slice(0, 10)
        );
        debugLog(
          `Looking up min price $${min} in map - Found:`,
          listingDetailsMap[min]
        );

        lastPriceData = {
          min,
          median,
          max,
          avg,
          suggested,
          count: matchingPrices.length,
          totalListings,
          matchingListings,
          competitionRatio,
          useMediaOnlyFallback,
          useBetterSleevePricing,
          useBetterConditionPricing,
          pricingStrategy,
          minListing: listingDetailsMap[min] || null,
        };

        // Handle different pricing modes
        if (pricingMode === "both") {
          // Generate both full and media-only pricing data
          const fullConditionData = generatePricingData(
            "full",
            exactMatchPrices,
            mediaOnlyMatchPrices,
            betterSleeveMatchPrices,
            betterConditionPrices,
            exactMatchCount,
            mediaOnlyMatchCount,
            betterSleeveMatchCount,
            betterConditionCount,
            totalListings
          );
          const mediaOnlyData = generatePricingData(
            "media-only",
            exactMatchPrices,
            mediaOnlyMatchPrices,
            betterSleeveMatchPrices,
            betterConditionPrices,
            exactMatchCount,
            mediaOnlyMatchCount,
            betterSleeveMatchCount,
            betterConditionCount,
            totalListings
          );

          // Add minListing info to both datasets
          if (fullConditionData) {
            fullConditionData.minListing =
              listingDetailsMap[fullConditionData.min] || null;
          }
          if (mediaOnlyData) {
            mediaOnlyData.minListing =
              listingDetailsMap[mediaOnlyData.min] || null;
          }

          // Store both for later use
          lastPriceData = {
            full: fullConditionData,
            mediaOnly: mediaOnlyData,
            mode: "both",
          };
          updateOverlayPrices(lastPriceData);
        } else {
          // Single mode - generate pricing data for current mode
          const singleModeData = generatePricingData(
            pricingMode,
            exactMatchPrices,
            mediaOnlyMatchPrices,
            betterSleeveMatchPrices,
            betterConditionPrices,
            exactMatchCount,
            mediaOnlyMatchCount,
            betterSleeveMatchCount,
            betterConditionCount,
            totalListings
          );
          // Add listing details for the minimum price
          if (singleModeData) {
            singleModeData.minListing =
              listingDetailsMap[singleModeData.min] || null;
            debugLog(
              `Added minListing to singleModeData:`,
              singleModeData.minListing
            );
          }
          lastPriceData = singleModeData;
          updateOverlayPrices(lastPriceData);
        }
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        debugLogError("Error fetching pricing data:", error);

        // More detailed error info
        if (error instanceof Error) {
          debugLogError("Error name:", error.name);
          debugLogError("Error message:", error.message);
          debugLogError("Error stack:", error.stack);
        }

        // Show the error in the UI as well
        const container = document.getElementById("price-info-container");
        if (container) {
          container.innerHTML = `
              <div style="padding: 15px; text-align: center; background: #f8d7da; color: #721c24; border-radius: 6px;">
                <div style="font-size: 16px; margin-bottom: 5px;">Error fetching price data</div>
                <div style="font-size: 14px;">${
                  error.message || "Unknown error"
                }</div>
              </div>`;
        }

        updateOverlayPrices(null);
      });
  }

  // Get a set of appropriate psychological price points based on current pricing data
  function getPsychologicalPricePoints(minPrice, medianPrice, suggestedPrice) {
    const pricePoints = new Set(); // Use Set to avoid duplicates

    // Generate price points at various positions in the price range
    const spread = Math.max(medianPrice - minPrice, 2); // Ensure minimum spread

    // Add the core prices we always want
    pricePoints.add(parseFloat(suggestedPrice.toFixed(2)));

    // Always add specific variations around the suggested price
    // For example, if suggested is $10.99, add $9.99, $11.99, etc.
    const suggestedBase = Math.floor(suggestedPrice);
    pricePoints.add(parseFloat((suggestedBase - 0.01).toFixed(2))); // $9.99
    pricePoints.add(parseFloat((suggestedBase + 0.99).toFixed(2))); // $10.99
    pricePoints.add(parseFloat((suggestedBase + 1.99).toFixed(2))); // $11.99
    pricePoints.add(parseFloat((suggestedBase - 1.01).toFixed(2))); // $8.99

    // Add .79 versions for all modes
    pricePoints.add(parseFloat((suggestedBase - 0.21).toFixed(2))); // $9.79
    pricePoints.add(parseFloat((suggestedBase + 0.79).toFixed(2))); // $10.79

    // Always add the min price
    pricePoints.add(parseFloat(minPrice.toFixed(2)));

    // Add a price point between min and suggested
    const midPoint = minPrice + (suggestedPrice - minPrice) / 2;
    pricePoints.add(parseFloat((Math.floor(midPoint) - 0.01).toFixed(2)));
    pricePoints.add(parseFloat((Math.floor(midPoint) + 0.79).toFixed(2)));

    // Add median price point
    pricePoints.add(parseFloat(medianPrice.toFixed(2)));

    // For higher priced items, add some percentage-based variations
    if (suggestedPrice > 5) {
      // Add 10% below and above suggested price
      pricePoints.add(parseFloat((suggestedPrice * 0.9).toFixed(2)));
      pricePoints.add(parseFloat((suggestedPrice * 1.1).toFixed(2)));
    }

    // For lower priced items, ensure some lower psychological price points
    if (suggestedPrice < 5) {
      [0.79, 0.99, 1.79, 1.99, 2.99].forEach((p) => {
        if (p < suggestedPrice) pricePoints.add(p);
      });
    }

    // Convert to array, sort, and filter out duplicates and values too close to each other
    let sortedPrices = Array.from(pricePoints).sort((a, b) => a - b);

    // Filter out prices that are too close to each other (within 3%)
    sortedPrices = sortedPrices.filter((price, i, arr) => {
      if (i === 0) return true;
      return price > arr[i - 1] * 1.03; // At least 3% difference
    });

    // Ensure we have at least some minimum number of price points
    while (sortedPrices.length < 8 && suggestedPrice > 1) {
      const basePrice = Math.floor(suggestedPrice);
      if (!sortedPrices.includes(basePrice - 2.01) && basePrice - 2.01 > 0)
        sortedPrices.push(basePrice - 2.01);
      else if (!sortedPrices.includes(basePrice + 2.99))
        sortedPrices.push(basePrice + 2.99);
      else break;

      sortedPrices.sort((a, b) => a - b);
    }

    // Return up to 12 price points for three rows of four buttons
    return sortedPrices.slice(0, 12);
  }

  function parsePriceString(value) {
    if (!value) return null;
    const cleaned = value.replace(/[^0-9.,-]/g, "");
    if (!cleaned) return null;

    const hasComma = cleaned.includes(",");
    const hasDot = cleaned.includes(".");
    let normalized = cleaned;

    if (hasComma && !hasDot) {
      normalized = normalized.replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }

    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getSuggestedPriceFromDOM() {
    const valueEl = document.querySelector("#suggested_price .value");
    if (!valueEl) {
      debugLog("Suggested price element not found on page");
      return null;
    }

    const price = parsePriceString(valueEl.textContent);
    if (price === null) {
      debugLog("Unable to parse suggested price value", valueEl.textContent);
      return null;
    }

    debugLog("Suggested price parsed from DOM:", price);
    return price;
  }

  function getRecentSalesInfo() {
    const info = { entries: {}, lastSold: null };
    const sections = document.querySelectorAll(".clearfix.push_down_mini");
    const targetSection = Array.from(sections).find((section) =>
      section.textContent.includes("Recent Sales History")
    );

    if (!targetSection) {
      debugLog("Recent Sales History section not found");
      return info;
    }

    const listItems = targetSection.querySelectorAll("ul li");
    listItems.forEach((li) => {
      const labelEl = li.querySelector("small");
      if (!labelEl) {
        const text = (li.textContent || "").trim();
        if (text && text.toLowerCase().includes("last sold")) {
          info.lastSold = text;
        }
        return;
      }

      const label = labelEl.textContent.trim();
      const priceText = (li.textContent || "").replace(label, "").trim();
      const price = parsePriceString(priceText);

      if (price === null) {
        debugLog(
          "Skipping recent sales entry with unparsable price",
          priceText
        );
        return;
      }

      info.entries[label.toLowerCase()] = { label, value: price };
    });

    debugLog("Recent sales info parsed:", info);
    return info;
  }

  function getSuggestedPriceSources() {
    const { entries, lastSold } = getRecentSalesInfo();
    const averageEntry = entries.average || null;
    const averagePrice = averageEntry?.value ?? null;
    const suggestedPrice = getSuggestedPriceFromDOM();

    const result = {
      average: averagePrice,
      averageLabel: averageEntry?.label || "Average",
      suggested: suggestedPrice,
      lastSold,
    };

    debugLog("Suggested price sources prepared:", result);
    return result;
  }

  function roundToPsychological(price) {
    if (!Number.isFinite(price) || price <= 0) return null;

    if (price < 1) {
      const candidate = price < 0.89 ? 0.79 : 0.99;
      return parseFloat(candidate.toFixed(2));
    }

    const floor = Math.floor(price);
    const candidates = [floor + 0.79, floor + 0.99];
    if (floor > 0) candidates.push(floor - 1 + 0.99);

    let best = candidates[0];
    let bestDiff = Math.abs(candidates[0] - price);

    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (!Number.isFinite(candidate) || candidate <= 0) continue;
      const diff = Math.abs(candidate - price);
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }

    return parseFloat(best.toFixed(2));
  }

  function buildPsychologicalSeries(basePrice, percentages) {
    if (!Number.isFinite(basePrice) || basePrice <= 0) return [];
    const values = [];
    const seen = new Set();

    percentages.forEach((pct) => {
      const candidate = roundToPsychological(basePrice * pct);
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        values.push(candidate);
      }
    });

    return values;
  }

  function createSuggestionSection({
    title,
    subtitle,
    values,
    background,
    border,
    accent,
    footnote,
  }) {
    const section = document.createElement("div");
    Object.assign(section.style, {
      background,
      border,
      borderRadius: "8px",
      padding: "12px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    });

    const header = document.createElement("div");
    header.textContent = title;
    Object.assign(header.style, {
      fontWeight: "bold",
      fontSize: "15px",
      color: accent,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    });
    section.appendChild(header);

    if (subtitle) {
      const subtitleEl = document.createElement("div");
      subtitleEl.textContent = subtitle;
      Object.assign(subtitleEl.style, {
        fontSize: "13px",
        color: accent,
        opacity: 0.85,
      });
      section.appendChild(subtitleEl);
    }

    const buttonRow = document.createElement("div");
    Object.assign(buttonRow.style, {
      display: "flex",
      gap: "8px",
      flexWrap: "wrap",
    });

    values.forEach((value) => {
      const btn = document.createElement("button");
      Object.assign(btn.style, {
        flex: "1",
        minWidth: "70px",
        background: "white",
        border: `2px solid ${accent}`,
        borderRadius: "6px",
        padding: "8px 10px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "bold",
        color: accent,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        transition: "transform 0.1s ease",
      });

      btn.textContent = `$${value.toFixed(2)}`;

      btn.addEventListener("mouseenter", () => {
        btn.style.transform = "translateY(-1px)";
      });

      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "none";
      });

      btn.addEventListener("click", () => {
        setPriceAndSubmit(value);
      });

      buttonRow.appendChild(btn);
    });

    section.appendChild(buttonRow);

    if (footnote) {
      const footnoteEl = document.createElement("div");
      footnoteEl.textContent = footnote;
      Object.assign(footnoteEl.style, {
        fontSize: "12px",
        color: accent,
        opacity: 0.7,
      });
      section.appendChild(footnoteEl);
    }

    return section;
  }

  function updateSuggestedPrices(shouldShowSuggestions) {
    const box = document.getElementById("suggested-prices-box");
    const content = document.getElementById("suggested-prices-content");

    if (!box || !content) {
      debugLogError("Suggested prices container not found");
      return;
    }

    if (!shouldShowSuggestions) {
      // Completely hide the Suggested Prices box when not needed
      box.style.display = "none";
      return;
    }

    // Show brief loading state for suggested prices
    content.innerHTML = `<div style="text-align: center; padding: 10px;">
        <div style="width: 24px; height: 24px; border: 2px solid #f3f3f3;
             border-top: 2px solid #9b59b6; border-radius: 50%;
             margin: 0 auto; animation: spin 0.8s linear infinite;"></div>
      </div>`;

    // Small delay to show the loading animation before showing content
    setTimeout(() => {
      content.innerHTML = "";
      loadSuggestedPricesContent();
    }, 300);
  }

  function loadSuggestedPricesContent() {
    const content = document.getElementById("suggested-prices-content");
    if (!content) return;

    const box = document.getElementById("suggested-prices-box");

    // Only create sections if we actually want to show suggestions
    const { average, averageLabel, suggested, lastSold } =
      getSuggestedPriceSources();
    let hasSection = false;

    if (average) {
      const averageSuggestions = buildPsychologicalSeries(
        average,
        [0.95, 0.83, 0.67]
      );
      if (averageSuggestions.length) {
        debugLog("Average-based suggestion series:", averageSuggestions);
        const section = createSuggestionSection({
          title: "Recent Sales",
          subtitle: `${averageLabel} $${average.toFixed(2)}`,
          values: averageSuggestions,
          background: "linear-gradient(135deg, #fff8e1, #ffecb3)",
          border: "1px solid #ffe082",
          accent: "#b26a00",
          footnote: lastSold || null,
        });
        content.appendChild(section);
        hasSection = true;
      }
    }

    if (suggested) {
      const suggestedSeries = buildPsychologicalSeries(
        suggested,
        [0.96, 0.85, 0.64]
      );
      if (suggestedSeries.length) {
        debugLog("Suggested-button series:", suggestedSeries);
        const section = createSuggestionSection({
          title: "Discogs Suggested",
          subtitle: `Button shows $${suggested.toFixed(2)}`,
          values: suggestedSeries,
          background: "linear-gradient(135deg, #f3e5f5, #e1bee7)",
          border: "1px solid #d1c4e9",
          accent: "#6c5ce7",
          footnote: null,
        });
        content.appendChild(section);
        hasSection = true;
      }
    }

    if (!hasSection) {
      const defaultMessage = document.createElement("div");
      Object.assign(defaultMessage.style, {
        fontSize: "13px",
        color: "#6c757d",
        textAlign: "center",
        padding: "8px",
      });
      defaultMessage.textContent =
        "Pricing guidance not available from page data.";
      content.appendChild(defaultMessage);
      if (box) hideCollapsibleContent(box);
      return;
    }

    // Make the box visible and show its content
    if (box) {
      box.style.display = "block";
      showCollapsibleContent(box);
    }
  }

  function generateSinglePriceDisplay(data, containerId) {
    if (!data)
      return {
        html: '<div style="padding: 10px; text-align: center; color: #666;">No pricing data available</div>',
        prices: [],
      };

    const conditionText =
      data.mode === "media-only"
        ? "media condition"
        : data.useBetterConditionPricing
        ? "better media condition"
        : "same condition";

    let strategyBadge = "";
    if (data.mode === "media-only") {
      strategyBadge = `<div style="margin-bottom: 6px;"><span style="background: #9b59b6; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">🎵 MEDIA-ONLY</span></div>`;
    } else if (data.useBetterConditionPricing) {
      strategyBadge = `<div style="margin-bottom: 6px;"><span style="background: #4caf50; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">⭐ SMART PRICING</span></div>`;
    } else if (data.useMediaOnlyFallback) {
      strategyBadge = `<div style="margin-bottom: 6px;"><span style="background: #2196f3; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">MEDIA-BASED</span></div>`;
    }

    // Generate price buttons (simplified for dual mode)
    const pricePoints = getPsychologicalPricePoints(
      data.min,
      data.median,
      data.suggested
    );
    const colors = [
      "linear-gradient(135deg, #FF9F7F, #E74C3C)", // Red
      "linear-gradient(135deg, #F2994A, #E67E22)", // Orange
      "linear-gradient(135deg, #7AA7D3, #4A76A8)", // Blue
      "linear-gradient(135deg, #83c883, #52b752)", // Green
    ];

    // Store price info for event listeners
    const priceInfo = {
      suggested: data.suggested,
      buttons: pricePoints.slice(0, 4),
    };

    let priceButtonsHTML =
      '<div class="price-buttons-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 8px;">';
    pricePoints.slice(0, 4).forEach((price, index) => {
      priceButtonsHTML += `
          <button class="price-btn" data-price="${price}" style="
            background: ${colors[index]};
            color: white;
            border: none;
            border-radius: 4px;
            padding: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
          ">$${price.toFixed(2)}</button>
        `;
    });
    priceButtonsHTML += "</div>";

    const html = `
        <div style="padding: 8px;">
          ${strategyBadge}
          <div style="font-size: 12px; margin-bottom: 6px;">
            <b>${data.matchingListings}</b> listings with ${conditionText}
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
            <div style="text-align: center; background: #fff8e1; padding: 6px; border-radius: 4px;">
              <div style="font-size: 11px; color: #666;">Lowest</div>
              <div style="font-size: 14px; font-weight: bold;">$${data.min.toFixed(
                2
              )}</div>
            </div>
            <div style="text-align: center; background: #e8f4f8; padding: 6px; border-radius: 4px;">
              <div style="font-size: 11px; color: #666;">Median</div>
              <div style="font-size: 14px; font-weight: bold;">$${data.median.toFixed(
                2
              )}</div>
            </div>
          </div>
          ${
            data.minListing
              ? `<div style="font-size: 10px; color: #666; margin-bottom: 6px; padding: 4px; background: #f5f5f5; border-radius: 4px;">
                   📀 ${data.minListing.media} | ${data.minListing.sleeve}<br/>
                   👤 ${data.minListing.seller}
                 </div>`
              : ""
          }
          <div class="suggested-price-btn" data-price="${
            data.suggested
          }" style="text-align: center; background: linear-gradient(135deg, #83c883, #52b752); color: white; padding: 8px; border-radius: 6px; margin-bottom: 8px; cursor: pointer;">
            <div style="font-size: 12px;">SUGGESTED</div>
            <div style="font-size: 16px; font-weight: bold;">$${data.suggested.toFixed(
              2
            )}</div>
          </div>
          <div style="text-align: center; font-size: 10px; color: #666; margin-bottom: 8px; font-family: monospace; font-weight: bold;">[STEP] ${
            data.pricingStrategy || "exact-match"
          }</div>
          ${priceButtonsHTML}
        </div>
      `;

    return { html, priceInfo };
  }

  function updateOverlayPrices(data) {
    debugLog("Updating overlay prices with data:", data);
    const container = document.getElementById("price-info-container");
    if (!container) {
      debugLogError("Price info container not found");
      return;
    }

    container.innerHTML = "";

    // Handle dual mode - display two separate pricing boxes
    if (data && data.mode === "both") {
      debugLog("Rendering dual mode pricing boxes");

      // Create side-by-side container
      const dualContainer = document.createElement("div");
      Object.assign(dualContainer.style, {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px",
        width: "100%",
      });

      // Create left box for Full Condition pricing
      if (data.full) {
        const fullBox = document.createElement("div");
        Object.assign(fullBox.style, {
          border: "2px solid #2ecc71",
          borderRadius: "8px",
          background: "linear-gradient(135deg, #f0fff4, #e6fffa)",
        });

        const fullHeader = document.createElement("div");
        fullHeader.textContent = "🎯 Full Condition";
        Object.assign(fullHeader.style, {
          background: "#2ecc71",
          color: "white",
          padding: "8px",
          fontWeight: "bold",
          textAlign: "center",
          borderRadius: "6px 6px 0 0",
        });
        fullBox.appendChild(fullHeader);

        const fullContent = document.createElement("div");
        const fullDisplayData = generateSinglePriceDisplay(data.full, "full");
        fullContent.innerHTML = fullDisplayData.html;
        fullBox.appendChild(fullContent);
        dualContainer.appendChild(fullBox);

        // Add event listeners for full condition price buttons
        setTimeout(() => {
          const fullPriceButtons = fullContent.querySelectorAll(".price-btn");
          fullPriceButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
              const price = parseFloat(btn.dataset.price);
              debugLog(`Full condition price button clicked: $${price}`);
              setPriceAndSubmit(price);
            });
          });

          const fullSuggestedBtn = fullContent.querySelector(
            ".suggested-price-btn"
          );
          if (fullSuggestedBtn) {
            fullSuggestedBtn.addEventListener("click", () => {
              const price = parseFloat(fullSuggestedBtn.dataset.price);
              debugLog(`Full condition suggested price clicked: $${price}`);
              setPriceAndSubmit(price);
            });
          }
        }, 100);
      }

      // Create right box for Media-Only pricing
      if (data.mediaOnly) {
        const mediaBox = document.createElement("div");
        Object.assign(mediaBox.style, {
          border: "2px solid #9b59b6",
          borderRadius: "8px",
          background: "linear-gradient(135deg, #f4ecf7, #e8d5f2)",
        });

        const mediaHeader = document.createElement("div");
        mediaHeader.textContent = "🎵 Media Only";
        Object.assign(mediaHeader.style, {
          background: "#9b59b6",
          color: "white",
          padding: "8px",
          fontWeight: "bold",
          textAlign: "center",
          borderRadius: "6px 6px 0 0",
        });
        mediaBox.appendChild(mediaHeader);

        const mediaContent = document.createElement("div");
        const mediaDisplayData = generateSinglePriceDisplay(
          data.mediaOnly,
          "media"
        );
        mediaContent.innerHTML = mediaDisplayData.html;
        mediaBox.appendChild(mediaContent);
        dualContainer.appendChild(mediaBox);

        // Add event listeners for media-only price buttons
        setTimeout(() => {
          const mediaPriceButtons = mediaContent.querySelectorAll(".price-btn");
          mediaPriceButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
              const price = parseFloat(btn.dataset.price);
              debugLog(`Media-only price button clicked: $${price}`);
              setPriceAndSubmit(price);
            });
          });

          const mediaSuggestedBtn = mediaContent.querySelector(
            ".suggested-price-btn"
          );
          if (mediaSuggestedBtn) {
            mediaSuggestedBtn.addEventListener("click", () => {
              const price = parseFloat(mediaSuggestedBtn.dataset.price);
              debugLog(`Media-only suggested price clicked: $${price}`);
              setPriceAndSubmit(price);
            });
          }
        }, 100);
      }

      container.appendChild(dualContainer);

      // Always hide suggested prices and show price analysis for dual mode
      updateSuggestedPrices(false);
      const priceBox = document.getElementById("price-box");
      if (priceBox) {
        priceBox.style.display = "block";
        showCollapsibleContent(priceBox);
      }
      collapseActionBoxes();
      return;
    }

    if (!data) {
      // Only show suggested prices if BOTH media and sleeve grades have been selected
      // AND there's absolutely no price data (not even media-only matches)
      if (selectedMedia && selectedSleeve) {
        // Both grades selected but no price data at all - show suggested prices
        const priceBox = document.getElementById("price-box");
        if (priceBox) {
          hideCollapsibleContent(priceBox);
          priceBox.style.display = "none";
        }
        updateSuggestedPrices(true);
      } else {
        // Grades not fully selected - show default message in Price Analysis
        const messageBox = document.createElement("div");
        Object.assign(messageBox.style, {
          padding: "20px",
          textAlign: "center",
          color: "#6c757d",
        });

        const messageTitle = document.createElement("div");
        messageTitle.textContent = "Select media and sleeve grades";
        Object.assign(messageTitle.style, {
          fontSize: "16px",
          marginBottom: "10px",
        });
        messageBox.appendChild(messageTitle);

        const messageBody = document.createElement("div");
        messageBody.textContent = "Price data will appear here";
        Object.assign(messageBody.style, {
          fontSize: "14px",
        });
        messageBox.appendChild(messageBody);

        container.appendChild(messageBox);

        const priceBox = document.getElementById("price-box");
        if (priceBox) {
          priceBox.style.display = "block";
          showCollapsibleContent(priceBox);
        }
        updateSuggestedPrices(false);
      }
      return;
    }

    // Always hide suggested prices and show price analysis when we have data
    updateSuggestedPrices(false);

    // Show the Price Analysis box when we have data
    const priceBox = document.getElementById("price-box");
    if (priceBox) {
      priceBox.style.display = "block";
      showCollapsibleContent(priceBox);
    }

    // Keep Quick Set, Media, and Sleeve boxes collapsed when prices are shown
    collapseActionBoxes();

    // Main price display
    const priceDisplay = document.createElement("div");
    priceDisplay.className = "price-display";
    Object.assign(priceDisplay.style, {
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      padding: "10px",
    });

    // Stats row
    const statsRow = document.createElement("div");
    Object.assign(statsRow.style, {
      display: "flex",
      gap: "10px",
      justifyContent: "space-between",
      fontSize: "14px",
      color: "#6c757d",
      marginBottom: "5px",
    });
    const conditionText = data.useBetterConditionPricing
      ? "better media condition"
      : "same media condition";
    statsRow.innerHTML = `
        <div>Found <b>${data.matchingListings}</b> listings with ${conditionText}</div>
        <div><b>${data.competitionRatio}%</b> of market</div>
      `;
    priceDisplay.appendChild(statsRow);

    // Add source price info with pricing strategy indicators
    const sourceInfo = document.createElement("div");

    // Determine background color based on pricing strategy
    let backgroundColor = "#e8f4f8"; // Default blue
    if (data.useBetterConditionPricing) {
      backgroundColor = "#e8f5e8"; // Green for smart pricing
    } else if (data.useMediaOnlyFallback) {
      backgroundColor = "#fff3cd"; // Yellow for fallback
    }

    Object.assign(sourceInfo.style, {
      padding: "8px",
      background: backgroundColor,
      borderRadius: "4px",
      fontSize: "14px",
      marginBottom: "8px",
      textAlign: "center",
    });

    // Add strategy indicator badge
    let strategyIndicator = "";
    if (data.mode === "media-only") {
      strategyIndicator = `<div style="margin-bottom: 6px;"><span style="background: #9b59b6; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">🎵 MEDIA-ONLY MODE</span></div>`;
    } else if (data.useBetterConditionPricing) {
      strategyIndicator = `<div style="margin-bottom: 6px;"><span style="background: #4caf50; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">⭐ SMART PRICING</span></div>`;
    } else if (data.useMediaOnlyFallback) {
      strategyIndicator = `<div style="margin-bottom: 6px;"><span style="background: #2196f3; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">MEDIA-BASED PRICING</span></div>`;
    }

    debugLog(
      "About to render sourceInfo - data.minListing:",
      data.minListing
    );
    debugLog("Full data object:", data);

    sourceInfo.innerHTML = `
        ${strategyIndicator}
        <div><b>🔍 Base Price:</b> $${data.min.toFixed(2)} (USA only)</div>
        ${
          data.minListing
            ? `<div style="font-size: 12px; color: #666; margin-top: 4px; padding-left: 10px;">
                 📀 <b>Condition:</b> Media ${data.minListing.media} | Sleeve ${data.minListing.sleeve}<br/>
                 👤 <b>Seller:</b> ${data.minListing.seller}
               </div>`
            : ""
        }
        <div><b>💰 Suggested:</b> $${data.suggested.toFixed(2)}</div>
        ${
          data.useBetterConditionPricing
            ? '<div style="font-size: 12px; color: #4caf50; margin-top: 4px;">Undercutting better condition listings!</div>'
            : ""
        }
      `;

    debugLog("sourceInfo.innerHTML after render:", sourceInfo.innerHTML);
    priceDisplay.appendChild(sourceInfo);

    // Price grid
    const priceGrid = document.createElement("div");
    Object.assign(priceGrid.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px",
      marginBottom: "15px",
    });

    // Helper to create price tiles
    const priceTile = (
      label,
      value,
      bgColor,
      textColor = "black",
      large = false
    ) => {
      const tile = document.createElement("div");
      Object.assign(tile.style, {
        background: bgColor,
        padding: large ? "15px" : "10px",
        borderRadius: "6px",
        textAlign: "center",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        gridColumn: large ? "1 / span 2" : "auto",
        cursor: large ? "pointer" : "default",
      });

      const labelEl = document.createElement("div");
      labelEl.textContent = label;
      Object.assign(labelEl.style, {
        fontSize: large ? "16px" : "14px",
        fontWeight: "bold",
        marginBottom: "5px",
        color: textColor,
      });
      tile.appendChild(labelEl);

      const valueEl = document.createElement("div");
      valueEl.textContent = `$${value.toFixed(2)}`;
      Object.assign(valueEl.style, {
        fontSize: large ? "24px" : "18px",
        fontWeight: "bold",
        color: textColor,
      });
      tile.appendChild(valueEl);

      if (large) {
        debugLog(`Creating clickable price tile for $${value.toFixed(2)}`);
        tile.onclick = () => {
          setPriceAndSubmit(value);
        };
      }

      return tile;
    };

    priceGrid.appendChild(priceTile("Lowest", data.min, "#fff8e1"));
    priceGrid.appendChild(priceTile("Median", data.median, "#e8f4f8"));

    // Add suggested price (large tile spanning both columns)
    const suggestedTile = priceTile(
      "SUGGESTED PRICE",
      data.suggested,
      "linear-gradient(135deg, #83c883, #52b752)",
      "white",
      true
    );
    priceGrid.appendChild(suggestedTile);

    priceDisplay.appendChild(priceGrid);

    // Add pricing strategy label below the suggested price
    const strategyLabel = document.createElement("div");
    Object.assign(strategyLabel.style, {
      textAlign: "center",
      fontSize: "11px",
      color: "#666",
      marginTop: "8px",
      marginBottom: "8px",
      fontFamily: "monospace",
      fontWeight: "bold",
    });
    strategyLabel.textContent = `[STEP] ${data.pricingStrategy || "exact-match"}`;
    priceDisplay.appendChild(strategyLabel);

    // Create additional pricing options - two rows of price buttons
    const pricingContainer = document.createElement("div");
    Object.assign(pricingContainer.style, {
      marginTop: "10px",
    });

    // Generate dynamic price points based on the actual price data
    const pricePoints = getPsychologicalPricePoints(
      data.min,
      data.median,
      data.suggested
    );

    // Color gradients for the buttons
    const colors = [
      "linear-gradient(135deg, #FF9F7F, #E74C3C)", // Red
      "linear-gradient(135deg, #F2994A, #E67E22)", // Orange
      "linear-gradient(135deg, #7AA7D3, #4A76A8)", // Blue
      "linear-gradient(135deg, #83c883, #52b752)", // Green
      "linear-gradient(135deg, #B19CD9, #6C5CE7)", // Purple
      "linear-gradient(135deg, #81ECEC, #00CEC9)", // Teal
      "linear-gradient(135deg, #FD79A8, #E84393)", // Pink
      "linear-gradient(135deg, #A3CB38, #009432)", // Lime Green
      "linear-gradient(135deg, #FAD02E, #F39C12)", // Yellow
      "linear-gradient(135deg, #667EEA, #764BA2)", // Indigo
      "linear-gradient(135deg, #FF6B6B, #FF8E53)", // Coral
      "linear-gradient(135deg, #00B894, #00CEC9)", // Mint
    ];

    // Function to create a row of price buttons
    const createPriceRow = (prices, startIndex) => {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid",
        gridTemplateColumns: `repeat(${prices.length}, 1fr)`,
        gap: "8px",
        marginBottom: prices.length > 0 ? "8px" : "0",
      });

      prices.forEach((price, index) => {
        const priceBtn = document.createElement("button");
        Object.assign(priceBtn.style, {
          background: colors[startIndex + index],
          color: "white",
          border: "none",
          borderRadius: "6px",
          padding: "8px",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "bold",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        });
        priceBtn.innerHTML = `<b>$${price.toFixed(2)}</b>`;
        priceBtn.onclick = () => {
          setPriceAndSubmit(price);
        };
        row.appendChild(priceBtn);
      });

      return row;
    };

    // Create and add all rows (up to three rows of 4 buttons each)
    const maxButtonsPerRow = 4;
    const totalButtons = Math.min(pricePoints.length, 12); // Max 12 buttons total

    debugLog(
      `Creating price buttons: ${totalButtons} total buttons from ${pricePoints.length} price points`
    );

    // Directly create rows of exactly 4 buttons each
    for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
      const startIdx = rowIndex * maxButtonsPerRow;
      const rowPrices = pricePoints.slice(
        startIdx,
        startIdx + maxButtonsPerRow
      );

      if (rowPrices.length > 0) {
        debugLog(
          `Creating row ${rowIndex + 1} with ${
            rowPrices.length
          } buttons: ${rowPrices.join(", ")}`
        );
        pricingContainer.appendChild(createPriceRow(rowPrices, startIdx));
      }
    }

    // Add the pricing container to the price display
    priceDisplay.appendChild(pricingContainer);

    // Add details link
    const detailsLink = document.createElement("a");
    detailsLink.href = "#";
    detailsLink.textContent = "Show more details";
    detailsLink.id = "details-toggle-link";
    Object.assign(detailsLink.style, {
      fontSize: "14px",
      color: "#6c757d",
      textAlign: "center",
      marginTop: "10px",
      textDecoration: "none",
    });

    const detailsDiv = document.createElement("div");
    detailsDiv.id = "price-details";
    detailsDiv.style.display = "none";
    detailsDiv.style.marginTop = "10px";
    detailsDiv.style.fontSize = "14px";
    detailsDiv.style.padding = "10px";
    detailsDiv.style.background = "#f8f9fa";
    detailsDiv.style.borderRadius = "6px";

    let detailsHtml = `
        <div style="margin-bottom: 5px;"><b>Min:</b> $${data.min.toFixed(
          2
        )}</div>
        <div style="margin-bottom: 5px;"><b>Max:</b> $${data.max.toFixed(
          2
        )}</div>
        <div style="margin-bottom: 5px;"><b>Average:</b> $${data.avg.toFixed(
          2
        )}</div>
        <div style="margin-bottom: 5px;"><b>Median:</b> $${data.median.toFixed(
          2
        )}</div>
        <div style="margin-bottom: 5px;"><b>Listing count:</b> ${
          data.matchingListings
        }/${data.totalListings}</div>
        <div><b>Competition:</b> ${data.competitionRatio}% of market</div>
      `;

    // Add community stats if available
    if (communityStats) {
      detailsHtml += `
          <hr style="margin: 10px 0; border: none; border-top: 1px solid #ddd;">
          <div style="margin-bottom: 5px;"><b>Have count:</b> ${(
            communityStats.num_have || 0
          ).toLocaleString()}</div>
          <div style="margin-bottom: 5px;"><b>Want count:</b> ${(
            communityStats.num_want || 0
          ).toLocaleString()}</div>
          <div style="margin-bottom: 5px;"><b>Rating:</b> ${
            communityStats.rating?.average?.toFixed(2) || "N/A"
          }/5 (${communityStats.rating?.count || 0} votes)</div>
        `;
    }

    detailsDiv.innerHTML = detailsHtml;

    detailsLink.onclick = (e) => {
      e.preventDefault();
      const detailsVisible = detailsDiv.style.display !== "none";

      // If details are currently visible (about to be hidden)
      if (detailsVisible) {
        detailsDiv.style.display = "none";
        detailsLink.textContent = "Show more details";
      }
      // If details are currently hidden (about to be shown)
      else {
        detailsDiv.style.display = "block";
        detailsLink.textContent = "Hide details";
      }
    };

    priceDisplay.appendChild(detailsLink);
    priceDisplay.appendChild(detailsDiv);

    container.appendChild(priceDisplay);
    debugLog("Price display updated successfully");
  }

  function showCollapsibleContent(boxElement) {
    if (!boxElement) return;

    const header = boxElement.querySelector(".collapsible-header");
    const content = boxElement.querySelector(".collapsible-content");

    if (content && content.style.display === "none") {
      content.style.display = "block";
      if (header) {
        header.style.borderBottom = "1px solid #ddd";
        const arrow = header.querySelector(".arrow-icon");
        if (arrow) arrow.textContent = "▲";
      }
    }
  }

  function hideCollapsibleContent(boxElement) {
    if (!boxElement) return;

    const header = boxElement.querySelector(".collapsible-header");
    const content = boxElement.querySelector(".collapsible-content");

    if (content && content.style.display !== "none") {
      content.style.display = "none";
      if (header) {
        header.style.borderBottom = "none";
        const arrow = header.querySelector(".arrow-icon");
        if (arrow) arrow.textContent = "▼";
      }
    }
  }

  function collapseActionBoxes() {
    const quickSetBox = document.getElementById("quick-set-box");
    const mediaBox = document.getElementById("media-grade-box");
    const sleeveBox = document.getElementById("sleeve-grade-box");

    hideCollapsibleContent(quickSetBox);
    hideCollapsibleContent(mediaBox);
    hideCollapsibleContent(sleeveBox);
  }

  function setupKeyComboListener() {
    debugLog("Setting up key combo listener");
    const keys = new Set();
    const trigger = (media, sleeve, label) => {
      debugLog("Key combo triggered", { media, sleeve, label });
      if (media) applyGrade("media_condition", gradeMap[media]);
      if (sleeve) applyGrade("sleeve_condition", gradeMap[sleeve]);
      showFlash();
      showToast(label);
    };

    window.addEventListener("keydown", (e) => {
      keys.add(e.key.toLowerCase());
      if (!e.ctrlKey || !e.shiftKey) return;

      const k = e.key.toLowerCase();
      debugLog("Key combo detected", {
        key: k,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
      });

      switch (k) {
        case "q":
          trigger("F", null, "Set Media: F");
          break;
        case "w":
          trigger(null, "F", "Set Sleeve: F");
          break;
        case "r":
          trigger("F", "F", "Set Both: F");
          break;
        case "a":
          trigger("G", null, "Set Media: G");
          break;
        case "b":
          trigger(null, "G", "Set Sleeve: G");
          break;
        case "c":
          trigger("G+", null, "Set Media: G+");
          break;
        case "d":
          trigger(null, "G+", "Set Sleeve: G+");
          break;
        case "e":
          trigger("VG", null, "Set Media: VG");
          break;
        case "f":
          trigger(null, "VG", "Set Sleeve: VG");
          break;
        case "g":
          trigger("VG", "VG", "Set Both: VG");
          break;
        case "h":
          trigger("VG+", null, "Set Media: VG+");
          break;
        case "i":
          trigger(null, "VG+", "Set Sleeve: VG+");
          break;
        case "j":
          trigger("VG+", "VG+", "Set Both: VG+");
          break;
        case "k":
          trigger("NM", null, "Set Media: NM");
          break;
        case "l":
          trigger(null, "NM", "Set Sleeve: NM");
          break;
        case "m":
          trigger("NM", "VG+", "Set NM / VG+");
          break;
        case "n":
          trigger("M", null, "Set Media: Mint");
          break;
        case "o":
          trigger(null, "M", "Set Sleeve: Mint");
          break;
        case "p":
          trigger("M", "NM", "Set Mint/Near Mint (Sealed)");
          break;
      }
    });

    window.addEventListener("keyup", (e) => {
      keys.delete(e.key.toLowerCase());
    });
  }

  function detectFormatFromPage() {
    debugLog("Starting format detection...");

    // Try multiple detection methods
    let detectedFormat = null;

    // Method 1: Check the page's main title and format-specific areas
    const pageTitle = document.querySelector("h1")?.textContent || "";
    debugLog("Page title:", pageTitle);

    // Method 2: Look for specific format elements (more targeted)
    const formatDivs = document.querySelectorAll("div, span, td");
    let formatText = "";
    formatDivs.forEach((div) => {
      const text = div.textContent || "";
      // Look for format indicators in smaller chunks to avoid false positives
      if (
        text.match(/Format\s*:/i) ||
        text.match(/\b\d+['"\u2019\u201D]?\s*(inch|LP|EP|Single)/i) ||
        text.match(/\b\d+(\.\d+|½)?['"\u2019\u201D][,\s]/i) ||
        text.match(/\b(45|33|78)\s*RPM/i) ||
        text.match(/\bShellac\b/i)
      ) {
        formatText += " " + text;
      }
    });

    debugLog("Format text found:", formatText);

    // Method 3: Check catalog number patterns (like your example "ARL2-1757")
    const catalogText = pageTitle + " " + formatText;

    // Combined text to search (more focused)
    const combinedText = pageTitle + " " + formatText;

    // PRIORITY 1: Check for multi-LP indicators first (these should NEVER be singles)
    if (
      combinedText.match(
        /\b(2x|3x|4x|5x|6x)LP\b|2\s*LP|3\s*LP|4\s*LP|5\s*LP|6\s*LP|\bBox\s*Set\b|\bDouble\s*LP\b|\bTriple\s*LP\b/i
      )
    ) {
      debugLog(
        "Detected as LP based on multi-LP indicators (2xLP, Box Set, etc.)"
      );
      detectedFormat = "lp";
    }
    // PRIORITY 2: Check for shellac and 78 RPM records (dedicated shellac mode)
    else if (combinedText.match(/\bShellac\b|78\s*RPM\b|\b78\b/i)) {
      debugLog("Detected as SHELLAC based on Shellac/78 RPM");
      detectedFormat = "shellac";
    }
    // PRIORITY 3: Check for 10" records (always LP mode - includes shellac 78s and regular 10" LPs)
    else if (combinedText.match(/\b10['"\u2019\u201D]|10\s*inch|10-inch/i)) {
      debugLog('Detected as LP based on 10" size');
      detectedFormat = "lp";
    }
    // PRIORITY 4: Check for small format singles (under 10" - includes 5", 6", 6½", 7", 8", 9")
    else if (combinedText.match(/\b([5-9](\.\d+|½)?|6\.5)['"\u2019\u201D\u0022]|([5-9](\.\d+|½)?|6\.5)\s*inch|([5-9](\.\d+|½)?|6\.5)-inch|([5-9](\.\d+|½)?|6\.5)\\"|([5-9](\.\d+|½)?|6\.5)\s*,/i)) {
      // Additional check: make sure it's not a box set
      if (!combinedText.match(/box|set/i)) {
        debugLog('Detected as SINGLE based on small format (under 10")');
        detectedFormat = "single";
      } else {
        debugLog('Found small format but with box/set - treating as LP');
        detectedFormat = "lp";
      }
    }
    // PRIORITY 5: Check for 45 RPM (usually singles, but not always)
    else if (combinedText.match(/\b45\s*RPM\b/i)) {
      // Additional check: 45 RPM + 12" = 12" single (treat as LP for pricing)
      if (combinedText.match(/\b12['"\u2019\u201D]|12\s*inch|12-inch/i)) {
        debugLog('Detected 45 RPM + 12" - treating as LP');
        detectedFormat = "lp";
      } else {
        debugLog("Detected as SINGLE based on 45 RPM");
        detectedFormat = "single";
      }
    }
    // PRIORITY 6: Check for explicit single/EP mentions (but be careful)
    else if (combinedText.match(/\bEP\b/i)) {
      debugLog("Detected as SINGLE based on EP");
      detectedFormat = "single";
    }
    // PRIORITY 7: Check for 12" LPs (physical size and RPM indicators)
    else if (
      combinedText.match(
        /\b12['"\u2019\u201D]|12\s*inch|12-inch|33\s*⅓|33\.3|33\s*RPM|\bLP\b|Long\s*Play/i
      )
    ) {
      debugLog('Detected as LP based on 12"/33 RPM/LP');
      detectedFormat = "lp";
    }
    // PRIORITY 8: Check for "album" keyword (lower priority than size-based detection)
    else if (combinedText.match(/\balbum\b/i)) {
      // Only treat as LP if we didn't detect a small format (under 10")
      // This prevents "7" Album" from being misclassified as LP
      if (!combinedText.match(/\b[5-9](\.\d+|½)?['"\u2019\u201D\u0022]|[5-9](\.\d+|½)?\s*inch/i)) {
        debugLog('Detected as LP based on "album" keyword (no small format detected)');
        detectedFormat = "lp";
      } else {
        debugLog('Found "album" keyword but small format detected - treating as SINGLE');
        detectedFormat = "single";
      }
    }

    // Method 4: Check URL for clues (but only if no format detected yet)
    const urlPath = window.location.pathname;
    debugLog("URL path:", urlPath);
    if (!detectedFormat) {
      if (urlPath.match(/7-inch|7"|45/i) && !urlPath.match(/box|set/i)) {
        debugLog("Detected as SINGLE from URL");
        detectedFormat = "single";
      } else if (urlPath.match(/12-inch|12"|LP|album/i)) {
        debugLog("Detected as LP from URL");
        detectedFormat = "lp";
      }
    }

    // Method 5: Fallback - if we see "single" in isolation but no size info, be cautious
    if (!detectedFormat && combinedText.match(/\bsingle\b/i)) {
      // Only treat as single if we don't see any LP indicators
      if (!combinedText.match(/\bLP\b|\balbum\b|\bbox\b/i)) {
        debugLog("Detected as SINGLE based on 'single' mention (fallback)");
        detectedFormat = "single";
      }
    }

    debugLog("Final detected format:", detectedFormat || "none");
    return detectedFormat;
  }

  function waitForElements() {
    debugLog("Waiting for UI elements to load");
    const interval = setInterval(() => {
      const ids = [
        "media_condition",
        "sleeve_condition",
        "quantity",
        "accept_offer",
        "price",
      ];
      const missingElements = ids.filter((id) => !document.getElementById(id));

      if (missingElements.length === 0) {
        debugLog("All UI elements found, creating overlay");
        clearInterval(interval);

        // Auto-detect format and set mode accordingly
        const detectedFormat = detectFormatFromPage();
        if (detectedFormat) {
          debugLog("Auto-detected format:", detectedFormat);
          if (detectedFormat === "single") {
            recordMode = "single";
            showToast("Auto-detected: Single format - Single Mode active");
          } else if (detectedFormat === "lp") {
            recordMode = "lp";
            showToast("Auto-detected: LP format - LP Mode active");
          } else if (detectedFormat === "shellac") {
            recordMode = "shellac";
            showToast("Auto-detected: Shellac format - Shellac Mode active");
          }
        } else {
          // If no format detected, default to LP mode
          debugLog("No format auto-detected, using default LP mode");
          recordMode = "lp";
        }

        createOverlay();
        setupKeyComboListener();

        // Apply initial visibility settings and button sizes after overlay is created
        setTimeout(() => {
          const quickSetBox = document.getElementById("quick-set-box");
          const sleeveGradeBox = document.getElementById("sleeve-grade-box");

          if (quickSetBox) {
            quickSetBox.style.display =
              recordMode === "single" || recordMode === "shellac"
                ? "none"
                : "block";
          }
          if (sleeveGradeBox) {
            sleeveGradeBox.style.display =
              recordMode === "single" || recordMode === "shellac"
                ? "none"
                : "block";
          }

          // Update grade button sizes based on initial mode
          const mediaGradeBox = document.getElementById("media-grade-box");
          if (mediaGradeBox) {
            const buttons = mediaGradeBox.querySelectorAll("button");
            buttons.forEach((btn) => {
              const grade = btn.textContent;
              const isSmaller =
                recordMode !== "single" &&
                recordMode !== "shellac" &&
                (grade === "P" ||
                  grade === "F" ||
                  grade === "NM" ||
                  grade === "M");
              btn.style.fontSize = isSmaller ? "16px" : "20px";
              btn.style.padding = isSmaller ? "5px" : "10px";
            });
          }
        }, 100);
      } else {
        debugLog("Still waiting for elements:", missingElements);
      }
    }, 300);
  }

  function createCollapsibleBox(title, content, isCollapsed = true, id = null) {
    const box = document.createElement("div");
    if (id) box.id = id;

    Object.assign(box.style, {
      background: "white",
      border: "2px solid black",
      borderRadius: "10px",
      boxShadow: "0 0 6px rgba(0,0,0,0.3)",
      marginBottom: "10px",
      overflow: "hidden",
    });

    const header = document.createElement("div");
    header.className = "collapsible-header";
    Object.assign(header.style, {
      padding: "10px",
      fontWeight: "bold",
      cursor: "pointer",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: isCollapsed ? "none" : "1px solid #ddd",
      background: "#f5f5f5",
    });

    const arrowSpan = document.createElement("span");
    arrowSpan.className = "arrow-icon";
    arrowSpan.textContent = isCollapsed ? "▼" : "▲";
    arrowSpan.style.fontSize = "18px";

    header.innerHTML = `<span>${title}</span>`;
    header.appendChild(arrowSpan);

    const contentDiv = document.createElement("div");
    contentDiv.className = "collapsible-content";
    Object.assign(contentDiv.style, {
      padding: "10px",
      display: isCollapsed ? "none" : "block",
    });
    contentDiv.appendChild(content);

    header.onclick = () => {
      const isHidden = contentDiv.style.display === "none";
      contentDiv.style.display = isHidden ? "block" : "none";
      header.style.borderBottom = isHidden ? "1px solid #ddd" : "none";
      arrowSpan.textContent = isHidden ? "▲" : "▼";
    };

    box.appendChild(header);
    box.appendChild(contentDiv);
    return box;
  }

  function createGradeButtonsGrid(grades, onClick) {
    const grid = document.createElement("div");
    Object.assign(grid.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px",
    });

    // Add all grades in a 2-column grid layout
    for (let i = 0; i < grades.length; i++) {
      const grade = grades[i];
      const btn = document.createElement("button");
      btn.textContent = grade;

      // In single mode, make all buttons the same larger size
      // Otherwise, make P, F, NM, M buttons smaller
      const isSmaller =
        recordMode !== "single" &&
        (grade === "P" || grade === "F" || grade === "NM" || grade === "M");

      Object.assign(btn.style, {
        fontSize: isSmaller ? "16px" : "20px",
        padding: isSmaller ? "5px" : "10px",
        border: "none",
        color: grade === "NM" || grade === "M" ? "black" : "white",
        borderRadius: "6px",
        cursor: "pointer",
        background: gradeColors[grade],
      });
      btn.onclick = () => onClick(grade);
      grid.appendChild(btn);
    }

    return grid;
  }

  function createQuickSetBox() {
    const boxContent = document.createElement("div");

    // First row: NM+VG+ and Mint (swapped)
    const topRow = document.createElement("div");
    Object.assign(topRow.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px",
      marginBottom: "8px",
    });

    // NM+VG+ button (now first) - smaller size like NM/M
    const nmVgpBtn = document.createElement("button");
    nmVgpBtn.textContent = "NM+VG+";
    Object.assign(nmVgpBtn.style, {
      fontSize: "16px", // smaller like NM/M
      padding: "5px", // smaller like NM/M
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      color: "black",
      backgroundColor: "#82e0aa",
    });
    nmVgpBtn.onclick = () => {
      debugLog("Quick set button clicked: NM+VG+");
      applyGrade("media_condition", gradeMap["NM"]);
      applyGrade("sleeve_condition", gradeMap["VG+"]);
    };
    topRow.appendChild(nmVgpBtn);

    // Mint button (now second) - smaller size like NM/M
    const mintBtn = document.createElement("button");
    mintBtn.textContent = "Mint";
    Object.assign(mintBtn.style, {
      fontSize: "16px", // smaller like NM/M
      padding: "5px", // smaller like NM/M
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      color: "black",
      backgroundColor: "#ffd700",
    });
    mintBtn.onclick = () => {
      debugLog("Quick set button clicked: Mint");
      applyGrade("media_condition", gradeMap["M"]);
      applyGrade("sleeve_condition", gradeMap["NM"]);
    };
    topRow.appendChild(mintBtn);

    boxContent.appendChild(topRow);

    // Second row: VG and VG+ (swapped)
    const secondRow = document.createElement("div");
    Object.assign(secondRow.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px",
      marginBottom: "8px",
    });

    // VG button (now first) - bigger size like main grades
    const vgBtn = document.createElement("button");
    vgBtn.textContent = "VG";
    Object.assign(vgBtn.style, {
      fontSize: "20px", // bigger like main grades
      padding: "10px", // bigger like main grades
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      color: "black",
      backgroundColor: "#f1c40f",
    });
    vgBtn.onclick = () => {
      debugLog("Quick set button clicked: VG");
      applyGrade("media_condition", gradeMap["VG"]);
      applyGrade(
        "sleeve_condition",
        recordMode === "single" || recordMode === "shellac"
          ? "Generic"
          : gradeMap["VG"]
      );
    };
    secondRow.appendChild(vgBtn);

    // VG+ button (now second) - bigger size like main grades
    const vgPlusBtn = document.createElement("button");
    vgPlusBtn.textContent = "VG+";
    Object.assign(vgPlusBtn.style, {
      fontSize: "20px", // bigger like main grades
      padding: "10px", // bigger like main grades
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      color: "black",
      backgroundColor: "#2ecc71",
    });
    vgPlusBtn.onclick = () => {
      debugLog("Quick set button clicked: VG+");
      applyGrade("media_condition", gradeMap["VG+"]);
      applyGrade(
        "sleeve_condition",
        recordMode === "single" || recordMode === "shellac"
          ? "Generic"
          : gradeMap["VG+"]
      );
    };
    secondRow.appendChild(vgPlusBtn);

    boxContent.appendChild(secondRow);

    // Third row for VG combinations (2 buttons)
    const vgMixedRow = document.createElement("div");
    Object.assign(vgMixedRow.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px",
      marginBottom: "8px",
    });

    // VG media with VG+ sleeve - bigger size like main grades
    const vgVgpBtn = document.createElement("button");
    vgVgpBtn.textContent = "VG/VG+";
    Object.assign(vgVgpBtn.style, {
      fontSize: "20px", // bigger like main grades
      padding: "10px", // bigger like main grades
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      color: "black",
      background: "linear-gradient(to right, #f1c40f 50%, #2ecc71 50%)",
    });
    vgVgpBtn.onclick = () => {
      debugLog("Quick set button clicked: VG/VG+");
      applyGrade("media_condition", gradeMap["VG"]);
      applyGrade("sleeve_condition", gradeMap["VG+"]);
    };
    vgMixedRow.appendChild(vgVgpBtn);

    // VG+ media with VG sleeve - bigger size like main grades
    const vgpVgBtn = document.createElement("button");
    vgpVgBtn.textContent = "VG+/VG";
    Object.assign(vgpVgBtn.style, {
      fontSize: "20px", // bigger like main grades
      padding: "10px", // bigger like main grades
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      color: "black",
      background: "linear-gradient(to right, #2ecc71 50%, #f1c40f 50%)",
    });
    vgpVgBtn.onclick = () => {
      debugLog("Quick set button clicked: VG+/VG");
      applyGrade("media_condition", gradeMap["VG+"]);
      applyGrade("sleeve_condition", gradeMap["VG"]);
    };
    vgMixedRow.appendChild(vgpVgBtn);

    boxContent.appendChild(vgMixedRow);

    // Fourth row for G+ combinations (2 buttons)
    const gpMixedRow = document.createElement("div");
    Object.assign(gpMixedRow.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px",
    });

    // G+ media with VG sleeve - smaller size like P/F/NM/M
    const gpVgBtn = document.createElement("button");
    gpVgBtn.textContent = "G+/VG";
    Object.assign(gpVgBtn.style, {
      fontSize: "16px", // smaller like P/F/NM/M
      padding: "5px", // smaller like P/F/NM/M
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      color: "black",
      background: "linear-gradient(to right, #e67e22 50%, #f1c40f 50%)",
    });
    gpVgBtn.onclick = () => {
      debugLog("Quick set button clicked: G+/VG");
      applyGrade("media_condition", gradeMap["G+"]);
      applyGrade("sleeve_condition", gradeMap["VG"]);
    };
    gpMixedRow.appendChild(gpVgBtn);

    // G+ for both - smaller size like P/F/NM/M
    const gpGpBtn = document.createElement("button");
    gpGpBtn.textContent = "G+";
    Object.assign(gpGpBtn.style, {
      fontSize: "16px", // smaller like P/F/NM/M
      padding: "5px", // smaller like P/F/NM/M
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      color: "black",
      backgroundColor: "#e67e22",
    });
    gpGpBtn.onclick = () => {
      debugLog("Quick set button clicked: G+/G+");
      applyGrade("media_condition", gradeMap["G+"]);
      applyGrade(
        "sleeve_condition",
        recordMode === "single" || recordMode === "shellac"
          ? "Generic"
          : gradeMap["G+"]
      );
    };
    gpMixedRow.appendChild(gpGpBtn);

    boxContent.appendChild(gpMixedRow);

    return boxContent;
  }

  function createOverlay() {
    debugLog("Creating overlay UI");
    if (document.getElementById("grading-overlay")) {
      debugLog("Overlay already exists, skipping creation");
      return;
    }

    // Left side container for 45/LP mode toggle
    const leftContainer = document.createElement("div");
    leftContainer.id = "mode-toggle-container";
    Object.assign(leftContainer.style, {
      position: "fixed",
      top: "20px",
      left: "20px",
      zIndex: "10000",
      width: "200px",
      fontSize: "16px",
    });

    // Record Mode toggle box (open by default)
    const modeToggleDiv = document.createElement("div");
    modeToggleDiv.innerHTML = `
        <div style="display: flex; gap: 4px; flex-direction: column;">
          <button id="lp-mode-btn" style="padding: 8px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: ${
            recordMode === "lp" ? "#2ecc71" : "#e0e0e0"
          }; color: ${recordMode === "lp" ? "white" : "#666"};">
            LP Mode
          </button>
          <button id="single-mode-btn" style="padding: 8px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: ${
            recordMode === "single" ? "#2ecc71" : "#e0e0e0"
          }; color: ${recordMode === "single" ? "white" : "#666"};">
            Single Mode
          </button>
          <button id="picture-sleeve-mode-btn" style="padding: 8px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: ${
            recordMode === "single-picture" ? "#2ecc71" : "#e0e0e0"
          }; color: ${recordMode === "single-picture" ? "white" : "#666"};">
            Picture Sleeve
          </button>
          <button id="shellac-mode-btn" style="padding: 8px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: ${
            recordMode === "shellac" ? "#8B4513" : "#e0e0e0"
          }; color: ${recordMode === "shellac" ? "white" : "#666"};">
            🎵 Shellac Mode
          </button>
        </div>
      `;
    leftContainer.appendChild(
      createCollapsibleBox(
        "🎵 Record Mode (v10.3)",
        modeToggleDiv,
        false,
        "mode-toggle-box"
      )
    );

    // Pricing Mode toggle box with three options
    const pricingModeDiv = document.createElement("div");
    pricingModeDiv.style.marginTop = "10px";

    const pricingModeContent = document.createElement("div");
    pricingModeContent.innerHTML = `
        <div style="display: flex; gap: 4px; flex-direction: column;">
          <button id="full-pricing-btn" style="padding: 8px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: ${
            pricingMode === "full" ? "#2ecc71" : "#e0e0e0"
          }; color: ${pricingMode === "full" ? "white" : "#666"};">
            🎯 Full Condition
          </button>
          <button id="media-only-pricing-btn" style="padding: 8px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: ${
            pricingMode === "media-only" ? "#9b59b6" : "#e0e0e0"
          }; color: ${pricingMode === "media-only" ? "white" : "#666"};">
            🎵 Media Only
          </button>
          <button id="both-pricing-btn" style="padding: 8px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: ${
            pricingMode === "both" ? "#e74c3c" : "#e0e0e0"
          }; color: ${pricingMode === "both" ? "white" : "#666"};">
            📊 Show Both
          </button>
        </div>
      `;

    // Create help text
    const helpText = document.createElement("div");
    helpText.innerHTML = `
        <div style="font-size: 11px; color: #666; padding: 5px; background: #f8f9fa; border-radius: 4px; line-height: 1.3; margin-top: 6px;">
          <b>Full:</b> Uses both media + sleeve for exact matches<br>
          <b>Media Only:</b> Ignores sleeve, uses only media condition<br>
          <b>Show Both:</b> Displays both strategies side by side
        </div>
      `;
    pricingModeContent.appendChild(helpText);

    // Determine box title and styling based on state
    let pricingBoxTitle = "🎯 Pricing Mode";
    let isActive = pricingMode !== "full";

    if (pricingMode === "media-only") {
      pricingBoxTitle = "🎵 MEDIA-ONLY ACTIVE";
    } else if (pricingMode === "both") {
      pricingBoxTitle = "📊 DUAL MODE ACTIVE";
    }

    const pricingModeBox = createCollapsibleBox(
      pricingBoxTitle,
      pricingModeContent,
      !isActive,
      "pricing-mode-box"
    );

    // Add bright border when non-default mode is active
    if (pricingMode === "media-only") {
      pricingModeBox.style.border = "3px solid #9b59b6";
      pricingModeBox.style.boxShadow = "0 0 20px rgba(155, 89, 182, 0.3)";
      pricingModeBox.style.background =
        "linear-gradient(135deg, #f4ecf7, #e8d5f2)";
    } else if (pricingMode === "both") {
      pricingModeBox.style.border = "3px solid #e74c3c";
      pricingModeBox.style.boxShadow = "0 0 20px rgba(231, 76, 60, 0.3)";
      pricingModeBox.style.background =
        "linear-gradient(135deg, #fdf2f2, #fecaca)";
    }

    leftContainer.appendChild(pricingModeBox);

    // Auto-fill options box (only show when Single mode is selected, not Picture Sleeve mode)
    const autoFillDiv = document.createElement("div");
    autoFillDiv.id = "autofill-options-box-wrapper";
    autoFillDiv.style.display = recordMode === "single" ? "block" : "none";
    autoFillDiv.style.marginTop = "10px";

    const autoFillContent = document.createElement("div");
    Object.assign(autoFillContent.style, {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    });

    // Create toggle buttons with bright highlighting when active
    const createAutoFillButton = (id, icon, text, enabled) => {
      const btn = document.createElement("button");
      btn.id = id;
      btn.innerHTML = `${icon} ${text}`;
      Object.assign(btn.style, {
        padding: "10px",
        border: enabled ? "3px solid #ff6b35" : "2px solid transparent",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: enabled ? "bold" : "normal",
        fontSize: enabled ? "16px" : "14px",
        background: enabled
          ? "linear-gradient(135deg, #ff6b35, #f7931e)"
          : "#e0e0e0",
        color: enabled ? "white" : "#666",
        transition: "all 0.3s ease",
        boxShadow: enabled ? "0 4px 15px rgba(255, 107, 53, 0.4)" : "none",
        transform: enabled ? "scale(1.05)" : "scale(1)",
      });
      return btn;
    };

    const companySleeve = createAutoFillButton(
      "toggle-autofill-comments",
      "💬",
      "Company sleeve",
      autoFillCommentsEnabled
    );
    const djJacket = createAutoFillButton(
      "toggle-autofill-dj",
      "🎧",
      '12" DJ jacket',
      autoFillDJSleeveEnabled
    );

    autoFillContent.appendChild(companySleeve);
    autoFillContent.appendChild(djJacket);

    // Check if any auto-fill is enabled to determine box state
    const anyAutoFillEnabled =
      autoFillCommentsEnabled || autoFillDJSleeveEnabled;
    const boxTitle = anyAutoFillEnabled
      ? "⚠️ AUTO-FILL ACTIVE"
      : "💬 Auto-fill Options";

    const autoFillBox = createCollapsibleBox(
      boxTitle,
      autoFillContent,
      !anyAutoFillEnabled,
      "autofill-box"
    );

    // Add bright border when any auto-fill is active
    if (anyAutoFillEnabled) {
      const boxElement = autoFillBox;
      boxElement.style.border = "3px solid #ff6b35";
      boxElement.style.boxShadow = "0 0 20px rgba(255, 107, 53, 0.3)";
      boxElement.style.background = "linear-gradient(135deg, #fff3e0, #ffe0b2)";
    }

    autoFillDiv.appendChild(autoFillBox);
    leftContainer.appendChild(autoFillDiv);

    document.body.appendChild(leftContainer);

    // Main container (right side)
    const container = document.createElement("div");
    container.id = "grading-overlay";
    Object.assign(container.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "10000",
      width: "300px",
      fontSize: "16px",
    });

    // Quick Set box (new, separate box for quick set options)
    container.appendChild(
      createCollapsibleBox(
        "⚡ Quick Set",
        createQuickSetBox(),
        false,
        "quick-set-box"
      )
    );

    // Media Grade box (now without quick set options)
    const mediaGrid = createGradeButtonsGrid(grades, (grade) => {
      debugLog(`Media grade button clicked: ${grade}`);
      applyGrade("media_condition", gradeMap[grade]);
      if (recordMode === "single" || recordMode === "shellac")
        applyGrade("sleeve_condition", "Generic");
    });
    container.appendChild(
      createCollapsibleBox("Media Grade", mediaGrid, false, "media-grade-box")
    );

    // Sleeve Grade box (collapsible, open by default)
    const sleeveGrid = createGradeButtonsGrid(grades, (grade) => {
      debugLog(`Sleeve grade button clicked: ${grade}`);
      applyGrade("sleeve_condition", gradeMap[grade]);
    });
    container.appendChild(
      createCollapsibleBox(
        "Sleeve Grade",
        sleeveGrid,
        false,
        "sleeve-grade-box"
      )
    );

    // Price info box
    const priceInfo = document.createElement("div");
    priceInfo.id = "price-info-container";
    priceInfo.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #6c757d;">
          <div style="font-size: 16px; margin-bottom: 10px;">Select media and sleeve grades</div>
          <div style="font-size: 14px;">Price data will appear here</div>
        </div>
      `;
    container.appendChild(
      createCollapsibleBox("Price Analysis", priceInfo, false, "price-box")
    );

    const suggestedContent = document.createElement("div");
    suggestedContent.id = "suggested-prices-content";
    suggestedContent.innerHTML = `
        <div style="padding: 12px; font-size: 13px; color: #6c757d; text-align: center;">
          Additional suggestions will appear when no matching listings are found.
        </div>
      `;
    container.appendChild(
      createCollapsibleBox(
        "Suggested Prices",
        suggestedContent,
        true,
        "suggested-prices-box"
      )
    );

    document.body.appendChild(container);
    debugLog("Overlay UI created and added to document");

    updateSuggestedPrices(false);

    // Set up event listeners for mode toggle buttons
    const lpModeBtn = document.getElementById("lp-mode-btn");
    const singleModeBtn = document.getElementById("single-mode-btn");
    const pictureSleeveBtn = document.getElementById("picture-sleeve-mode-btn");
    const shellacModeBtn = document.getElementById("shellac-mode-btn");

    const updateModeButtons = () => {
      // Update button styles
      lpModeBtn.style.background = recordMode === "lp" ? "#2ecc71" : "#e0e0e0";
      lpModeBtn.style.color = recordMode === "lp" ? "white" : "#666";

      singleModeBtn.style.background =
        recordMode === "single" ? "#2ecc71" : "#e0e0e0";
      singleModeBtn.style.color = recordMode === "single" ? "white" : "#666";

      pictureSleeveBtn.style.background =
        recordMode === "single-picture" ? "#2ecc71" : "#e0e0e0";
      pictureSleeveBtn.style.color =
        recordMode === "single-picture" ? "white" : "#666";

      shellacModeBtn.style.background =
        recordMode === "shellac" ? "#8B4513" : "#e0e0e0";
      shellacModeBtn.style.color = recordMode === "shellac" ? "white" : "#666";

      // Show auto-fill options only for single mode (not picture sleeve or shellac mode)
      document.getElementById("autofill-options-box-wrapper").style.display =
        recordMode === "single" ? "block" : "none";

      // Hide Quick Set and Sleeve Grade boxes in single and shellac modes
      const quickSetBox = document.getElementById("quick-set-box");
      const sleeveGradeBox = document.getElementById("sleeve-grade-box");

      if (quickSetBox) {
        quickSetBox.style.display =
          recordMode === "single" || recordMode === "shellac"
            ? "none"
            : "block";
      }
      if (sleeveGradeBox) {
        sleeveGradeBox.style.display =
          recordMode === "single" || recordMode === "shellac"
            ? "none"
            : "block";
      }

      // Update grade button sizes based on mode
      const mediaGradeBox = document.getElementById("media-grade-box");
      if (mediaGradeBox) {
        const buttons = mediaGradeBox.querySelectorAll("button");
        buttons.forEach((btn) => {
          const grade = btn.textContent;
          const isSmaller =
            recordMode !== "single" &&
            recordMode !== "shellac" &&
            (grade === "P" || grade === "F" || grade === "NM" || grade === "M");
          btn.style.fontSize = isSmaller ? "16px" : "20px";
          btn.style.padding = isSmaller ? "5px" : "10px";
        });
      }
    };

    lpModeBtn.addEventListener("click", () => {
      recordMode = "lp";
      debugLog("LP Mode selected");
      updateModeButtons();
      updateCommentsField();
      showToast("LP Mode enabled");
    });

    singleModeBtn.addEventListener("click", () => {
      recordMode = "single";
      debugLog("Single Mode selected");
      updateModeButtons();
      updateCommentsField();
      showToast("Single Mode enabled");
    });

    pictureSleeveBtn.addEventListener("click", () => {
      recordMode = "single-picture";
      debugLog("Picture Sleeve Mode selected");
      updateModeButtons();
      updateCommentsField();
      showToast("Picture Sleeve Mode enabled");
    });

    shellacModeBtn.addEventListener("click", () => {
      recordMode = "shellac";
      debugLog("Shellac Mode selected");
      updateModeButtons();
      updateCommentsField();
      showToast("Shellac Mode enabled - Generic sleeve auto-set");
    });

    // Update auto-fill button toggle handlers with enhanced visual feedback
    const updateAutoFillBoxAppearance = () => {
      const anyEnabled = autoFillCommentsEnabled || autoFillDJSleeveEnabled;
      const autoFillBox = document.getElementById("autofill-box");
      const header = autoFillBox?.querySelector(".collapsible-header");

      if (autoFillBox && header) {
        if (anyEnabled) {
          autoFillBox.style.border = "3px solid #ff6b35";
          autoFillBox.style.boxShadow = "0 0 20px rgba(255, 107, 53, 0.3)";
          autoFillBox.style.background =
            "linear-gradient(135deg, #fff3e0, #ffe0b2)";
          header.innerHTML = `<span>⚠️ AUTO-FILL ACTIVE</span><span class="arrow-icon">▲</span>`;
          // Force open when active
          const content = autoFillBox.querySelector(".collapsible-content");
          if (content) {
            content.style.display = "block";
            header.style.borderBottom = "1px solid #ddd";
          }
        } else {
          autoFillBox.style.border = "2px solid black";
          autoFillBox.style.boxShadow = "0 0 6px rgba(0,0,0,0.3)";
          autoFillBox.style.background = "white";
          header.innerHTML = `<span>💬 Auto-fill Options</span><span class="arrow-icon">▼</span>`;
        }
      }
    };

    document
      .getElementById("toggle-autofill-comments")
      .addEventListener("click", (e) => {
        autoFillCommentsEnabled = !autoFillCommentsEnabled;
        localStorage.setItem(
          "discogs_autofillcomments",
          JSON.stringify(autoFillCommentsEnabled)
        );
        debugLog(
          "Auto-fill company sleeve setting changed:",
          autoFillCommentsEnabled
        );

        // Update button appearance with bright highlighting
        e.target.style.background = autoFillCommentsEnabled
          ? "linear-gradient(135deg, #ff6b35, #f7931e)"
          : "#e0e0e0";
        e.target.style.color = autoFillCommentsEnabled ? "white" : "#666";
        e.target.style.fontWeight = autoFillCommentsEnabled ? "bold" : "normal";
        e.target.style.fontSize = autoFillCommentsEnabled ? "16px" : "14px";
        e.target.style.border = autoFillCommentsEnabled
          ? "3px solid #ff6b35"
          : "2px solid transparent";
        e.target.style.boxShadow = autoFillCommentsEnabled
          ? "0 4px 15px rgba(255, 107, 53, 0.4)"
          : "none";
        e.target.style.transform = autoFillCommentsEnabled
          ? "scale(1.05)"
          : "scale(1)";

        updateAutoFillBoxAppearance();
        updateCommentsField();
      });

    document
      .getElementById("toggle-autofill-dj")
      .addEventListener("click", (e) => {
        autoFillDJSleeveEnabled = !autoFillDJSleeveEnabled;
        localStorage.setItem(
          "discogs_autofilldj",
          JSON.stringify(autoFillDJSleeveEnabled)
        );
        debugLog(
          "Auto-fill DJ sleeve setting changed:",
          autoFillDJSleeveEnabled
        );

        // Update button appearance with bright highlighting
        e.target.style.background = autoFillDJSleeveEnabled
          ? "linear-gradient(135deg, #ff6b35, #f7931e)"
          : "#e0e0e0";
        e.target.style.color = autoFillDJSleeveEnabled ? "white" : "#666";
        e.target.style.fontWeight = autoFillDJSleeveEnabled ? "bold" : "normal";
        e.target.style.fontSize = autoFillDJSleeveEnabled ? "16px" : "14px";
        e.target.style.border = autoFillDJSleeveEnabled
          ? "3px solid #ff6b35"
          : "2px solid transparent";
        e.target.style.boxShadow = autoFillDJSleeveEnabled
          ? "0 4px 15px rgba(255, 107, 53, 0.4)"
          : "none";
        e.target.style.transform = autoFillDJSleeveEnabled
          ? "scale(1.05)"
          : "scale(1)";

        updateAutoFillBoxAppearance();
        updateCommentsField();
      });

    // Pricing Mode toggle event listeners
    const updatePricingModeButtons = () => {
      // Update button styles
      document.getElementById("full-pricing-btn").style.background =
        pricingMode === "full" ? "#2ecc71" : "#e0e0e0";
      document.getElementById("full-pricing-btn").style.color =
        pricingMode === "full" ? "white" : "#666";

      document.getElementById("media-only-pricing-btn").style.background =
        pricingMode === "media-only" ? "#9b59b6" : "#e0e0e0";
      document.getElementById("media-only-pricing-btn").style.color =
        pricingMode === "media-only" ? "white" : "#666";

      document.getElementById("both-pricing-btn").style.background =
        pricingMode === "both" ? "#e74c3c" : "#e0e0e0";
      document.getElementById("both-pricing-btn").style.color =
        pricingMode === "both" ? "white" : "#666";

      // Update the box appearance
      const pricingModeBox = document.getElementById("pricing-mode-box");
      const header = pricingModeBox?.querySelector(".collapsible-header");

      if (pricingModeBox && header) {
        let title = "🎯 Pricing Mode";
        let isActive = pricingMode !== "full";

        // Reset styles
        pricingModeBox.style.border = "2px solid black";
        pricingModeBox.style.boxShadow = "0 0 6px rgba(0,0,0,0.3)";
        pricingModeBox.style.background = "white";

        if (pricingMode === "media-only") {
          title = "🎵 MEDIA-ONLY ACTIVE";
          pricingModeBox.style.border = "3px solid #9b59b6";
          pricingModeBox.style.boxShadow = "0 0 20px rgba(155, 89, 182, 0.3)";
          pricingModeBox.style.background =
            "linear-gradient(135deg, #f4ecf7, #e8d5f2)";
        } else if (pricingMode === "both") {
          title = "📊 DUAL MODE ACTIVE";
          pricingModeBox.style.border = "3px solid #e74c3c";
          pricingModeBox.style.boxShadow = "0 0 20px rgba(231, 76, 60, 0.3)";
          pricingModeBox.style.background =
            "linear-gradient(135deg, #fdf2f2, #fecaca)";
        }

        header.innerHTML = `<span>${title}</span><span class="arrow-icon">${
          isActive ? "▲" : "▼"
        }</span>`;

        // Force open when active, close when not
        const content = pricingModeBox.querySelector(".collapsible-content");
        if (content) {
          content.style.display = isActive ? "block" : "none";
          header.style.borderBottom = isActive ? "1px solid #ddd" : "none";
        }
      }
    };

    document
      .getElementById("full-pricing-btn")
      .addEventListener("click", () => {
        pricingMode = "full";
        localStorage.setItem("discogs_pricingmode", pricingMode);
        debugLog("Pricing mode changed to: full");
        updatePricingModeButtons();
        showToast("Full Condition Pricing enabled");
        if (selectedMedia && selectedSleeve) {
          fetchAndDisplayPrices(selectedMedia, selectedSleeve);
        }
      });

    document
      .getElementById("media-only-pricing-btn")
      .addEventListener("click", () => {
        pricingMode = "media-only";
        localStorage.setItem("discogs_pricingmode", pricingMode);
        debugLog("Pricing mode changed to: media-only");
        updatePricingModeButtons();
        showToast("Media-Only Pricing enabled");
        if (selectedMedia && selectedSleeve) {
          fetchAndDisplayPrices(selectedMedia, selectedSleeve);
        }
      });

    document
      .getElementById("both-pricing-btn")
      .addEventListener("click", () => {
        pricingMode = "both";
        localStorage.setItem("discogs_pricingmode", pricingMode);
        debugLog("Pricing mode changed to: both");
        updatePricingModeButtons();
        showToast("Dual Mode enabled - showing both strategies");
        if (selectedMedia && selectedSleeve) {
          fetchAndDisplayPrices(selectedMedia, selectedSleeve);
        }
      });
  }

  // Helper function to update the comments field based on current mode and settings
  function updateCommentsField() {
    const commentsInput = document.getElementById("comments");
    if (!commentsInput) return;

    let commentText = "";

    // Add company sleeve text if enabled
    if (autoFillCommentsEnabled) {
      commentText += "Comes in original label company sleeve.";
    }

    // Add DJ sleeve text if enabled
    if (autoFillDJSleeveEnabled) {
      // Add a space if we already have text
      if (commentText) commentText += " ";
      commentText += "Comes in original 12 inch company DJ jacket.";
    }

    // Automatically add picture sleeve text if in Picture Sleeve mode
    if (recordMode === "single-picture") {
      // Add a space if we already have text
      if (commentText) commentText += " ";
      commentText += "Original picture sleeve included!";
    }

    // Set the comment text if we have any
    if (commentText) {
      commentsInput.value = commentText;
      commentsInput.dispatchEvent(new Event("input", { bubbles: true }));
      debugLog("Updated comments field with: " + commentText);
    }
  }

  // Add debug info to page
  function addDebugInfoPanel() {
    if (!DEBUG) return;

    debugLog("Adding debug info panel");

    const panel = document.createElement("div");
    panel.id = "discogs-helper-debug-panel";
    Object.assign(panel.style, {
      position: "fixed",
      bottom: "10px",
      right: "10px",
      width: "300px",
      maxHeight: "200px",
      overflowY: "auto",
      background: "rgba(0, 0, 0, 0.8)",
      color: "#00ff00",
      fontFamily: "monospace",
      fontSize: "10px",
      padding: "10px",
      borderRadius: "5px",
      zIndex: "99999",
      boxShadow: "0 0 10px rgba(0,0,0,0.5)",
    });

    // Add toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "Debug Panel";
    Object.assign(toggleBtn.style, {
      position: "fixed",
      bottom: "10px",
      right: "320px",
      background: "#333",
      color: "#00ff00",
      border: "1px solid #00ff00",
      borderRadius: "3px",
      padding: "3px 6px",
      fontSize: "10px",
      zIndex: "99999",
      cursor: "pointer",
    });

    let isPanelVisible = false;
    panel.style.display = "none";

    toggleBtn.onclick = () => {
      isPanelVisible = !isPanelVisible;
      panel.style.display = isPanelVisible ? "block" : "none";
      toggleBtn.textContent = isPanelVisible ? "Hide Debug" : "Debug Panel";
    };

    // Add content
    panel.innerHTML = `
        <h3 style="margin: 0 0 5px 0; font-size: 12px;">Discogs Helper Debug</h3>
        <div id="debug-config-info">
          <div><b>Version:</b> 10.3</div>
          <div><b>API:</b> Always Enabled</div>
          <div><b>Token:</b> ${config.token.substring(
            0,
            5
          )}...${config.token.substring(config.token.length - 5)}</div>
          <div><b>Mode:</b> ${
            recordMode === "single"
              ? "Single Mode"
              : recordMode === "single-picture"
              ? "Picture Sleeve Mode"
              : recordMode === "shellac"
              ? "Shellac Mode"
              : "LP Mode"
          }</div>
          <div><b>Auto-fill Company Sleeve:</b> ${
            autoFillCommentsEnabled ? "Enabled" : "Disabled"
          }</div>
          <div><b>Auto-fill DJ Sleeve:</b> ${
            autoFillDJSleeveEnabled ? "Enabled" : "Disabled"
          }</div>
          <div><b>Auto-fill Picture Sleeve:</b> ${
            autoFillPictureSleeveEnabled ? "Enabled" : "Disabled"
          }</div>
          <div><b>Pricing Mode:</b> ${pricingMode.toUpperCase()}</div>
        </div>
        <hr style="border: none; border-top: 1px solid #333; margin: 5px 0;">
        <div id="debug-state-info">
          <div><b>Release ID:</b> <span id="debug-release-id">Unknown</span></div>
          <div><b>Media:</b> <span id="debug-media">None</span></div>
          <div><b>Sleeve:</b> <span id="debug-sleeve">None</span></div>
        </div>
        <hr style="border: none; border-top: 1px solid #333; margin: 5px 0;">
        <div><b>Test Selectors:</b></div>
        <div>
          <button id="test-selectors-btn" style="background: #333; color: #00ff00; border: 1px solid #00ff00; margin-top: 5px; cursor: pointer; font-size: 10px; padding: 2px 4px;">
            Test Page Selectors
          </button>
        </div>
        <div id="test-results" style="margin-top: 5px; font-size: 9px;"></div>
      `;

    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);

    // Add functionality to test button
    setTimeout(() => {
      const testBtn = document.getElementById("test-selectors-btn");
      if (testBtn) {
        testBtn.onclick = testPageSelectors;
      }

      // Update state info
      const updateStateInfo = () => {
        const releaseIdEl = document.getElementById("debug-release-id");
        const mediaEl = document.getElementById("debug-media");
        const sleeveEl = document.getElementById("debug-sleeve");

        if (releaseIdEl) releaseIdEl.textContent = releaseId || "Unknown";
        if (mediaEl) mediaEl.textContent = selectedMedia || "None";
        if (sleeveEl) sleeveEl.textContent = selectedSleeve || "None";
      };

      // Update every second
      setInterval(updateStateInfo, 1000);
    }, 500);
  }

  function testPageSelectors() {
    debugLog("Testing page selectors");
    const results = document.getElementById("test-results");
    if (!results) return;

    results.innerHTML = "Testing selectors...";

    // Check for various selectors
    const checks = [
      {
        name: "Media Select",
        selector: "#media_condition",
        alternative: 'select[name="media_condition"]',
      },
      {
        name: "Sleeve Select",
        selector: "#sleeve_condition",
        alternative: 'select[name="sleeve_condition"]',
      },
      {
        name: "Price Input",
        selector: "#price",
        alternative: 'input[name="price"]',
      },
      {
        name: "Quantity",
        selector: "#quantity",
        alternative: 'input[name="quantity"]',
      },
      {
        name: "Accept Offer",
        selector: "#accept_offer",
        alternative: 'input[name="accept_offer"]',
      },
      {
        name: "Submit Button",
        selector: "#sell_item_button",
        alternative: 'button[type="submit"]',
      },
    ];

    let html = '<ul style="margin: 0; padding-left: 15px;">';

    checks.forEach((check) => {
      const element = document.querySelector(check.selector);
      const altElement = element
        ? null
        : document.querySelector(check.alternative);

      if (element) {
        html += `<li style="color: #00ff00;">${check.name}: OK (${check.selector})</li>`;
      } else if (altElement) {
        html += `<li style="color: #ffff00;">${check.name}: Alternative Found (${check.alternative})</li>`;
      } else {
        html += `<li style="color: #ff0000;">${check.name}: Not Found</li>`;
      }
    });

    // Test release ID extraction
    const releaseIdFromUrl =
      window.location.pathname.match(/\/post\/(\d+)/)?.[1];
    if (releaseIdFromUrl) {
      html += `<li style="color: #00ff00;">Release ID: ${releaseIdFromUrl}</li>`;
    } else {
      html += `<li style="color: #ff0000;">Release ID: Not Found in URL</li>`;
    }

    html += "</ul>";

    // Add timestamp
    html += `<div style="font-size: 8px; color: #999; margin-top: 5px;">Last tested: ${new Date().toLocaleTimeString()}</div>`;

    results.innerHTML = html;
  }

  // Start the process
  debugLog("Script starting");
  waitForElements();
  addDebugInfoPanel();
})();
