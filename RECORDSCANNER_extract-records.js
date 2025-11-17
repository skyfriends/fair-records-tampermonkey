// ==UserScript==
// @name         RecordScanner to Discogs Auto Navigator v1.0
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Extract records from RecordScanner and auto-navigate to Discogs master releases
// @author       rova_records
// @match        https://recordscanner.com/user/*
// @match        https://www.discogs.com/search/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/RECORDSCANNER_extract-records.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/RECORDSCANNER_extract-records.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function() {
    'use strict';

    // Check if we're on RecordScanner or Discogs
    const isRecordScanner = window.location.hostname === 'recordscanner.com';
    const isDiscogs = window.location.hostname === 'www.discogs.com';

    // RECORDSCANNER FUNCTIONALITY
    if (isRecordScanner) {
        
        // Function to extract records from the page
    function extractRecords() {
        const records = [];
        
        // Find all record items - they are links with specific structure
        const recordLinks = document.querySelectorAll('a[href*="/user/"][href*="/item/"]');
        
        console.log(`Found ${recordLinks.length} record links on the page`);
        
        recordLinks.forEach((link, index) => {
            try {
                // Find the title and artist within each record link
                const textElements = link.querySelectorAll('div[dir="auto"]');
                
                console.log(`Record ${index + 1}: Found ${textElements.length} text elements`);
                
                if (textElements.length >= 2) {
                    // First text element is typically the title
                    const titleElement = textElements[0];
                    // Second text element is typically the artist
                    const artistElement = textElements[1];
                    
                    if (titleElement && artistElement) {
                        const title = titleElement.textContent.trim();
                        const artist = artistElement.textContent.trim();
                        
                        console.log(`Record ${index + 1}: "${title}" by "${artist}"`);
                        
                        // Only add if both title and artist exist and aren't empty
                        // Removed the title !== artist filter to allow self-titled albums
                        if (title && artist) {
                            records.push({
                                artist: artist,
                                title: title
                            });
                        } else {
                            console.log(`Record ${index + 1}: Skipped - empty title or artist`);
                        }
                    } else {
                        console.log(`Record ${index + 1}: Skipped - missing title or artist elements`);
                    }
                } else {
                    console.log(`Record ${index + 1}: Skipped - not enough text elements`);
                }
            } catch (error) {
                console.warn(`Error processing record item ${index + 1}:`, error);
            }
        });
        
        return records;
    }


    // Function to display the extracted records and optionally search them
    function displayRecords(autoSearch = false) {
        const records = extractRecords();
        
        if (records.length === 0) {
            console.log('No records found on this page.');
            return;
        }
        
        console.log(`Found ${records.length} records:`);
        console.log('================================');
        
        records.forEach((record, index) => {
            console.log(`${index + 1}. ${record.artist} - ${record.title}`);
        });
        
        console.log('================================');
        console.log('Raw data:', records);
        
        if (autoSearch) {
            console.log('Starting Discogs searches...');
            console.log(`Opening ${records.length} tabs at once!`);
            
            // Open ALL tabs immediately - no delays, no bullshit
            records.forEach((record, index) => {
                const searchQuery = `${record.artist} ${record.title}`;
                const searchUrl = `https://www.discogs.com/search/?q=${encodeURIComponent(searchQuery)}&type=all`;
                
                console.log(`Opening tab ${index + 1}/${records.length}: ${searchQuery}`);
                console.log(`URL: ${searchUrl}`);
                
                // Just fucking open it
                window.open(searchUrl, '_blank');
            });
            
            console.log(`Opened all ${records.length} tabs!`);
        }
    }

    // Wait for page to load, then extract records
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', displayRecords);
    } else {
        // Page already loaded
        setTimeout(displayRecords, 1000); // Small delay to ensure content is rendered
    }

    // Add modern-looking container with buttons
    function addExtractButtons() {
        // Create container
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            min-width: 200px;
        `;
        
        // Create title
        const title = document.createElement('div');
        title.textContent = 'Record Extractor';
        title.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            color: #333;
            margin-bottom: 12px;
            text-align: center;
        `;
        container.appendChild(title);
        
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;
        
        // Extract Records button
        const extractButton = document.createElement('button');
        extractButton.textContent = 'Extract Records';
        extractButton.style.cssText = `
            padding: 10px 16px;
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
        `;
        
        extractButton.addEventListener('mouseenter', () => {
            extractButton.style.transform = 'translateY(-1px)';
            extractButton.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.4)';
        });
        
        extractButton.addEventListener('mouseleave', () => {
            extractButton.style.transform = 'translateY(0)';
            extractButton.style.boxShadow = '0 2px 8px rgba(76, 175, 80, 0.3)';
        });
        
        extractButton.addEventListener('click', () => displayRecords(false));
        buttonContainer.appendChild(extractButton);
        
        // Search on Discogs button
        const searchButton = document.createElement('button');
        searchButton.textContent = 'Search on Discogs';
        searchButton.style.cssText = `
            padding: 10px 16px;
            background: linear-gradient(135deg, #FF5722, #e64a19);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(255, 87, 34, 0.3);
        `;
        
        searchButton.addEventListener('mouseenter', () => {
            searchButton.style.transform = 'translateY(-1px)';
            searchButton.style.boxShadow = '0 4px 12px rgba(255, 87, 34, 0.4)';
        });
        
        searchButton.addEventListener('mouseleave', () => {
            searchButton.style.transform = 'translateY(0)';
            searchButton.style.boxShadow = '0 2px 8px rgba(255, 87, 34, 0.3)';
        });
        
        searchButton.addEventListener('click', () => displayRecords(true));
        buttonContainer.appendChild(searchButton);
        
        container.appendChild(buttonContainer);
        document.body.appendChild(container);
    }

        // Add the buttons after page loads
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', addExtractButtons);
        } else {
            addExtractButtons();
        }
    
    } // End RecordScanner functionality

    // DISCOGS FUNCTIONALITY
    if (isDiscogs && window.location.pathname.includes('/search/')) {
        
        // Function to find and click the first master release
        function findAndNavigateToMasterRelease() {
            // Wait for search results to load
            const searchResults = document.querySelector('#search_results');
            
            if (!searchResults) {
                console.log('Search results not found, waiting...');
                setTimeout(findAndNavigateToMasterRelease, 1000);
                return;
            }

            // Find the first master release (data-object-type="master release")
            const masterRelease = searchResults.querySelector('li[data-object-type="master release"]');
            
            if (masterRelease) {
                // Find the link within the master release item
                const masterLink = masterRelease.querySelector('a[href*="/master/"]');
                
                if (masterLink) {
                    const href = masterLink.getAttribute('href');
                    console.log('Found master release:', href);
                    
                    // Navigate to the master release page
                    window.location.href = href;
                    return;
                }
            }

            // If no master release found, try to find any release and navigate to its master
            const anyRelease = searchResults.querySelector('li[data-object-type="release"][data-master-id]');
            
            if (anyRelease) {
                const masterId = anyRelease.getAttribute('data-master-id');
                if (masterId) {
                    // Extract artist and title from the release
                    const titleElement = anyRelease.querySelector('.search_result_title');
                    const artistElement = anyRelease.querySelector('.card-artist-name a');
                    
                    if (titleElement && artistElement) {
                        const title = titleElement.textContent.trim();
                        const artist = artistElement.textContent.trim();
                        
                        // Construct master release URL
                        const masterUrl = `/master/${masterId}-${artist.replace(/[^a-zA-Z0-9]/g, '-')}-${title.replace(/[^a-zA-Z0-9]/g, '-')}`;
                        console.log('Navigating to master via release:', masterUrl);
                        window.location.href = masterUrl;
                        return;
                    }
                }
            }

            // If still no master found, log available results for debugging
            const allResults = searchResults.querySelectorAll('li[data-object-type]');
            console.log(`Found ${allResults.length} search results:`);
            allResults.forEach((result, index) => {
                const type = result.getAttribute('data-object-type');
                const id = result.getAttribute('data-id');
                const masterId = result.getAttribute('data-master-id');
                console.log(`${index + 1}. Type: ${type}, ID: ${id}, Master ID: ${masterId}`);
            });

            if (allResults.length === 0) {
                console.log('No search results found. The search might not have returned any matches.');
            } else {
                console.log('No master release found in search results. This might be a single, compilation, or the search returned different types of results.');
            }
        }

        // Function to add a manual navigation button
        function addNavigationButton() {
            const button = document.createElement('button');
            button.textContent = 'Go to Master Release';
            button.style.position = 'fixed';
            button.style.top = '10px';
            button.style.left = '10px';
            button.style.zIndex = '9999';
            button.style.padding = '10px';
            button.style.backgroundColor = '#007bff';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '5px';
            button.style.cursor = 'pointer';
            
            button.addEventListener('click', findAndNavigateToMasterRelease);
            document.body.appendChild(button);
        }

        // Wait for page to load and auto-navigate
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(findAndNavigateToMasterRelease, 2000); // Wait 2 seconds for search results
                addNavigationButton();
            });
        } else {
            setTimeout(findAndNavigateToMasterRelease, 2000); // Wait 2 seconds for search results
            addNavigationButton();
        }
        
    } // End Discogs functionality

})();
