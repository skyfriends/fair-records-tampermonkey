// ==UserScript==
// @name         Discogs Enhanced Comment Checker v1.5 - STABLE
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Highlights table rows with non-enhanced descriptions in pale green. BETA
// @author       rova_records
// @match        https://www.discogs.com/seller/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_description-checker-bulk.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_description-checker-bulk.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function () {
  "use strict";

  function highlightRows() {
    const rows = document.querySelectorAll("tr.shortcut_navigable");
    let nonEnhancedCount = 0;

    rows.forEach((row, index) => {
      // Reset any previous highlighting
      row.style.backgroundColor = "";
      row.style.borderLeft = "";

      // Find the description cell
      const descCell = row.querySelector("td.item_description");
      if (!descCell) return;

      // Find the description paragraph - it's the p.hide_mobile that contains the actual description
      const descParagraphs = descCell.querySelectorAll("p.hide_mobile");
      let descriptionText = "";

      // Look for the paragraph that has the actual description (not label/condition info)
      for (let p of descParagraphs) {
        const text = p.textContent || "";
        // Skip paragraphs with label/condition info
        if (
          text.includes("Label:") ||
          text.includes("Cat#:") ||
          text.includes("Media Condition:") ||
          text.includes("Sleeve Condition:") ||
          text.includes("Location:")
        ) {
          continue;
        }
        // This should be the description
        if (text.trim().length > 0) {
          descriptionText = text.trim();
          break;
        }
      }

      // Check if description is enhanced:
      // 1. Must be at least 100 characters long
      // 2. Should start with uppercase pattern (catchphrases like "RARE!" "MINT!" "1970 CLASSIC!" "1970s TEEN POP!" "80S ROCK!" "K-TEL'S ROCK!" "ROCK & ROLL!" etc.)
      const startsWithUppercase = /^[A-Z0-9].*[A-Z]{2,}/.test(descriptionText);
      const isLongEnough = descriptionText.length >= 100;

      // If description is short OR doesn't start with uppercase, highlight it
      if (!isLongEnough || !startsWithUppercase) {
        row.style.backgroundColor = "#fdf2f2";
        row.style.border = "3px solid #ff6b6b";
        row.style.borderLeft = "6px solid #ee5a52";
        row.style.boxShadow = "0 2px 8px rgba(255, 107, 107, 0.3)";
        row.style.transition = "all 0.3s ease";

        // Add copy release info button
        addCopyButton(row);

        nonEnhancedCount++;
      }
    });

    // Update the floating counter
    updateCounter(nonEnhancedCount, rows.length);
  }

  // Function to create and update the floating counter
  function updateCounter(nonEnhancedCount, totalCount) {
    let counter = document.getElementById("discogs-counter");

    if (!counter) {
      // Create the counter element
      counter = document.createElement("div");
      counter.id = "discogs-counter";
      counter.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #ff6b6b, #ee5a52);
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          font-family: Arial, sans-serif;
          font-size: 14px;
          font-weight: bold;
          box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
          z-index: 10000;
          border: 2px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
          cursor: pointer;
          user-select: none;
        `;

      // Add click handler to scroll to first non-enhanced item
      counter.addEventListener("click", () => {
        scrollToFirstNonEnhanced();
      });

      // Add hover effects
      counter.addEventListener("mouseenter", () => {
        counter.style.transform = "scale(1.05)";
        counter.style.boxShadow = "0 6px 16px rgba(255, 107, 107, 0.6)";
      });

      counter.addEventListener("mouseleave", () => {
        counter.style.transform = "scale(1)";
        counter.style.boxShadow = "0 4px 12px rgba(255, 107, 107, 0.4)";
      });

      document.body.appendChild(counter);
    }

    // Update the counter text
    counter.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 18px; margin-bottom: 2px;">📝 ${nonEnhancedCount}</div>
          <div style="font-size: 11px; opacity: 0.9;">Non-Enhanced</div>
          <div style="font-size: 10px; opacity: 0.7;">of ${totalCount} total</div>
          ${nonEnhancedCount > 0 ? '<div style="font-size: 9px; opacity: 0.6; margin-top: 2px;">👆 Click to scroll</div>' : ''}
        </div>
      `;

    // Create separate bulk copy button
    createBulkCopyButton(nonEnhancedCount > 0);
  }

  // Function to create a separate bulk copy button
  function createBulkCopyButton(show) {
    let bulkButton = document.getElementById("discogs-bulk-copy-btn");

    if (!bulkButton && show) {
      bulkButton = document.createElement("div");
      bulkButton.id = "discogs-bulk-copy-btn";
      bulkButton.style.cssText = `
          position: fixed;
          top: 20px;
          right: 200px;
          background: linear-gradient(135deg, #28a745, #20c997);
          color: white;
          padding: 16px 24px;
          border-radius: 12px;
          font-family: Arial, sans-serif;
          font-size: 16px;
          font-weight: bold;
          box-shadow: 0 4px 16px rgba(40, 167, 69, 0.4);
          z-index: 10001;
          border: 3px solid rgba(255, 255, 255, 0.3);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
          cursor: pointer;
          user-select: none;
        `;

      bulkButton.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 20px; margin-bottom: 4px;">🚀 BULK COPY</div>
          <div style="font-size: 12px; opacity: 0.9;">Click to copy all non-enhanced</div>
        </div>
      `;

      // Add hover effects
      bulkButton.addEventListener("mouseenter", () => {
        bulkButton.style.transform = "scale(1.05)";
        bulkButton.style.boxShadow = "0 6px 20px rgba(40, 167, 69, 0.6)";
      });

      bulkButton.addEventListener("mouseleave", () => {
        bulkButton.style.transform = "scale(1)";
        bulkButton.style.boxShadow = "0 4px 16px rgba(40, 167, 69, 0.4)";
      });

      // Add click handler with better reliability
      bulkButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Disable button immediately
        bulkButton.style.pointerEvents = "none";
        bulkButton.style.opacity = "0.6";

        await bulkCopyNonEnhanced();

        // Re-enable button after delay
        setTimeout(() => {
          bulkButton.style.pointerEvents = "auto";
          bulkButton.style.opacity = "1";
        }, 5000);
      });

      document.body.appendChild(bulkButton);
    } else if (bulkButton && !show) {
      bulkButton.remove();
    }
  }

  // Function to create top progress bar
  function createProgressBar() {
    let progressContainer = document.getElementById("discogs-progress-container");

    if (!progressContainer) {
      progressContainer = document.createElement("div");
      progressContainer.id = "discogs-progress-container";
      progressContainer.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 80px;
          background: linear-gradient(135deg, #ff6b6b, #ee5a52);
          color: white;
          font-family: Arial, sans-serif;
          z-index: 10002;
          box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
          transform: translateY(-100%);
          transition: transform 0.5s ease;
          padding: 16px 24px;
          box-sizing: border-box;
        `;

      progressContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; height: 100%;">
          <div>
            <div id="progress-title" style="font-size: 18px; font-weight: bold; margin-bottom: 4px;">🚀 Processing Releases</div>
            <div id="progress-subtitle" style="font-size: 14px; opacity: 0.9;">Preparing bulk copy...</div>
          </div>
          <div style="flex: 1; margin: 0 24px;">
            <div style="background: rgba(255, 255, 255, 0.3); border-radius: 12px; height: 24px; overflow: hidden;">
              <div id="progress-bar" style="background: white; height: 100%; width: 0%; transition: width 0.8s ease; border-radius: 12px;"></div>
            </div>
            <div id="progress-text" style="text-align: center; font-size: 12px; margin-top: 4px; opacity: 0.9;">0%</div>
          </div>
          <div id="progress-stats" style="text-align: right;">
            <div style="font-size: 16px; font-weight: bold;" id="progress-count">0 / 0</div>
            <div style="font-size: 12px; opacity: 0.9;">releases</div>
          </div>
        </div>
      `;

      document.body.appendChild(progressContainer);
    }

    return progressContainer;
  }

  // Function to show progress bar
  function showProgressBar() {
    const progressContainer = createProgressBar();
    progressContainer.style.transform = "translateY(0)";

    // Push page content down
    document.body.style.paddingTop = "80px";
    document.body.style.transition = "padding-top 0.5s ease";
  }

  // Function to hide progress bar
  function hideProgressBar() {
    const progressContainer = document.getElementById("discogs-progress-container");
    if (progressContainer) {
      progressContainer.style.transform = "translateY(-100%)";

      // Remove padding after animation
      setTimeout(() => {
        document.body.style.paddingTop = "0";
      }, 500);
    }
  }

  // Function to update progress bar
  function updateProgressBar(current, total, title, subtitle) {
    const progressBar = document.getElementById("progress-bar");
    const progressText = document.getElementById("progress-text");
    const progressCount = document.getElementById("progress-count");
    const progressTitle = document.getElementById("progress-title");
    const progressSubtitle = document.getElementById("progress-subtitle");

    if (progressBar && progressText && progressCount) {
      const percentage = Math.round((current / total) * 100);
      progressBar.style.width = `${percentage}%`;
      progressText.textContent = `${percentage}%`;
      progressCount.textContent = `${current} / ${total}`;

      if (progressTitle) progressTitle.textContent = title;
      if (progressSubtitle) progressSubtitle.textContent = subtitle;
    }
  }

  // Function to show success ripple animation
  function showSuccessRipple() {
    const ripple = document.createElement("div");
    ripple.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        width: 100px;
        height: 100px;
        background: radial-gradient(circle, rgba(40, 167, 69, 0.8) 0%, rgba(40, 167, 69, 0.4) 50%, transparent 100%);
        border-radius: 50%;
        transform: translate(-50%, -50%) scale(0);
        z-index: 99999;
        pointer-events: none;
        animation: rippleSuccess 1.5s ease-out forwards;
      `;

    // Add CSS animation keyframes if not already added
    if (!document.getElementById("ripple-styles")) {
      const style = document.createElement("style");
      style.id = "ripple-styles";
      style.textContent = `
          @keyframes rippleSuccess {
            0% {
              transform: translate(-50%, -50%) scale(0);
              opacity: 1;
            }
            50% {
              transform: translate(-50%, -50%) scale(8);
              opacity: 0.6;
            }
            100% {
              transform: translate(-50%, -50%) scale(20);
              opacity: 0;
            }
          }

          @keyframes pulseSuccess {
            0%, 100% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 0.8;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.2);
              opacity: 1;
            }
          }
        `;
      document.head.appendChild(style);
    }

    document.body.appendChild(ripple);

    // Add a success checkmark in the center
    const checkmark = document.createElement("div");
    checkmark.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 60px;
        color: #28a745;
        z-index: 100000;
        pointer-events: none;
        animation: pulseSuccess 1.5s ease-out;
        text-shadow: 0 0 20px rgba(40, 167, 69, 0.8);
      `;
    checkmark.textContent = "✅";
    document.body.appendChild(checkmark);

    // Remove elements after animation
    setTimeout(() => {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
      if (checkmark.parentNode) checkmark.parentNode.removeChild(checkmark);
    }, 1500);
  }

  // Function to scroll to the first non-enhanced item
  function scrollToFirstNonEnhanced() {
    const rows = document.querySelectorAll("tr.shortcut_navigable");
    
    for (let row of rows) {
      // Check if this row is highlighted (non-enhanced)
      if (row.style.backgroundColor === "rgb(253, 242, 242)" || row.style.backgroundColor === "#fdf2f2") {
        // Scroll to this row with smooth animation
        row.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
        
        // Add a temporary flash effect to highlight the target
        const originalBoxShadow = row.style.boxShadow;
        row.style.boxShadow = "0 0 20px 5px rgba(255, 107, 107, 0.8)";
        row.style.transform = "scale(1.02)";
        
        setTimeout(() => {
          row.style.boxShadow = originalBoxShadow;
          row.style.transform = "scale(1)";
        }, 2000);
        
        break; // Stop after finding the first one
      }
    }
  }

  // Function to bulk copy all non-enhanced releases
  async function bulkCopyNonEnhanced() {
    const rows = document.querySelectorAll("tr.shortcut_navigable");
    const nonEnhancedReleases = [];

    // Show progress bar
    showProgressBar();
    updateProgressBar(0, 100, "🔍 Finding Non-Enhanced Releases", "Scanning page for releases to process...");

    // Find all non-enhanced releases
    for (let row of rows) {
      const descCell = row.querySelector("td.item_description");
      if (!descCell) continue;

      // Get description text (same logic as highlightRows)
      const descParagraphs = descCell.querySelectorAll("p.hide_mobile");
      let descriptionText = "";

      for (let p of descParagraphs) {
        const text = p.textContent || "";
        if (
          text.includes("Label:") ||
          text.includes("Cat#:") ||
          text.includes("Media Condition:") ||
          text.includes("Sleeve Condition:") ||
          text.includes("Location:")
        ) {
          continue;
        }
        if (text.trim().length > 0) {
          descriptionText = text.trim();
          break;
        }
      }

      // Check if non-enhanced (same logic as highlightRows)
      const startsWithUppercase = /^[A-Z0-9].*[A-Z]{2,}/.test(descriptionText);
      const isLongEnough = descriptionText.length >= 100;

      if (!isLongEnough || !startsWithUppercase) {
        // Get release link
        const releaseLink = row.querySelector("a.item_release_link");
        if (releaseLink) {
          nonEnhancedReleases.push({
            url: releaseLink.href,
            row: row,
          });
        }
      }
    }

    if (nonEnhancedReleases.length === 0) {
      updateProgressBar(100, 100, "❌ No Releases Found", "No non-enhanced releases found on this page!");
      setTimeout(() => hideProgressBar(), 3000);
      return;
    }

    // Show found releases
    updateProgressBar(100, 100, "✅ Found Releases", `Found ${nonEnhancedReleases.length} releases to process`);

    try {
      // Get VinylScribe prompt (reuse from existing function)
      const vinylScribePrompt = `You are VinylScribe, a specialist assistant for creating vinyl record listing descriptions. I'm providing you with MULTIPLE releases below (separated by --- dividers). For each release, create a separate description following these guidelines:

  1. Carefully examine the provided text to gather information about:
     - The specific pressing details from the Discogs release page
     - The condition notes and any comments from the seller's listing page

  2. CRITICAL: Use ONLY the information provided in the Discogs page text. DO NOT search for additional information or make assumptions about details not explicitly stated on the page.

  3. Focus on the physical characteristics of the record:
     - Release year and pressing plant if available
     - Label and catalog number
     - Original vs reissue status
     - Notable physical features (colored vinyl, inserts, gatefold, etc.)
     - Matrix numbers or etching details if significant
     - Pressing-specific characteristics (club edition, promo, etc.)

  4. Generate a concise (3-4 line) description that:
     - Begins with an attention-grabbing but authentic collector-focused phrase (like "HONKY-TONK CLASSIC!" "RHYTHM DEPARTURE!" "CHART RARITY!" "PSYCH OBSCURITY!" "BRITISH INVASION!" "MOTOWN MAGIC!") – avoid corny phrases about pressing plants like "SCRANTON SPECIAL!" or "TERRA HAUTE TREASURE!"
     - Highlights distinctive pressing characteristics
     - Mentions any specific pressing variants or identifiers
     - Notes physical components (inserts, booklets, etc.) ONLY IF explicitly mentioned in the listing notes
     - Includes relevant artist history or cultural significance when it relates to the specific pressing

  5. CRITICAL: For each release, you MUST create a clearly labeled section with the artist and album name as a header, followed by the description in a markdown code block. Format EXACTLY like this:

     ## Artist Name - Album Title (Label Year)
     \`\`\`
     [Description text here]
     \`\`\`

  6. ALWAYS include the artist name, album title, label, and year in the header above each code block so the user can easily identify which description belongs to which release.

  Use the condition information (NM, VG+, etc.) exactly as provided in the listing page.

  IMPORTANT: If the seller's listing includes specific condition details (like "jacket ripped along top", "sealed", "jacket torn", "brand new inners", etc.), include these details in the description as they are crucial condition information.

  ALSO IMPORTANT: Check the "Original Description" section for any condition-related information that should be preserved in the new description (damage notes, special handling, etc.).

  Don't waste words on subjective statements like "rare" or "hard to find" unless there's specific pressing information supporting limited availability (numbered editions, etc.).

  DO NOT ADD ANY DETAILS ABOUT COMPONENTS (inner sleeves, posters, inserts, etc.) UNLESS THEY ARE SPECIFICALLY MENTIONED IN THE LISTING COMMENTS. Don't assume anything is included that isn't explicitly stated.

  🚨 CRITICAL: DO NOT HALLUCINATE OR INVENT DETAILS. If the Discogs page shows "US" as country, DO NOT claim it's a Chinese pressing. If lock grooves aren't mentioned, DO NOT add them. If pressing plant details aren't shown, DO NOT make them up. Stick strictly to what's actually on the page.

  DO include interesting connections that make the record more valuable or significant to collectors, but ONLY if this information is clearly stated on the Discogs page:
  - Regional significance or pressing location oddities
  - Artist connections (members from other bands, session musicians)
  - Label transitions (first/last release on a particular label)
  - Career watersheds or sound evolution reflected in specific releases
  - Oddities, misprints, variations or strange pressing details
  - Historical context relevant to the physical pressing

  If information is incomplete, work with what is available on the Discogs page rather than inventing details.

  🚨🚨🚨 VERY IMPORTANT: THE FINAL DESCRIPTION MUST BE 500 CHARACTERS OR LESS. ABSOLUTELY DO NOT GO OVER. 🚨🚨🚨

  EXAMPLES:

  ## The Beatles - Revolver (Parlophone 1966)
  \`\`\`
  BRITISH INVASION CORNERSTONE! NM/VG+ 1966 UK Parlophone first pressing (PMC 7009) with crucial KT tax code and "Doctor Robert" spelling error on label. XEX 606-1/XEX 607-1 matrices with Dick James Music credits. Complete with original black inner sleeve. Essential early pressing featuring loud Peter Blake-influenced mono mix before Capitol's altered US version.
  \`\`\`

  ## 13th Floor Elevators – The Psychedelic Sounds of the 13th Floor Elevators (International Artists 1966)
  \`\`\`
  TEXAS PSYCH HOLY GRAIL! VG/VG- 1966 International Artists mono pressing (IA LP-1) with crucial first issue blue/white labels. Etched "JAH" in runout denoting Jim Holloway mastering. Houston-pressed copy from first 1,500 run before widespread distribution. Original mix with stronger electric jug presence than subsequent repressings.
  \`\`\`

  ---

  `;

      let bulkContent = vinylScribePrompt;

      // Process each release with detailed progress
      for (let i = 0; i < nonEnhancedReleases.length; i++) {
        const release = nonEnhancedReleases[i];
        const currentStep = i + 1;

        // Update progress bar with current release
        updateProgressBar(
          currentStep,
          nonEnhancedReleases.length,
          `⏳ Processing Release ${currentStep}/${nonEnhancedReleases.length}`,
          `Fetching data for release ${currentStep}...`
        );

        try {
          // Get release page content (simplified version of smartScrapeReleasePage)
          const response = await fetch(release.url);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const html = await response.text();

          if (!html || html.length < 100) {
            throw new Error("Empty or invalid response from server");
          }

          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");

          // Remove junk
          doc
            .querySelectorAll(
              "script, style, nav, header, footer, .navigation, .ads, .advertisement, .cookie",
            )
            .forEach((el) => el.remove());

          const mainContent =
            doc.querySelector("#page_content") ||
            doc.querySelector(".content") ||
            doc.querySelector("main") ||
            doc.body;

          if (!mainContent) {
            throw new Error("Could not find main content on page");
          }

          let allText = mainContent.textContent || mainContent.innerText || "";

          if (allText.length < 50) {
            throw new Error("Page content too short - may be blocked or empty");
          }

          // Use same cleaning logic as the main function
          const delimiters = [
            "Label:",
            "Format:",
            "Country:",
            "Released:",
            "Genre:",
            "Style:",
            "Matrix / Runout:",
            "Published By",
            "Rights Society:",
            "Edit Release",
            "Have:",
            "Want:",
            "Avg Rating:",
            "Last Sold:",
            "Low:",
            "Median:",
            "High:",
            "Shop now",
            "Add to Collection",
            "Add to Wantlist",
            "A1",
            "A2",
            "A3",
            "A4",
            "A5",
            "A6",
            "A7",
            "A8",
            "A9",
            "B1",
            "B2",
            "B3",
            "B4",
            "B5",
            "B6",
            "B7",
            "B8",
            "B9",
            "Written By",
            "Written-By",
            "Producer",
            "Engineer",
            "Design",
            "Distributed By",
            "Directed By",
            "Arranged By",
            "Mixed By",
            "Mastered By",
            "Recorded At",
            "Vocals",
            "Guitar",
            "Bass",
            "Drums",
            "Piano",
            "Keyboards",
            "Barcode:",
            "Notes:",
            "Companies",
            "Credits",
            "Tracklist",
          ];

          const delimiterPattern = new RegExp(
            `(${delimiters.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
            "gi",
          );
          let sections = allText
            .split(delimiterPattern)
            .filter((section) => section.trim().length > 0);

          // Format sections (simplified)
          let formattedText = "";
          for (let j = 0; j < sections.length; j++) {
            let section = sections[j].trim();
            if (
              section.length < 2 ||
              section.toLowerCase().includes("cookie") ||
              section.toLowerCase().includes("javascript") ||
              section.match(/^[0-9]+$/)
            ) {
              continue;
            }

            if (delimiters.some((d) => section.toLowerCase().includes(d.toLowerCase()))) {
              if (formattedText.length > 0) formattedText += "\n\n";
              formattedText += section;
              if (j + 1 < sections.length) {
                const nextSection = sections[j + 1].trim();
                if (
                  nextSection &&
                  !delimiters.some((d) => nextSection.toLowerCase().includes(d.toLowerCase()))
                ) {
                  formattedText += " " + nextSection;
                  j++;
                }
              }
            } else {
              if (formattedText.length > 0 && !formattedText.endsWith(" ")) formattedText += "\n";
              formattedText += section;
            }
          }

          // Get condition and price from current row
          const descriptionCell = release.row.querySelector("td.item_description");
          let condition = "";
          let originalDescription = "";

          if (descriptionCell) {
            // Get conditions
            const mediaConditionSpan = descriptionCell.querySelector(
              "p.item_condition span:not(.mplabel):not(.has-tooltip)",
            );
            const sleeveConditionSpan = descriptionCell.querySelector("span.item_sleeve_condition");

            let conditionParts = [];
            if (mediaConditionSpan)
              conditionParts.push(`Media: ${mediaConditionSpan.textContent.trim()}`);
            if (sleeveConditionSpan)
              conditionParts.push(`Sleeve: ${sleeveConditionSpan.textContent.trim()}`);
            condition = conditionParts.join(" / ");

            // Get original description
            const descParagraphs = descriptionCell.querySelectorAll("p.hide_mobile");
            for (let p of descParagraphs) {
              const text = p.textContent || "";
              if (
                text.includes("Label:") ||
                text.includes("Cat#:") ||
                text.includes("Media Condition:") ||
                text.includes("Sleeve Condition:") ||
                text.includes("Location:")
              ) {
                continue;
              }
              if (text.trim().length > 0) {
                originalDescription = text.trim();
                break;
              }
            }
          }

          const priceCell = release.row.querySelector("td.item_price");
          let price = "";
          if (priceCell) {
            const priceSpan = priceCell.querySelector("span.price");
            if (priceSpan) price = priceSpan.textContent.trim();
          }

          // Add to bulk content
          bulkContent += `\n\n---\n\n${formattedText}`;

          if (condition || price || originalDescription) {
            bulkContent += `\n\nOUR COPY:\nCondition: ${condition}\nPrice: ${price}`;
            if (originalDescription) {
              bulkContent += `\nOriginal Description: ${originalDescription}`;
            }
          }

          // Update progress to show completion of this release
          updateProgressBar(
            currentStep,
            nonEnhancedReleases.length,
            `✅ Processed Release ${currentStep}/${nonEnhancedReleases.length}`,
            `Successfully processed release ${currentStep}`
          );

        } catch (error) {
          console.error(`Error processing release ${i + 1}:`, error);

          // Add error info to bulk content
          bulkContent += `\n\n---\n\nError loading release ${i + 1}: ${release.url}\nError: ${error.message}`;

          // Update progress to show error with details
          updateProgressBar(
            currentStep,
            nonEnhancedReleases.length,
            `❌ Error on Release ${currentStep}/${nonEnhancedReleases.length}`,
            `Failed: ${error.message}`
          );
        }
      }

      // Show final processing step
      updateProgressBar(
        nonEnhancedReleases.length,
        nonEnhancedReleases.length,
        "📋 Copying to Clipboard",
        "Finalizing and copying all content..."
      );

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(bulkContent);
      } catch (clipboardError) {
        throw new Error(`Clipboard access failed: ${clipboardError.message}`);
      }

      // Show final success
      updateProgressBar(
        nonEnhancedReleases.length,
        nonEnhancedReleases.length,
        "✅ SUCCESS!",
        `${nonEnhancedReleases.length} releases copied to clipboard - Ready to paste!`
      );

      // Show success ripple
      showSuccessRipple();

      // Hide progress bar after delay
      setTimeout(() => {
        hideProgressBar();
      }, 4000);

    } catch (error) {
      console.error("Bulk copy error:", error);

      // Show detailed error message
      updateProgressBar(
        0,
        nonEnhancedReleases.length,
        "❌ BULK COPY FAILED",
        `Error: ${error.message}. Check console for details.`
      );

      // Also show error in console for debugging
      console.error("Full error details:", error);

      // Keep error message visible longer
      setTimeout(() => {
        hideProgressBar();
      }, 10000);
    }
  }

  // Function to add copy button to highlighted rows
  function addCopyButton(row) {
    // Find the actions area
    const actionsCell = row.querySelector("td.item_add_to_cart_desktop .hide_mobile");
    if (!actionsCell) return;

    // Check if button already exists
    if (actionsCell.querySelector(".copy-release-btn")) return;

    // Find the release page link
    const releaseLink = row.querySelector("a.item_release_link");
    if (!releaseLink) return;

    const releaseUrl = releaseLink.href;

    // Create the button
    const copyButton = document.createElement("p");
    copyButton.innerHTML =
      '<a href="#" class="copy-release-btn" style="color: #ff6b6b; font-weight: bold; text-decoration: none; border: 1px solid #ff6b6b; padding: 4px 8px; border-radius: 3px; display: inline-block; font-size: 11px;">📋 Copy Release Info</a>';

    // Add click handler
    copyButton.querySelector("a").addEventListener("click", async (e) => {
      e.preventDefault();
      await smartScrapeReleasePage(releaseUrl, copyButton.querySelector("a"));
    });

    // Insert the button
    actionsCell.appendChild(copyButton);
  }

  // Function to intelligently scrape release page content
  async function smartScrapeReleasePage(releaseUrl, buttonElement) {
    const originalText = buttonElement.textContent;

    // Show immediate ripple feedback
    showSuccessRipple();

    buttonElement.textContent = "⏳ Loading...";
    buttonElement.style.pointerEvents = "none";

    try {
      // First, get the condition and price from the current row and save to localStorage
      const row = buttonElement.closest("tr.shortcut_navigable");
      let conditionAndPrice = "";

      if (row) {
        // Get condition - it's actually in the item_description cell
        const descriptionCell = row.querySelector("td.item_description");
        let condition = "";
        if (descriptionCell) {
          // Get media condition
          const mediaConditionSpan = descriptionCell.querySelector(
            "p.item_condition span:not(.mplabel):not(.has-tooltip)",
          );
          let mediaCondition = "";
          if (mediaConditionSpan) {
            mediaCondition = mediaConditionSpan.textContent.trim();
          }

          // Get sleeve condition
          const sleeveConditionSpan = descriptionCell.querySelector("span.item_sleeve_condition");
          let sleeveCondition = "";
          if (sleeveConditionSpan) {
            sleeveCondition = sleeveConditionSpan.textContent.trim();
          }

          // Combine them
          let conditionParts = [];
          if (mediaCondition) conditionParts.push(`Media: ${mediaCondition}`);
          if (sleeveCondition) conditionParts.push(`Sleeve: ${sleeveCondition}`);
          condition = conditionParts.join(" / ");
        }

        // Get price
        const priceCell = row.querySelector("td.item_price");
        let price = "";
        if (priceCell) {
          const priceSpan = priceCell.querySelector("span.price");
          if (priceSpan) {
            price = priceSpan.textContent.trim();
          }
        }

        // Get the original description text
        let originalDescription = "";
        if (descriptionCell) {
          const descParagraphs = descriptionCell.querySelectorAll("p.hide_mobile");
          for (let p of descParagraphs) {
            const text = p.textContent || "";
            // Skip paragraphs with label/condition info
            if (
              text.includes("Label:") ||
              text.includes("Cat#:") ||
              text.includes("Media Condition:") ||
              text.includes("Sleeve Condition:") ||
              text.includes("Location:")
            ) {
              continue;
            }
            // This should be the description
            if (text.trim().length > 0) {
              originalDescription = text.trim();
              break;
            }
          }
        }

        // Save to localStorage
        localStorage.setItem("discogs_temp_condition", condition);
        localStorage.setItem("discogs_temp_price", price);
        localStorage.setItem("discogs_temp_original_description", originalDescription);

        console.log("Saved condition:", condition);
        console.log("Saved price:", price);
      }

      console.log("Fetching:", releaseUrl);
      const response = await fetch(releaseUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      console.log("HTML length:", html.length);

      // Parse the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Remove script tags, style tags, and other junk
      doc
        .querySelectorAll(
          "script, style, nav, header, footer, .navigation, .ads, .advertisement, .cookie",
        )
        .forEach((el) => el.remove());

      // Try to find the main content - be more specific for Discogs
      let mainContent =
        doc.querySelector("#page_content") ||
        doc.querySelector(".content") ||
        doc.querySelector("main") ||
        doc.querySelector("body");

      console.log("Main content found:", !!mainContent);

      if (!mainContent) {
        // Fallback - just get the body
        mainContent = doc.body;
      }

      // Get all text content
      let allText = mainContent.textContent || mainContent.innerText || "";
      console.log("Raw text length:", allText.length);

      // Instead of trying to work with lines, split on common Discogs delimiters
      // and then clean up each section
      const delimiters = [
        "Label:",
        "Format:",
        "Country:",
        "Released:",
        "Genre:",
        "Style:",
        "Matrix / Runout:",
        "Published By",
        "Rights Society:",
        "Edit Release",
        "Have:",
        "Want:",
        "Avg Rating:",
        "Last Sold:",
        "Low:",
        "Median:",
        "High:",
        "Shop now",
        "Add to Collection",
        "Add to Wantlist",
        // Track positions
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "A6",
        "A7",
        "A8",
        "A9",
        "B1",
        "B2",
        "B3",
        "B4",
        "B5",
        "B6",
        "B7",
        "B8",
        "B9",
        // Credits
        "Written By",
        "Written-By",
        "Producer",
        "Engineer",
        "Design",
        "Distributed By",
        "Directed By",
        "Arranged By",
        "Mixed By",
        "Mastered By",
        "Recorded At",
        "Vocals",
        "Guitar",
        "Bass",
        "Drums",
        "Piano",
        "Keyboards",
        // Other common fields
        "Barcode:",
        "Notes:",
        "Companies",
        "Credits",
        "Tracklist",
      ];

      // Create a regex pattern that matches any of the delimiters
      const delimiterPattern = new RegExp(
        `(${delimiters.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
        "gi",
      );

      // Split the text on delimiters but keep the delimiters
      let sections = allText.split(delimiterPattern).filter((section) => section.trim().length > 0);

      console.log("Sections found:", sections.length);

      // Clean and format each section
      let formattedText = "";
      for (let i = 0; i < sections.length; i++) {
        let section = sections[i].trim();

        // Skip very short sections or obvious junk
        if (
          section.length < 2 ||
          section.toLowerCase().includes("cookie") ||
          section.toLowerCase().includes("javascript") ||
          section.match(/^[0-9]+$/)
        ) {
          continue;
        }

        // If this section is a delimiter, add it with proper spacing
        if (delimiters.some((d) => section.toLowerCase().includes(d.toLowerCase()))) {
          if (formattedText.length > 0) {
            formattedText += "\n\n";
          }
          formattedText += section;

          // If the next section exists and isn't a delimiter, add it on the same line
          if (i + 1 < sections.length) {
            const nextSection = sections[i + 1].trim();
            if (
              nextSection &&
              !delimiters.some((d) => nextSection.toLowerCase().includes(d.toLowerCase()))
            ) {
              formattedText += " " + nextSection;
              i++; // Skip the next section since we just added it
            }
          }
        } else {
          // This is content, add it with appropriate spacing
          if (formattedText.length > 0 && !formattedText.endsWith(" ")) {
            formattedText += "\n";
          }
          formattedText += section;
        }
      }

      // Remove consecutive duplicate lines
      let lines = formattedText.split("\n");
      let dedupedLines = [];
      let lastLine = "";

      for (let line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine !== lastLine) {
          dedupedLines.push(line);
          lastLine = trimmedLine;
        }
      }

      // Also remove duplicate credit lines that might not be consecutive
      let finalLines = [];
      let seenCredits = new Set();

      for (let line of dedupedLines) {
        const trimmedLine = line.trim();

        // Check if this is a credit line
        if (
          trimmedLine.match(
            /^(Written By|Written-By|Producer|Engineer|Design|Distributed By|Directed By|Arranged By|Mixed By|Mastered By)/i,
          )
        ) {
          // Normalize the credit line for comparison
          const normalizedCredit = trimmedLine.replace(/Written-By/gi, "Written By").toLowerCase();

          if (!seenCredits.has(normalizedCredit)) {
            seenCredits.add(normalizedCredit);
            finalLines.push(line);
          }
          // Skip if we've already seen this credit
        } else {
          // Not a credit line, always include
          finalLines.push(line);
        }
      }

      let cleanText = finalLines.join("\n");

      console.log("Original sections:", sections.length);
      console.log("After dedup lines:", dedupedLines.length);
      console.log("Final lines:", finalLines.length);

      if (cleanText.length < 50) {
        throw new Error("Not enough content extracted");
      }

      // Retrieve condition and price from localStorage
      const savedCondition = localStorage.getItem("discogs_temp_condition") || "";
      const savedPrice = localStorage.getItem("discogs_temp_price") || "";
      const savedOriginalDescription =
        localStorage.getItem("discogs_temp_original_description") || "";

      let conditionAndPriceSection = "";
      if (savedCondition || savedPrice) {
        conditionAndPriceSection = `\n\nOUR COPY:\nCondition: ${savedCondition}\nPrice: ${savedPrice}`;

        if (savedOriginalDescription) {
          conditionAndPriceSection += `\nOriginal Description: ${savedOriginalDescription}`;
        }
      }

      // Clean up localStorage
      localStorage.removeItem("discogs_temp_condition");
      localStorage.removeItem("discogs_temp_price");
      localStorage.removeItem("discogs_temp_original_description");

      // Add VinylScribe prompt at the beginning
      const vinylScribePrompt = `You are VinylScribe, a specialist assistant for creating vinyl record listing descriptions. When the user provides copied text showing both the Discogs release page and their listing details, your job is to:

  1. Carefully examine the provided text to gather information about:
     - The specific pressing details from the Discogs release page
     - The condition notes and any comments from the seller's listing page

  2. CRITICAL: Use ONLY the information provided in the Discogs page text. DO NOT search for additional information or make assumptions about details not explicitly stated on the page.

  3. Focus on the physical characteristics of the record:
     - Release year and pressing plant if available
     - Label and catalog number
     - Original vs reissue status
     - Notable physical features (colored vinyl, inserts, gatefold, etc.)
     - Matrix numbers or etching details if significant
     - Pressing-specific characteristics (club edition, promo, etc.)

  4. Generate a concise (3-4 line) description that:
     - Begins with an attention-grabbing but authentic collector-focused phrase (like "HONKY-TONK CLASSIC!" "RHYTHM DEPARTURE!" "CHART RARITY!" "PSYCH OBSCURITY!" "BRITISH INVASION!" "MOTOWN MAGIC!") – avoid corny phrases about pressing plants like "SCRANTON SPECIAL!" or "TERRA HAUTE TREASURE!"
     - Highlights distinctive pressing characteristics
     - Mentions any specific pressing variants or identifiers
     - Notes physical components (inserts, booklets, etc.) ONLY IF explicitly mentioned in the listing notes
     - Includes relevant artist history or cultural significance when it relates to the specific pressing

  5. CRITICAL: Create a clearly labeled section with the artist and album name as a header, followed by the description in a markdown code block. Format EXACTLY like this:

     ## Artist Name - Album Title (Label Year)
     \`\`\`
     [Description text here]
     \`\`\`

  6. ALWAYS include the artist name, album title, label, and year in the header above the code block so the user can easily identify which description belongs to which release.

  Use the condition information (NM, VG+, etc.) exactly as provided in the listing page.

  IMPORTANT: If the seller's listing includes specific condition details (like "jacket ripped along top", "sealed", "jacket torn", "brand new inners", etc.), include these details in the description as they are crucial condition information.

  ALSO IMPORTANT: Check the "Original Description" section for any condition-related information that should be preserved in the new description (damage notes, special handling, etc.).

  Don't waste words on subjective statements like "rare" or "hard to find" unless there's specific pressing information supporting limited availability (numbered editions, etc.).

  DO NOT ADD ANY DETAILS ABOUT COMPONENTS (inner sleeves, posters, inserts, etc.) UNLESS THEY ARE SPECIFICALLY MENTIONED IN THE LISTING COMMENTS. Don't assume anything is included that isn't explicitly stated.

  🚨 CRITICAL: DO NOT HALLUCINATE OR INVENT DETAILS. If the Discogs page shows "US" as country, DO NOT claim it's a Chinese pressing. If lock grooves aren't mentioned, DO NOT add them. If pressing plant details aren't shown, DO NOT make them up. Stick strictly to what's actually on the page.

  DO include interesting connections that make the record more valuable or significant to collectors, but ONLY if this information is clearly stated on the Discogs page:
  - Regional significance or pressing location oddities
  - Artist connections (members from other bands, session musicians)
  - Label transitions (first/last release on a particular label)
  - Career watersheds or sound evolution reflected in specific releases
  - Oddities, misprints, variations or strange pressing details
  - Historical context relevant to the physical pressing

  If information is incomplete, work with what is available on the Discogs page rather than inventing details.

  🚨🚨🚨 VERY IMPORTANT: THE FINAL DESCRIPTION MUST BE 500 CHARACTERS OR LESS. ABSOLUTELY DO NOT GO OVER. 🚨🚨🚨

  EXAMPLES:

  ## The Beatles - Revolver (Parlophone 1966)
  \`\`\`
  BRITISH INVASION CORNERSTONE! NM/VG+ 1966 UK Parlophone first pressing (PMC 7009) with crucial KT tax code and "Doctor Robert" spelling error on label. XEX 606-1/XEX 607-1 matrices with Dick James Music credits. Complete with original black inner sleeve. Essential early pressing featuring loud Peter Blake-influenced mono mix before Capitol's altered US version.
  \`\`\`

  ## 13th Floor Elevators – The Psychedelic Sounds of the 13th Floor Elevators (International Artists 1966)
  \`\`\`
  TEXAS PSYCH HOLY GRAIL! VG/VG- 1966 International Artists mono pressing (IA LP-1) with crucial first issue blue/white labels. Etched "JAH" in runout denoting Jim Holloway mastering. Houston-pressed copy from first 1,500 run before widespread distribution. Original mix with stronger electric jug presence than subsequent repressings.
  \`\`\`

  ---

  `;

      // Copy to clipboard
      await navigator.clipboard.writeText(vinylScribePrompt + cleanText + conditionAndPriceSection);
      console.log("Successfully copied to clipboard");

      buttonElement.textContent = "✅ Copied!";
      buttonElement.style.color = "#28a745";

      // Show success ripple animation
      showSuccessRipple();

      setTimeout(() => {
        buttonElement.textContent = originalText;
        buttonElement.style.color = "#ff6b6b";
        buttonElement.style.pointerEvents = "auto";
      }, 2000);
    } catch (error) {
      console.error("Error scraping release info:", error);
      buttonElement.textContent = "❌ Error";
      buttonElement.style.color = "#dc3545";

      setTimeout(() => {
        buttonElement.textContent = originalText;
        buttonElement.style.color = "#ff6b6b";
        buttonElement.style.pointerEvents = "auto";
      }, 2000);
    }
  }

  // Run when page loads
  setTimeout(highlightRows, 1000);

  // Watch for changes
  const observer = new MutationObserver(() => setTimeout(highlightRows, 500));
  observer.observe(document.body, { childList: true, subtree: true });

  console.log("Discogs highlighter loaded");
})();
