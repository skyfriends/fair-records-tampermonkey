// ==UserScript==
// @name         Discogs Enhanced Navigator
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Enhanced Discogs navigation with toggleable auto-navigation features
// @author       rova_records
// @match        https://www.discogs.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/discogs-auto-allVersion-auto-sellCopy.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/discogs-auto-allVersion-auto-sellCopy.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function() {
    'use strict';

    // Configuration keys for localStorage
    const STORAGE_KEYS = {
        autoVersions: 'discogs_auto_versions',
        autoSell: 'discogs_auto_sell',
        panelVisible: 'discogs_panel_visible'
    };

    // Get setting from localStorage with default value
    function getSetting(key, defaultValue = false) {
        const value = localStorage.getItem(key);
        return value === null ? defaultValue : value === 'true';
    }

    // Save setting to localStorage
    function setSetting(key, value) {
        localStorage.setItem(key, value.toString());
        // Broadcast change to other tabs
        window.dispatchEvent(new StorageEvent('storage', {
            key: key,
            newValue: value.toString(),
            url: window.location.href
        }));
    }

    // Create control panel
    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'discogs-control-panel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            background: white;
            border: 2px solid #333;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            font-family: Arial, sans-serif;
            min-width: 250px;
        `;

        // Panel header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #ddd;
        `;
        
        const title = document.createElement('h3');
        title.textContent = 'Discogs Navigator';
        title.style.cssText = 'margin: 0; font-size: 16px; color: #333;';
        
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '−';
        toggleBtn.style.cssText = `
            background: none;
            border: 1px solid #666;
            border-radius: 3px;
            cursor: pointer;
            font-size: 18px;
            width: 24px;
            height: 24px;
            padding: 0;
        `;
        
        header.appendChild(title);
        header.appendChild(toggleBtn);
        panel.appendChild(header);

        // Options container
        const optionsContainer = document.createElement('div');
        optionsContainer.id = 'options-container';
        
        // Create toggle options
        const options = [
            {
                id: 'auto-versions',
                label: 'Auto Navigate to Versions',
                key: STORAGE_KEYS.autoVersions,
                description: 'Navigate to "See all versions"'
            },
            {
                id: 'auto-sell',
                label: 'Auto Navigate to Sell',
                key: STORAGE_KEYS.autoSell,
                description: 'Navigate to "Sell a copy"'
            }
        ];

        options.forEach(option => {
            const container = document.createElement('div');
            container.style.cssText = 'margin-bottom: 12px;';
            
            const label = document.createElement('label');
            label.style.cssText = 'display: flex; align-items: center; cursor: pointer;';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = option.id;
            checkbox.checked = getSetting(option.key);
            checkbox.style.cssText = 'margin-right: 8px;';
            
            const textContainer = document.createElement('div');
            textContainer.style.cssText = 'flex: 1;';
            
            const labelText = document.createElement('div');
            labelText.textContent = option.label;
            labelText.style.cssText = 'font-weight: bold; font-size: 14px;';
            
            const description = document.createElement('div');
            description.textContent = option.description;
            description.style.cssText = 'font-size: 12px; color: #666; margin-top: 2px;';
            
            textContainer.appendChild(labelText);
            textContainer.appendChild(description);
            
            label.appendChild(checkbox);
            label.appendChild(textContainer);
            container.appendChild(label);
            optionsContainer.appendChild(container);
            
            // Add change listener
            checkbox.addEventListener('change', () => {
                setSetting(option.key, checkbox.checked);
                if (checkbox.checked) {
                    checkAndNavigate();
                }
            });
        });
        
        panel.appendChild(optionsContainer);

        // Toggle panel visibility
        let isPanelMinimized = !getSetting(STORAGE_KEYS.panelVisible, true);
        
        function updatePanelVisibility() {
            if (isPanelMinimized) {
                optionsContainer.style.display = 'none';
                toggleBtn.textContent = '+';
                panel.style.minWidth = 'auto';
            } else {
                optionsContainer.style.display = 'block';
                toggleBtn.textContent = '−';
                panel.style.minWidth = '250px';
            }
        }
        
        updatePanelVisibility();
        
        toggleBtn.addEventListener('click', () => {
            isPanelMinimized = !isPanelMinimized;
            setSetting(STORAGE_KEYS.panelVisible, !isPanelMinimized);
            updatePanelVisibility();
        });

        return panel;
    }

    // Add visual indicator border
    function addIndicatorBorder(color = '#00ff00') {
        const existingStyle = document.getElementById('discogs-indicator-style');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        const style = document.createElement('style');
        style.id = 'discogs-indicator-style';
        style.textContent = `
            body {
                box-shadow: inset 0 0 0 4px ${color} !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Check and navigate based on settings
    function checkAndNavigate() {
        const isReleasePage = window.location.pathname.includes('/release/');
        const isMasterPage = window.location.pathname.includes('/master/');
        
        // Auto navigate to versions
        if (getSetting(STORAGE_KEYS.autoVersions) && isReleasePage) {
            const allVersionsLink = document.querySelector('a[href^="/master/"][hreflang="en"].link_wXY7O');
            if (allVersionsLink && allVersionsLink.textContent.trim() === 'See all versions') {
                addIndicatorBorder('#00ff00');
                setTimeout(() => {
                    window.location.href = allVersionsLink.href;
                }, 500);
                return;
            }
        }
        
        // Auto navigate to sell
        if (getSetting(STORAGE_KEYS.autoSell) && (isReleasePage || isMasterPage)) {
            const sellLink = document.querySelector('a[href^="/sell/post/"][hreflang="en"].link_wXY7O.sellLink_BLGF2');
            if (sellLink) {
                addIndicatorBorder('#ff9900');
                setTimeout(() => {
                    window.location.href = sellLink.href;
                }, 500);
                return;
            }
        }
    }

    // Listen for storage changes from other tabs
    window.addEventListener('storage', (e) => {
        if (Object.values(STORAGE_KEYS).includes(e.key)) {
            // Update checkbox states
            const checkboxes = document.querySelectorAll('#discogs-control-panel input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                if (checkbox.id === 'auto-versions' && e.key === STORAGE_KEYS.autoVersions) {
                    checkbox.checked = e.newValue === 'true';
                } else if (checkbox.id === 'auto-sell' && e.key === STORAGE_KEYS.autoSell) {
                    checkbox.checked = e.newValue === 'true';
                }
            });
            
            // Check if we should navigate based on new settings
            if (e.newValue === 'true') {
                checkAndNavigate();
            }
        }
    });

    // Initialize when page loads
    window.addEventListener('load', function() {
        // Create and add control panel
        const panel = createControlPanel();
        document.body.appendChild(panel);
        
        // Check if we should navigate
        checkAndNavigate();
    });
})();