// ==UserScript==
// @name         Edit Listing Bulk Opener v1.1
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds a button to open all "Edit Listing" links in new tabs
// @author       rova_records
// @match        *://discogs.com/*
// @match        *://*.discogs.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_edit-all-items-on-page.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_edit-all-items-on-page.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function() {
    'use strict';

    // Function to find all Edit Listing links
    function findEditListingLinks() {
        // Use a Set to ensure unique links based on href
        const links = document.querySelectorAll('a[href*="/sell/manage_edit"]');
        const uniqueLinks = new Map();
        
        links.forEach(link => {
            uniqueLinks.set(link.href, link);
        });
        
        return Array.from(uniqueLinks.values());
    }

    // Function to open all links in new tabs
    function openAllLinks() {
        const links = findEditListingLinks();
        
        if (links.length === 0) {
            alert('No "Edit Listing" links found on this page.');
            return;
        }

        // Confirm with user
        if (!confirm(`Found ${links.length} Edit Listing links. Open all in new tabs?`)) {
            return;
        }

        // Open each link in a new tab
        links.forEach((link, index) => {
            setTimeout(() => {
                window.open(link.href, '_blank');
            }, index * 100); // Stagger opening to avoid browser blocking
        });

        // Update button to show completion
        const button = document.getElementById('bulk-edit-opener');
        if (button) {
            const originalText = button.textContent;
            button.textContent = `Opened ${links.length} tabs!`;
            button.style.backgroundColor = '#28a745';
            
            setTimeout(() => {
                button.textContent = originalText;
                button.style.backgroundColor = '#007bff';
            }, 3000);
        }
    }

    // Function to create and inject the button
    function createButton() {
        // Check if button already exists
        const existingButton = document.getElementById('bulk-edit-opener');
        
        // Only add button if there are Edit Listing links on the page
        const links = findEditListingLinks();
        if (links.length === 0) {
            // Remove button if no links found
            if (existingButton) {
                existingButton.remove();
            }
            return;
        }

        // Update existing button count if it exists
        if (existingButton) {
            existingButton.textContent = `Open All Edit Links (${links.length})`;
            return;
        }

        // Create button
        const button = document.createElement('button');
        button.id = 'bulk-edit-opener';
        button.textContent = `Open All Edit Links (${links.length})`;
        button.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 999999;
            background-color: #007bff;
            color: white;
            border: none;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
        `;

        // Add hover effects
        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#0056b3';
            button.style.transform = 'translateY(-1px)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = '#007bff';
            button.style.transform = 'translateY(0)';
        });

        // Add click handler
        button.addEventListener('click', openAllLinks);

        // Inject into page
        document.body.appendChild(button);
    }

    // Only run on initial load and when manually triggered
    function init() {
        setTimeout(createButton, 1000); // Wait 1 second for page to load
    }

    // Run when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();