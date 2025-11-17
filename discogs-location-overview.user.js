// ==UserScript==
// @name         Discogs Order Location Overview
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Display a visual grid of album covers with their storage locations for easy reference
// @author       rova_records
// @match        https://www.discogs.com/sell/order/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/discogs-location-overview.user.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/discogs-location-overview.user.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        storageKey: 'discogsLocationOverviewVisible',
        imageSize: 180,
        locationFontSize: '16px'
    };

    // Main initialization
    function init() {
        // Wait for the order table to be present
        const orderTable = document.querySelector('.order_table');
        if (!orderTable) {
            console.log('Order table not found, retrying...');
            setTimeout(init, 500);
            return;
        }

        // Extract order items data
        const items = extractOrderItems();

        if (items.length === 0) {
            console.log('No order items found');
            return;
        }

        // Create and inject the overview panel
        createOverviewPanel(items);

        // Create toggle button
        createToggleButton();

        // Apply saved visibility state
        applySavedState();
    }

    // Extract data from order table rows
    function extractOrderItems() {
        const items = [];
        const rows = document.querySelectorAll('.order-item-row');

        rows.forEach(row => {
            const location = row.getAttribute('data-location') || '';
            const titleLink = row.querySelector('.order-item-info a');
            const itemId = row.getAttribute('data-id');

            // Try to get the full-quality image from the gallery data
            let imageUrl = '';

            // Method 1: Parse the data-images JSON from the image gallery
            const imageGallery = row.querySelector('.image_gallery');
            if (imageGallery) {
                const dataImages = imageGallery.getAttribute('data-images');
                if (dataImages) {
                    try {
                        // Parse the JSON (it uses HTML entities)
                        const imagesData = JSON.parse(dataImages);
                        // Get the first image's full URL
                        if (imagesData.length > 0 && imagesData[0].full) {
                            imageUrl = imagesData[0].full;
                        }
                    } catch (e) {
                        console.log('Failed to parse image data:', e);
                    }
                }
            }

            // Method 2: Fallback to thumbnail if gallery parsing failed
            if (!imageUrl) {
                const thumbnail = row.querySelector('.thumbnail_link img, .image_gallery img');
                if (thumbnail) {
                    imageUrl = thumbnail.src;
                }
            }

            if (imageUrl && itemId) {
                items.push({
                    id: itemId,
                    imageUrl: imageUrl,
                    location: location.trim(),
                    title: titleLink ? titleLink.textContent.trim() : 'Unknown Item'
                });
            }
        });

        return items;
    }

    // Create the overview panel
    function createOverviewPanel(items) {
        // Sort items by location
        items.sort((a, b) => {
            const locA = a.location || 'ZZZZ'; // Put empty locations at end
            const locB = b.location || 'ZZZZ';
            return locA.localeCompare(locB);
        });

        // Create panel container
        const panel = document.createElement('div');
        panel.id = 'location-overview-panel';
        panel.className = 'location-overview-panel';

        // Create items container
        const container = document.createElement('div');
        container.className = 'location-overview-container';

        // Track current location for alternating colors
        let currentLocation = null;
        let colorIndex = 0;

        // Create cards for each item
        items.forEach(item => {
            // Change color when location changes
            if (item.location !== currentLocation) {
                currentLocation = item.location;
                colorIndex = (colorIndex + 1) % 2;
            }

            const card = createItemCard(item, colorIndex);
            container.appendChild(card);
        });

        panel.appendChild(container);

        // Inject styles
        injectStyles();

        // Insert panel at the top of body
        document.body.insertBefore(panel, document.body.firstChild);
    }

    // Create individual item card
    function createItemCard(item, colorIndex) {
        const card = document.createElement('div');
        card.className = `location-item location-color-${colorIndex}`;
        card.setAttribute('data-item-id', item.id);
        card.setAttribute('title', `${item.title}\n\nLocation: ${item.location || 'None'}`);

        card.innerHTML = `
            <img src="${item.imageUrl}" alt="${item.title}" />
            <div class="location-label">${item.location || '—'}</div>
        `;

        return card;
    }

    // Create toggle button
    function createToggleButton() {
        const button = document.createElement('button');
        button.id = 'location-overview-toggle';
        button.className = 'location-overview-toggle';
        button.innerHTML = '📍 Toggle Locations';

        button.addEventListener('click', togglePanel);

        // Insert button at top of body
        document.body.appendChild(button);
    }

    // Toggle panel visibility
    function togglePanel() {
        const panel = document.getElementById('location-overview-panel');
        if (!panel) return;

        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';

        // Save state
        localStorage.setItem(CONFIG.storageKey, !isVisible);
    }

    // Apply saved visibility state
    function applySavedState() {
        const savedState = localStorage.getItem(CONFIG.storageKey);
        const panel = document.getElementById('location-overview-panel');

        if (panel && savedState === 'false') {
            panel.style.display = 'none';
        }
    }

    // Inject CSS styles
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Panel Container */
            .location-overview-panel {
                position: sticky;
                top: 0;
                left: 0;
                right: 0;
                background: #fff;
                border-bottom: 3px solid #ccc;
                z-index: 9999;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                max-height: 90vh;
                overflow-y: auto;
                padding: 10px;
            }

            /* Container */
            .location-overview-container {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: flex-start;
                justify-content: flex-start;
            }

            /* Item */
            .location-item {
                flex-shrink: 0;
                text-align: center;
                cursor: pointer;
                border: 2px solid #ccc;
                border-radius: 4px;
                overflow: hidden;
                transition: all 0.2s;
            }

            .location-item:hover {
                border-color: #666;
                box-shadow: 0 2px 8px rgba(0,0,0,0.25);
                transform: translateY(-2px);
            }

            /* Alternating background colors for location groups */
            .location-item.location-color-0 {
                background: #e3f2fd;
            }

            .location-item.location-color-1 {
                background: #fff3e0;
            }

            .location-item img {
                width: ${CONFIG.imageSize}px;
                height: ${CONFIG.imageSize}px;
                object-fit: contain;
                display: block;
                background: #fff;
            }

            /* Location Label */
            .location-label {
                font-size: ${CONFIG.locationFontSize};
                font-weight: bold;
                color: #000;
                padding: 4px 8px;
                text-align: center;
            }

            /* Toggle Button */
            .location-overview-toggle {
                position: fixed;
                top: 10px;
                right: 10px;
                background: #4caf50;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                z-index: 10000;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                transition: background 0.2s;
            }

            .location-overview-toggle:hover {
                background: #45a049;
            }
        `;

        document.head.appendChild(style);
    }

    // Start the script
    init();
})();
