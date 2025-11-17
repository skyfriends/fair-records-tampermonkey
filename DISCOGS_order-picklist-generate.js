// ==UserScript==
// @name         Discogs Order Pick List with Locations v2.1
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Injects a button to print a clean pick list of Discogs orders and shows item locations on the orders page
// @author       rova_records
// @match        https://www.discogs.com/sell/orders
// @match        https://www.discogs.com/sell/orders?*
// @exclude      https://www.discogs.com/sell/orders?*status=Shipped*
// @exclude      https://www.discogs.com/sell/orders?*archived=Y*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_order-picklist-generate.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_order-picklist-generate.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function() {
    'use strict';

    // Store fetched order details to avoid redundant requests
    const orderDetailsCache = new Map();

    function createButton() {
        const btn = document.createElement('button');
        btn.textContent = 'Print Pick List';
        btn.style.position = 'fixed';
        btn.style.top = '10px';
        btn.style.right = '10px';
        btn.style.zIndex = 10000;
        btn.style.padding = '6px 10px';
        btn.style.background = '#3f51b5';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', generatePickList);
        document.body.appendChild(btn);
    }

    function parseOrdersFromList() {
        const rows = document.querySelectorAll('table.marketplace-table tbody tr[id^="order"]');
        const orders = [];
        rows.forEach(row => {
            const orderNumEl = row.querySelector('.order_number a');
            const itemCell = row.querySelector('.order_item_name');
            if (!orderNumEl || !itemCell) return;

            const orderUrl = orderNumEl.getAttribute('href');
            const images = Array.from(itemCell.querySelectorAll('img')).map(img => img.getAttribute('src') || img.getAttribute('data-src') || '');
            const releases = Array.from(itemCell.querySelectorAll('a[href*="/release/"]'));
            const items = releases.map((a, idx) => ({
                name: a.textContent.trim(),
                img: images[idx] || ''
            }));
            const countMatch = itemCell.textContent.match(/(\d+)\s*Item/);
            const itemCount = countMatch ? parseInt(countMatch[1], 10) : items.length;

            orders.push({
                number: orderNumEl.textContent.trim(),
                url: orderUrl,
                items,
                itemCount,
                row: row,
                itemCell: itemCell
            });
        });
        return orders;
    }

    async function fetchOrderDetails(orderUrl) {
        // Check cache first
        if (orderDetailsCache.has(orderUrl)) {
            return orderDetailsCache.get(orderUrl);
        }

        try {
            const response = await fetch(orderUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract items and their locations from the order detail page
            const items = [];
            const itemRows = doc.querySelectorAll('td.order_item');
            
            itemRows.forEach(row => {
                // Get item name
                const itemLink = row.querySelector('.order-item-info a[href*="/release/"]');
                if (!itemLink) return;
                
                const itemName = itemLink.textContent.trim();
                
                // Get item image
                const itemImg = row.querySelector('img');
                const img = itemImg ? (itemImg.getAttribute('src') || itemImg.getAttribute('data-src') || '') : '';
                
                // Get location for this specific item
                let location = '';
                const locationElements = row.querySelectorAll('strong');
                for (let strong of locationElements) {
                    if (strong.textContent.includes('Location:')) {
                        // Get the text content after the strong tag
                        const parent = strong.parentNode;
                        const fullText = parent.textContent;
                        const locationMatch = fullText.match(/Location:\s*([^\n\r]+)/);
                        if (locationMatch) {
                            location = locationMatch[1].trim();
                            break;
                        }
                    }
                }
                
                // Alternative method if location not found
                if (!location) {
                    const rowText = row.textContent;
                    const locationMatch = rowText.match(/Location:\s*([A-Z0-9]+)/);
                    if (locationMatch) {
                        location = locationMatch[1].trim();
                    }
                }
                
                items.push({
                    name: itemName,
                    img: img,
                    location: location
                });
            });
            
            // Cache the result
            orderDetailsCache.set(orderUrl, items);
            
            return items;
        } catch (error) {
            console.error('Failed to fetch order details:', error);
            return [];
        }
    }

    async function injectLocationBadges() {
        const orderList = parseOrdersFromList();
        
        for (const order of orderList) {
            const detailedItems = await fetchOrderDetails(order.url);
            
            // First, handle any "View X more items" links to expand them
            const moreItemsLink = order.itemCell.querySelector('a[onclick*="toggle_items"]');
            if (moreItemsLink) {
                // Find the hidden items container
                const hiddenItemsContainer = order.itemCell.querySelector('.items_hide');
                if (hiddenItemsContainer) {
                    // Make sure hidden items are visible for processing
                    hiddenItemsContainer.style.display = 'block';
                }
            }
            
            // Get all item links including those that might be hidden
            const allItemLinks = order.itemCell.querySelectorAll('a[href*="/release/"]');
            
            allItemLinks.forEach((link) => {
                const itemName = link.textContent.trim();
                // Find matching item in detailed items by name
                const detailedItem = detailedItems.find(item => item.name === itemName);
                
                if (detailedItem && detailedItem.location) {
                    // Check if location badge already exists
                    const existingBadge = link.parentElement.querySelector('.location-badge-' + detailedItem.location);
                    if (!existingBadge) {
                        // Create location badge
                        const locationBadge = document.createElement('span');
                        locationBadge.className = 'location-badge location-badge-' + detailedItem.location;
                        locationBadge.textContent = detailedItem.location;
                        locationBadge.style.display = 'inline-block';
                        locationBadge.style.marginRight = '6px';
                        locationBadge.style.padding = '2px 6px';
                        locationBadge.style.backgroundColor = '#e74c3c';
                        locationBadge.style.color = '#fff';
                        locationBadge.style.fontSize = '11px';
                        locationBadge.style.fontWeight = 'bold';
                        locationBadge.style.borderRadius = '3px';
                        locationBadge.style.verticalAlign = 'middle';
                        
                        // Insert before the link
                        link.parentNode.insertBefore(locationBadge, link);
                    }
                }
            });
            
            // Restore hidden state if items were hidden
            if (moreItemsLink) {
                const hiddenItemsContainer = order.itemCell.querySelector('.items_hide');
                if (hiddenItemsContainer && hiddenItemsContainer.style.display === 'block') {
                    hiddenItemsContainer.style.display = '';
                }
            }
        }
    }

    async function generatePickList() {
        const orderList = parseOrdersFromList();
        const loadingMsg = document.createElement('div');
        loadingMsg.textContent = 'Loading order details...';
        loadingMsg.style.position = 'fixed';
        loadingMsg.style.top = '50px';
        loadingMsg.style.right = '10px';
        loadingMsg.style.background = '#fff';
        loadingMsg.style.padding = '10px';
        loadingMsg.style.border = '1px solid #ccc';
        loadingMsg.style.borderRadius = '4px';
        loadingMsg.style.zIndex = 10001;
        document.body.appendChild(loadingMsg);

        // Fetch detailed items for each order
        const orders = [];
        for (let i = 0; i < orderList.length; i++) {
            const order = orderList[i];
            loadingMsg.textContent = `Loading order ${i + 1} of ${orderList.length}...`;
            const detailedItems = await fetchOrderDetails(order.url);
            orders.push({
                number: order.number,
                items: detailedItems,
                itemCount: detailedItems.length
            });
        }

        document.body.removeChild(loadingMsg);

        const htmlParts = [
            '<html><head><title>Pick List</title>',
            '<style>',
            'body{font-family:Arial,Helvetica,sans-serif;padding:20px;}',
            'h1{font-size:24px;margin-bottom:20px;}',
            'h2{margin-top:25px;font-size:18px;}',
            '.location{color:#e74c3c;font-weight:bold;margin-left:10px;}',
            '.item{display:flex;align-items:center;margin-left:20px;margin-bottom:8px;}',
            '.item img{width:60px;height:60px;object-fit:cover;margin-right:10px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,0.3);}',
            '.item-info{flex:1;}',
            '</style>',
            '</head><body>',
            '<h1>Order Pick List</h1>'
        ];
        
        orders.forEach(o => {
            htmlParts.push(`<h2>Order ${o.number} - ${o.itemCount} Item${o.itemCount>1?'s':''}</h2>`);
            o.items.forEach(item => {
                const imgTag = item.img ? `<img src="${item.img}">` : '';
                const locationTag = item.location ? `<span class="location">Location: ${item.location}</span>` : '';
                htmlParts.push(`<div class="item">${imgTag}<div class="item-info"><span>${item.name}</span>${locationTag}</div></div>`);
            });
        });
        
        htmlParts.push('</body></html>');
        const win = window.open('', '_blank');
        win.document.open();
        win.document.write(htmlParts.join(''));
        win.document.close();

        function printWhenReady() {
            const images = win.document.images;
            if (images.length === 0) {
                win.focus();
                win.print();
                return;
            }
            let loaded = 0;
            const check = () => {
                loaded++;
                if (loaded === images.length) {
                    win.focus();
                    win.print();
                }
            };
            Array.from(images).forEach(img => {
                if (img.complete) {
                    check();
                } else {
                    img.addEventListener('load', check);
                    img.addEventListener('error', check);
                }
            });
        }

        if (win.document.readyState === 'complete') {
            printWhenReady();
        } else {
            win.addEventListener('load', printWhenReady);
        }
    }

    // Initialize the script
    function init() {
        createButton();
        
        // Inject location badges on page load
        injectLocationBadges();
        
        // Also inject when the page content changes (e.g., pagination, filtering)
        const observer = new MutationObserver((mutations) => {
            const hasOrderChanges = mutations.some(mutation => {
                return Array.from(mutation.addedNodes).some(node => {
                    return node.nodeType === 1 && (
                        node.matches && node.matches('tr[id^="order"]') ||
                        node.querySelector && node.querySelector('tr[id^="order"]')
                    );
                });
            });
            
            if (hasOrderChanges) {
                setTimeout(injectLocationBadges, 500);
            }
        });
        
        const tableContainer = document.querySelector('table.marketplace-table');
        if (tableContainer) {
            observer.observe(tableContainer.parentElement, {
                childList: true,
                subtree: true
            });
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }
})();