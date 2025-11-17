// ==UserScript==
// @name         Discogs Item Collapser v1.0
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Collapses multiple items in orders to a toggle view
// @author       rova_records
// @match        https://www.discogs.com/sell/orders*
// @exclude      https://www.discogs.com/sell/orders*archived=Y*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_order-item-collapse.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_order-item-collapse.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function () {
  "use strict";

  // Add CSS for the toggle functionality
  const style = document.createElement("style");
  style.textContent = `
        .collapsed-items {
            display: none;
        }
        
        .item-toggle {
            cursor: pointer;
            color: #0c7cd5;
            font-weight: bold;
            margin-left: 5px;
        }
        
        .item-toggle:hover {
            text-decoration: underline;
        }
        
        .first-item {
            margin-bottom: 5px;
        }
    `;
  document.head.appendChild(style);

  // Function to process the order table
  function processOrderTable() {
    // Find all order item cells
    const itemCells = document.querySelectorAll("td.left.order_item_name");

    itemCells.forEach((cell) => {
      // Check if this cell has multiple items
      const itemCount = cell.innerHTML.match(/(\d+) Items:/);

      if (itemCount && parseInt(itemCount[1]) > 1) {
        const totalItems = parseInt(itemCount[1]);
        const hiddenItems = totalItems - 1;

        // Store the original HTML
        const originalHTML = cell.innerHTML;

        // Get the first item - extract everything between the "X Items:" text and the first <br>
        let firstItemMatch = originalHTML.match(/\d+ Items:<br>([\s\S]*?)<br>/);
        if (!firstItemMatch) return;

        let firstItem = firstItemMatch[1];

        // Create the toggle element
        const toggleHTML = `
                    <div class="first-item">${firstItem}</div>
                    <div class="item-toggle" data-expanded="false">+ ${hiddenItems} more items</div>
                    <div class="collapsed-items"></div>
                `;

        // Get the rest of the items by removing the first item and the "X Items:" text
        let remainingItems = originalHTML.replace(/\d+ Items:<br>[\s\S]*?<br>/, "");

        // Replace the cell content
        cell.innerHTML = toggleHTML;

        // Add the remaining items to the collapsed section
        cell.querySelector(".collapsed-items").innerHTML = remainingItems;

        // Add click handler for the toggle
        cell.querySelector(".item-toggle").addEventListener("click", function () {
          const collapsedItems = cell.querySelector(".collapsed-items");
          const isExpanded = this.getAttribute("data-expanded") === "true";

          if (isExpanded) {
            collapsedItems.style.display = "none";
            this.textContent = `+ ${hiddenItems} more items`;
            this.setAttribute("data-expanded", "false");
          } else {
            collapsedItems.style.display = "block";
            this.textContent = "- collapse items";
            this.setAttribute("data-expanded", "true");
          }
        });
      }
    });
  }

  // Run the script when the page loads and also on any potential AJAX updates
  function initScript() {
    processOrderTable();

    // Watch for changes in the DOM to handle AJAX-loaded content
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          processOrderTable();
        }
      }
    });

    // Start observing the order table or its container
    const orderTable = document.querySelector("table.orders_table");
    if (orderTable) {
      observer.observe(orderTable, { childList: true, subtree: true });
    }
  }

  // Initialize after the page has loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initScript);
  } else {
    initScript();
  }
})();
