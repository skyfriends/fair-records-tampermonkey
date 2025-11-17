// ==UserScript==
// @name         Discogs AI Description Generator v1.1.0
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Generate enhanced product descriptions using OpenAI GPT-4o mini API for Discogs sell/post and manage/edit pages
// @author       rova_records
// @match        https://www.discogs.com/sell/post/*
// @match        https://www.discogs.com/sell/manage_edit*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @connect      api.openai.com
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_ai-desciption-generate.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_ai-desciption-generate.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function() {
    'use strict';
    
    // Debug: Log that the script is loading
    console.log('[DEBUG] Discogs AI userscript loading on:', window.location.href);

    // Version and Update Management
    const VERSION_INFO = {
        version: '1.1.0',
        releaseDate: '2025-02-08',
        features: [
            'Release page data caching for improved performance',
            'Debouncing to prevent multiple simultaneous API calls',
            'Optimized DOM manipulation and event handling',
            'Automatic update checking and notification system'
        ],
        changelog: {
            '1.1.0': [
                'Added release page data caching',
                'Implemented API call debouncing',
                'Optimized DOM operations',
                'Added version management and update checking'
            ],
            '1.0.0': [
                'Initial release with AI description generation',
                'OpenAI GPT-4o mini integration',
                'Comprehensive error handling',
                'Form integration and validation'
            ]
        }
    };

    // Performance Cache Manager
    class CacheManager {
        constructor() {
            this.CACHE_PREFIX = 'discogs_ai_cache_';
            this.CACHE_EXPIRY_HOURS = 24; // Cache release data for 24 hours
            this.MAX_CACHE_ENTRIES = 100; // Limit cache size
        }

        /**
         * Generate cache key for release data
         * @param {string} releaseUrl - Release URL
         * @returns {string} Cache key
         */
        generateCacheKey(releaseUrl) {
            // Extract release ID from URL for consistent caching
            const releaseId = releaseUrl.match(/\/release\/(\d+)/)?.[1];
            return releaseId ? `${this.CACHE_PREFIX}release_${releaseId}` : null;
        }

        /**
         * Store release data in cache with expiration
         * @param {string} releaseUrl - Release URL
         * @param {Object} data - Release data to cache
         */
        cacheReleaseData(releaseUrl, data) {
            try {
                const cacheKey = this.generateCacheKey(releaseUrl);
                if (!cacheKey) return false;

                const cacheEntry = {
                    data,
                    timestamp: Date.now(),
                    url: releaseUrl,
                    version: VERSION_INFO.version
                };

                GM_setValue(cacheKey, JSON.stringify(cacheEntry));
                this.cleanupOldCacheEntries();
                
                console.debug(`[Cache] Stored release data for ${releaseUrl}`);
                return true;
            } catch (error) {
                console.warn('[Cache] Failed to store release data:', error);
                return false;
            }
        }

        /**
         * Retrieve cached release data if still valid
         * @param {string} releaseUrl - Release URL
         * @returns {Object|null} Cached data or null if not found/expired
         */
        getCachedReleaseData(releaseUrl) {
            try {
                const cacheKey = this.generateCacheKey(releaseUrl);
                if (!cacheKey) return null;

                const cachedData = GM_getValue(cacheKey, null);
                if (!cachedData) return null;

                const cacheEntry = JSON.parse(cachedData);
                const now = Date.now();
                const expiryTime = cacheEntry.timestamp + (this.CACHE_EXPIRY_HOURS * 60 * 60 * 1000);

                // Check if cache is still valid
                if (now > expiryTime) {
                    GM_setValue(cacheKey, null); // Clear expired cache
                    console.debug(`[Cache] Expired cache entry removed for ${releaseUrl}`);
                    return null;
                }

                // Check version compatibility
                if (cacheEntry.version !== VERSION_INFO.version) {
                    GM_setValue(cacheKey, null); // Clear incompatible cache
                    console.debug(`[Cache] Version mismatch, cleared cache for ${releaseUrl}`);
                    return null;
                }

                console.debug(`[Cache] Retrieved cached data for ${releaseUrl}`);
                return cacheEntry.data;
            } catch (error) {
                console.warn('[Cache] Failed to retrieve cached data:', error);
                return null;
            }
        }

        /**
         * Clean up old cache entries to prevent storage bloat
         */
        cleanupOldCacheEntries() {
            try {
                const allKeys = [];
                
                // Get all cache keys (GM_listValues is not available, so we track manually)
                const cacheIndex = GM_getValue(`${this.CACHE_PREFIX}index`, '[]');
                const existingKeys = JSON.parse(cacheIndex);
                
                const validKeys = [];
                const now = Date.now();
                
                existingKeys.forEach(key => {
                    try {
                        const cachedData = GM_getValue(key, null);
                        if (cachedData) {
                            const cacheEntry = JSON.parse(cachedData);
                            const expiryTime = cacheEntry.timestamp + (this.CACHE_EXPIRY_HOURS * 60 * 60 * 1000);
                            
                            if (now <= expiryTime && cacheEntry.version === VERSION_INFO.version) {
                                validKeys.push(key);
                            } else {
                                GM_setValue(key, null); // Clear expired/incompatible entry
                            }
                        }
                    } catch (error) {
                        GM_setValue(key, null); // Clear corrupted entry
                    }
                });

                // Limit cache size
                if (validKeys.length > this.MAX_CACHE_ENTRIES) {
                    const keysToRemove = validKeys.slice(0, validKeys.length - this.MAX_CACHE_ENTRIES);
                    keysToRemove.forEach(key => GM_setValue(key, null));
                    validKeys.splice(0, keysToRemove.length);
                }

                // Update cache index
                GM_setValue(`${this.CACHE_PREFIX}index`, JSON.stringify(validKeys));
                
                console.debug(`[Cache] Cleanup completed, ${validKeys.length} entries remaining`);
            } catch (error) {
                console.warn('[Cache] Cleanup failed:', error);
            }
        }

        /**
         * Add cache key to index for cleanup tracking
         * @param {string} cacheKey - Cache key to track
         */
        addToIndex(cacheKey) {
            try {
                const cacheIndex = GM_getValue(`${this.CACHE_PREFIX}index`, '[]');
                const existingKeys = JSON.parse(cacheIndex);
                
                if (!existingKeys.includes(cacheKey)) {
                    existingKeys.push(cacheKey);
                    GM_setValue(`${this.CACHE_PREFIX}index`, JSON.stringify(existingKeys));
                }
            } catch (error) {
                console.warn('[Cache] Failed to update index:', error);
            }
        }

        /**
         * Clear all cached data
         */
        clearAllCache() {
            try {
                const cacheIndex = GM_getValue(`${this.CACHE_PREFIX}index`, '[]');
                const existingKeys = JSON.parse(cacheIndex);
                
                existingKeys.forEach(key => GM_setValue(key, null));
                GM_setValue(`${this.CACHE_PREFIX}index`, '[]');
                
                console.log('[Cache] All cache data cleared');
            } catch (error) {
                console.warn('[Cache] Failed to clear cache:', error);
            }
        }

        /**
         * Get cache statistics
         * @returns {Object} Cache statistics
         */
        getCacheStats() {
            try {
                const cacheIndex = GM_getValue(`${this.CACHE_PREFIX}index`, '[]');
                const existingKeys = JSON.parse(cacheIndex);
                
                let totalSize = 0;
                let validEntries = 0;
                const now = Date.now();
                
                existingKeys.forEach(key => {
                    try {
                        const cachedData = GM_getValue(key, null);
                        if (cachedData) {
                            const cacheEntry = JSON.parse(cachedData);
                            const expiryTime = cacheEntry.timestamp + (this.CACHE_EXPIRY_HOURS * 60 * 60 * 1000);
                            
                            if (now <= expiryTime && cacheEntry.version === VERSION_INFO.version) {
                                validEntries++;
                                totalSize += cachedData.length;
                            }
                        }
                    } catch (error) {
                        // Ignore corrupted entries
                    }
                });

                return {
                    totalEntries: validEntries,
                    totalSizeBytes: totalSize,
                    totalSizeKB: Math.round(totalSize / 1024),
                    expiryHours: this.CACHE_EXPIRY_HOURS,
                    maxEntries: this.MAX_CACHE_ENTRIES
                };
            } catch (error) {
                console.warn('[Cache] Failed to get cache stats:', error);
                return { error: error.message };
            }
        }
    }

    // Debounce Manager for API Calls
    class DebounceManager {
        constructor() {
            this.activeOperations = new Map();
            this.debounceDelay = 1000; // 1 second debounce
        }

        /**
         * Debounce function execution to prevent multiple simultaneous calls
         * @param {string} key - Unique key for the operation
         * @param {Function} operation - Function to execute
         * @param {number} delay - Debounce delay in milliseconds
         * @returns {Promise} Promise that resolves with operation result
         */
        debounce(key, operation, delay = this.debounceDelay) {
            // If operation is already in progress, return the existing promise
            if (this.activeOperations.has(key)) {
                console.debug(`[Debounce] Operation ${key} already in progress, returning existing promise`);
                return this.activeOperations.get(key);
            }

            // Create new debounced operation
            const debouncedPromise = new Promise((resolve, reject) => {
                const timeoutId = setTimeout(async () => {
                    try {
                        console.debug(`[Debounce] Executing operation ${key}`);
                        const result = await operation();
                        this.activeOperations.delete(key);
                        resolve(result);
                    } catch (error) {
                        this.activeOperations.delete(key);
                        reject(error);
                    }
                }, delay);

                // Store cleanup function
                this.activeOperations.set(key, {
                    promise: debouncedPromise,
                    timeoutId,
                    cleanup: () => {
                        clearTimeout(timeoutId);
                        this.activeOperations.delete(key);
                    }
                });
            });

            // Store the promise for reuse
            this.activeOperations.set(key, debouncedPromise);
            return debouncedPromise;
        }

        /**
         * Cancel a debounced operation
         * @param {string} key - Operation key to cancel
         */
        cancel(key) {
            const operation = this.activeOperations.get(key);
            if (operation && operation.cleanup) {
                operation.cleanup();
                console.debug(`[Debounce] Cancelled operation ${key}`);
            }
        }

        /**
         * Cancel all active operations
         */
        cancelAll() {
            this.activeOperations.forEach((operation, key) => {
                if (operation.cleanup) {
                    operation.cleanup();
                }
            });
            this.activeOperations.clear();
            console.debug('[Debounce] Cancelled all operations');
        }

        /**
         * Check if operation is currently active
         * @param {string} key - Operation key
         * @returns {boolean} True if operation is active
         */
        isActive(key) {
            return this.activeOperations.has(key);
        }

        /**
         * Get active operations count
         * @returns {number} Number of active operations
         */
        getActiveCount() {
            return this.activeOperations.size;
        }
    }

    // DOM Optimization Manager
    class DOMOptimizer {
        constructor() {
            this.observerInstances = new Map();
            this.eventListeners = new Map();
            this.rafCallbacks = new Set();
        }

        /**
         * Optimized DOM element creation with caching
         * @param {string} tag - HTML tag name
         * @param {Object} attributes - Element attributes
         * @param {string} content - Element content
         * @returns {HTMLElement} Created element
         */
        createElement(tag, attributes = {}, content = '') {
            const element = document.createElement(tag);
            
            // Batch attribute setting
            Object.entries(attributes).forEach(([key, value]) => {
                if (key === 'style' && typeof value === 'object') {
                    Object.assign(element.style, value);
                } else {
                    element.setAttribute(key, value);
                }
            });

            if (content) {
                element.innerHTML = content;
            }

            return element;
        }

        /**
         * Optimized event listener management with automatic cleanup
         * @param {HTMLElement} element - Target element
         * @param {string} event - Event type
         * @param {Function} handler - Event handler
         * @param {Object} options - Event options
         * @returns {Function} Cleanup function
         */
        addEventListener(element, event, handler, options = {}) {
            const listenerId = `${element.id || 'anonymous'}_${event}_${Date.now()}`;
            
            // Wrap handler for debugging and cleanup
            const wrappedHandler = (e) => {
                try {
                    handler(e);
                } catch (error) {
                    console.error(`[DOM] Event handler error for ${event}:`, error);
                }
            };

            element.addEventListener(event, wrappedHandler, options);
            
            // Store for cleanup
            const cleanup = () => {
                element.removeEventListener(event, wrappedHandler, options);
                this.eventListeners.delete(listenerId);
            };
            
            this.eventListeners.set(listenerId, cleanup);
            
            return cleanup;
        }

        /**
         * Optimized DOM updates using requestAnimationFrame
         * @param {Function} updateFunction - Function to execute
         * @returns {Promise} Promise that resolves when update is complete
         */
        scheduleUpdate(updateFunction) {
            return new Promise((resolve) => {
                const rafCallback = () => {
                    try {
                        updateFunction();
                        this.rafCallbacks.delete(rafCallback);
                        resolve();
                    } catch (error) {
                        console.error('[DOM] Scheduled update error:', error);
                        this.rafCallbacks.delete(rafCallback);
                        resolve();
                    }
                };
                
                this.rafCallbacks.add(rafCallback);
                requestAnimationFrame(rafCallback);
            });
        }

        /**
         * Batch DOM operations for better performance
         * @param {Array} operations - Array of DOM operations
         */
        batchOperations(operations) {
            // Use document fragment for multiple insertions
            const fragment = document.createDocumentFragment();
            let targetParent = null;
            
            operations.forEach(operation => {
                try {
                    switch (operation.type) {
                        case 'create':
                            const element = this.createElement(
                                operation.tag, 
                                operation.attributes, 
                                operation.content
                            );
                            if (operation.parent) {
                                fragment.appendChild(element);
                                targetParent = operation.parent;
                            }
                            break;
                            
                        case 'modify':
                            if (operation.element) {
                                Object.entries(operation.changes).forEach(([key, value]) => {
                                    if (key === 'style') {
                                        Object.assign(operation.element.style, value);
                                    } else if (key === 'textContent') {
                                        operation.element.textContent = value;
                                    } else {
                                        operation.element.setAttribute(key, value);
                                    }
                                });
                            }
                            break;
                            
                        case 'remove':
                            if (operation.element && operation.element.parentNode) {
                                operation.element.parentNode.removeChild(operation.element);
                            }
                            break;
                    }
                } catch (error) {
                    console.error('[DOM] Batch operation error:', error);
                }
            });
            
            // Append fragment if we have elements to insert
            if (fragment.children.length > 0 && targetParent) {
                targetParent.appendChild(fragment);
            }
        }

        /**
         * Create optimized mutation observer
         * @param {HTMLElement} target - Element to observe
         * @param {Function} callback - Callback function
         * @param {Object} options - Observer options
         * @returns {MutationObserver} Observer instance
         */
        createObserver(target, callback, options = {}) {
            const observerId = `observer_${Date.now()}`;
            
            const observer = new MutationObserver((mutations) => {
                // Batch mutations for better performance
                const batchedMutations = {
                    added: [],
                    removed: [],
                    modified: []
                };
                
                mutations.forEach(mutation => {
                    switch (mutation.type) {
                        case 'childList':
                            batchedMutations.added.push(...Array.from(mutation.addedNodes));
                            batchedMutations.removed.push(...Array.from(mutation.removedNodes));
                            break;
                        case 'attributes':
                            batchedMutations.modified.push(mutation);
                            break;
                    }
                });
                
                try {
                    callback(batchedMutations, mutations);
                } catch (error) {
                    console.error('[DOM] Observer callback error:', error);
                }
            });
            
            observer.observe(target, {
                childList: true,
                attributes: true,
                subtree: false,
                ...options
            });
            
            this.observerInstances.set(observerId, observer);
            
            return observer;
        }

        /**
         * Clean up all DOM optimizations
         */
        cleanup() {
            // Remove all event listeners
            this.eventListeners.forEach(cleanup => cleanup());
            this.eventListeners.clear();
            
            // Disconnect all observers
            this.observerInstances.forEach(observer => observer.disconnect());
            this.observerInstances.clear();
            
            // Cancel pending RAF callbacks
            this.rafCallbacks.forEach(callback => {
                // RAF callbacks are automatically cleaned up, just clear the set
            });
            this.rafCallbacks.clear();
            
            console.debug('[DOM] Cleanup completed');
        }
    }

    // Update Manager for Version Control
    class UpdateManager {
        constructor() {
            this.UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
            this.LAST_CHECK_KEY = 'discogs_ai_last_update_check';
            this.UPDATE_URL = 'https://api.github.com/repos/your-repo/discogs-ai-description-generator/releases/latest';
        }

        /**
         * Check for updates if enough time has passed
         */
        async checkForUpdates() {
            try {
                const lastCheck = GM_getValue(this.LAST_CHECK_KEY, 0);
                const now = Date.now();
                
                if (now - lastCheck < this.UPDATE_CHECK_INTERVAL) {
                    console.debug('[Update] Skipping update check, too recent');
                    return;
                }
                
                console.debug('[Update] Checking for updates...');
                GM_setValue(this.LAST_CHECK_KEY, now);
                
                // Note: This would require @connect permission for GitHub API
                // For now, just log the current version
                this.showVersionInfo();
                
            } catch (error) {
                console.warn('[Update] Update check failed:', error);
            }
        }

        /**
         * Show current version information
         */
        showVersionInfo() {
            console.log(`[Version] Discogs AI Description Generator v${VERSION_INFO.version}`);
            console.log(`[Version] Release Date: ${VERSION_INFO.releaseDate}`);
            console.log('[Version] Features:', VERSION_INFO.features);
            
            // Store version info for debugging
            GM_setValue('discogs_ai_version_info', JSON.stringify(VERSION_INFO));
        }

        /**
         * Get version information
         * @returns {Object} Version information
         */
        getVersionInfo() {
            return {
                ...VERSION_INFO,
                userscriptInfo: typeof GM_info !== 'undefined' ? GM_info : null,
                installDate: GM_getValue('discogs_ai_install_date', null) || this.setInstallDate()
            };
        }

        /**
         * Set installation date
         * @returns {string} Installation date
         */
        setInstallDate() {
            const installDate = new Date().toISOString();
            GM_setValue('discogs_ai_install_date', installDate);
            return installDate;
        }

        /**
         * Show update notification if available
         * @param {string} newVersion - New version available
         * @param {string} updateUrl - URL to update
         */
        showUpdateNotification(newVersion, updateUrl) {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 16px 20px;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                z-index: 10000;
                max-width: 400px;
                box-shadow: 0 4px 16px rgba(76, 175, 80, 0.4);
                border-left: 4px solid #388E3C;
            `;
            
            notification.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 8px;">
                    🚀 Update Available
                </div>
                <div style="margin-bottom: 12px;">
                    Version ${newVersion} is available!<br>
                    Current: ${VERSION_INFO.version}
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button onclick="this.parentElement.parentElement.remove();" style="
                        background: rgba(255,255,255,0.2);
                        border: 1px solid rgba(255,255,255,0.3);
                        color: white;
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                    ">Later</button>
                    <button onclick="window.open('${updateUrl}', '_blank'); this.parentElement.parentElement.remove();" style="
                        background: white;
                        border: none;
                        color: #4CAF50;
                        padding: 6px 12px;
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: bold;
                        cursor: pointer;
                    ">Update</button>
                </div>
            `;
            
            document.body.appendChild(notification);
            
            // Auto-remove after 30 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 30000);
        }
    }

    // Configuration Module
    class ConfigManager {
        constructor() {
            this.API_KEY_STORAGE = 'discogs_ai_generator_api_key';
            this.CONFIG_STORAGE = 'discogs_ai_generator_config';
        }

        /**
         * Get stored OpenAI API key
         * @returns {string|null} API key or null if not set
         */
        getApiKey() {
            return GM_getValue(this.API_KEY_STORAGE, null);
        }

        /**
         * Store OpenAI API key securely
         * @param {string} key - The API key to store
         */
        setApiKey(key) {
            if (!key || typeof key !== 'string') {
                throw new Error('Invalid API key provided');
            }
            GM_setValue(this.API_KEY_STORAGE, key.trim());
        }

        /**
         * Validate API key format
         * @param {string} key - API key to validate
         * @returns {boolean} True if key format is valid
         */
        validateApiKeyFormat(key) {
            if (!key || typeof key !== 'string') {
                return false;
            }
            
            // OpenAI API keys start with 'sk-' and are typically 51 characters long
            const trimmedKey = key.trim();
            return trimmedKey.startsWith('sk-') && trimmedKey.length >= 20;
        }

        /**
         * Prompt user for API key with validation
         * @returns {Promise<string>} Promise that resolves to the API key
         */
        async promptForApiKey() {
            return new Promise((resolve, reject) => {
                const modal = this.createApiKeyModal();
                document.body.appendChild(modal);

                const input = modal.querySelector('#api-key-input');
                const saveBtn = modal.querySelector('#save-api-key');
                const cancelBtn = modal.querySelector('#cancel-api-key');
                const errorDiv = modal.querySelector('#api-key-error');

                const cleanup = () => {
                    document.body.removeChild(modal);
                };

                saveBtn.addEventListener('click', () => {
                    const apiKey = input.value.trim();
                    
                    if (!this.validateApiKeyFormat(apiKey)) {
                        errorDiv.textContent = 'Invalid API key format. OpenAI keys start with "sk-" and are at least 20 characters long.';
                        errorDiv.style.display = 'block';
                        return;
                    }

                    try {
                        this.setApiKey(apiKey);
                        cleanup();
                        resolve(apiKey);
                    } catch (error) {
                        errorDiv.textContent = `Error saving API key: ${error.message}`;
                        errorDiv.style.display = 'block';
                    }
                });

                cancelBtn.addEventListener('click', () => {
                    cleanup();
                    reject(new Error('User cancelled API key setup'));
                });

                // Focus the input
                input.focus();
            });
        }

        /**
         * Create API key input modal
         * @returns {HTMLElement} Modal element
         */
        createApiKeyModal() {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: Arial, sans-serif;
            `;

            modal.innerHTML = `
                <div style="
                    background: white;
                    padding: 30px;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    max-width: 500px;
                    width: 90%;
                ">
                    <h2 style="
                        margin: 0 0 20px 0;
                        color: #333;
                        font-size: 24px;
                        text-align: center;
                    ">🤖 OpenAI API Key Setup</h2>
                    
                    <p style="
                        margin: 0 0 20px 0;
                        color: #666;
                        line-height: 1.5;
                        text-align: center;
                    ">
                        To use AI description generation, please enter your OpenAI API key.<br>
                        <small>Your key will be stored securely in your browser.</small>
                    </p>
                    
                    <div style="margin-bottom: 20px;">
                        <label for="api-key-input" style="
                            display: block;
                            margin-bottom: 8px;
                            font-weight: bold;
                            color: #333;
                        ">OpenAI API Key:</label>
                        <input 
                            type="password" 
                            id="api-key-input" 
                            placeholder="sk-..." 
                            style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid #ddd;
                                border-radius: 6px;
                                font-size: 14px;
                                box-sizing: border-box;
                            "
                        />
                    </div>
                    
                    <div id="api-key-error" style="
                        display: none;
                        background: #ffebee;
                        color: #c62828;
                        padding: 10px;
                        border-radius: 4px;
                        margin-bottom: 20px;
                        font-size: 14px;
                    "></div>
                    
                    <div style="
                        display: flex;
                        gap: 12px;
                        justify-content: flex-end;
                    ">
                        <button id="cancel-api-key" style="
                            padding: 10px 20px;
                            border: 2px solid #ddd;
                            background: white;
                            color: #666;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                        ">Cancel</button>
                        <button id="save-api-key" style="
                            padding: 10px 20px;
                            border: none;
                            background: #4CAF50;
                            color: white;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                        ">Save API Key</button>
                    </div>
                    
                    <div style="
                        margin-top: 20px;
                        padding-top: 20px;
                        border-top: 1px solid #eee;
                        font-size: 12px;
                        color: #999;
                        text-align: center;
                    ">
                        Get your API key from: <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #4CAF50;">platform.openai.com/api-keys</a>
                    </div>
                </div>
            `;

            return modal;
        }

        /**
         * Validate that all required configuration is present
         * @returns {boolean} True if configuration is valid
         */
        validateConfiguration() {
            const apiKey = this.getApiKey();
            return apiKey && this.validateApiKeyFormat(apiKey);
        }

        /**
         * Clear stored API key (for testing or reset)
         */
        clearApiKey() {
            GM_setValue(this.API_KEY_STORAGE, null);
        }
    }

    // UI Injection Module
    class UIInjector {
        constructor(pageTypeDetector) {
            this.buttonId = 'ai-generate-btn';
            this.statusId = 'ai-generate-status';
            this.containerId = 'ai-generate-container';
            this.currentState = 'idle'; // idle, loading, success, error
            this.pageTypeDetector = pageTypeDetector;
        }

        /**
         * Inject the AI generate button next to the comments field
         * @param {Function} clickHandler - Function to call when button is clicked
         * @returns {Promise<boolean>} Promise that resolves to true if injection was successful
         */
        async injectGenerateButton(clickHandler) {
            try {
                // Validate click handler
                if (typeof clickHandler !== 'function') {
                    console.error('Invalid click handler provided to injectGenerateButton');
                    return false;
                }

                // Check if button already exists
                if (document.getElementById(this.buttonId)) {
                    console.log('AI Generate button already exists');
                    return true;
                }

                // Detect page type for appropriate positioning logic
                const pageType = this.pageTypeDetector.detectPageType();
                console.log(`[UI Injection] Detected page type: ${pageType}`);

                // Find the comments input field using enhanced detection
                const commentsInput = await this.findCommentsField();
                if (!commentsInput) {
                    console.error('Comments input field not found - ensure you are on a supported Discogs page');
                    return false;
                }

                console.log(`[UI Injection] Found comments field: ${commentsInput.id || commentsInput.name || 'unnamed'}`);

                // Find the appropriate parent container based on page type
                const commentsContainer = this.findCommentsContainer(commentsInput, pageType);
                if (!commentsContainer) {
                    console.error('Could not find suitable container for button injection');
                    return false;
                }

                // Handle multiple items case for manage/edit pages
                if (pageType === 'EDIT' && this.shouldSkipMultipleItems(commentsInput)) {
                    console.log('Skipping button injection for secondary items on manage/edit page');
                    return true;
                }

                // Ensure we have a valid parent to insert into
                if (!commentsContainer.parentNode) {
                    console.error('Comments container has no parent node');
                    return false;
                }

                // Create the AI generate container
                const aiContainer = this.createAIContainer(clickHandler);
                
                // Insert the container using page-appropriate positioning
                this.insertContainerWithPageAwarePositioning(aiContainer, commentsContainer, pageType);

                // Verify the elements were actually added to the DOM
                const verifyButton = document.getElementById(this.buttonId);
                const verifyContainer = document.getElementById(this.containerId);
                
                if (!verifyButton || !verifyContainer) {
                    console.error('UI elements were not properly added to DOM', {
                        hasButton: !!verifyButton,
                        hasContainer: !!verifyContainer,
                        buttonId: this.buttonId,
                        containerId: this.containerId
                    });
                    return false;
                }

                console.log('AI Generate button injected and verified successfully');
                return true;

            } catch (error) {
                console.error('Error during UI injection:', error);
                return false;
            }
        }

        /**
         * Create the AI generate container with button and status elements
         * @param {Function} clickHandler - Function to call when button is clicked
         * @returns {HTMLElement} The container element
         */
        createAIContainer(clickHandler) {
            const container = document.createElement('div');
            container.id = this.containerId;
            
            // Get page type for styling adjustments
            const pageType = this.pageTypeDetector.detectPageType();
            const containerStyles = this.getContainerStyles(pageType);
            
            container.style.cssText = containerStyles;

            const buttonStyles = this.getButtonStyles(pageType);
            const statusStyles = this.getStatusStyles(pageType);
            
            container.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                    <button id="${this.buttonId}" style="${buttonStyles}" 
                            onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(102, 126, 234, 0.4)'" 
                            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(102, 126, 234, 0.3)'">
                        <span style="font-size: 16px;">🤖</span>
                        <span>AI Generate</span>
                    </button>
                    <div id="${this.statusId}" style="${statusStyles}"></div>
                </div>
                <div style="
                    font-size: 12px;
                    color: #6c757d;
                    line-height: 1.4;
                ">
                    Generate an enhanced description using AI based on the release information
                </div>
            `;

            // Verify the elements were created correctly
            const button = container.querySelector(`#${this.buttonId}`);
            const status = container.querySelector(`#${this.statusId}`);
            
            if (!button) {
                console.error('Failed to create button element with ID:', this.buttonId);
                throw new Error('Button element creation failed');
            }
            
            if (!status) {
                console.error('Failed to create status element with ID:', this.statusId);
                throw new Error('Status element creation failed');
            }

            // Add click handler to button
            button.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.currentState === 'loading') {
                    return; // Prevent multiple clicks during loading
                }
                clickHandler();
            });

            // Enhance button accessibility and ensure proper styling
            this.enhanceButtonAccessibility(button, pageType);

            console.debug('AI container created successfully', {
                containerId: this.containerId,
                buttonId: this.buttonId,
                statusId: this.statusId,
                hasButton: !!button,
                hasStatus: !!status,
                pageType: pageType
            });

            return container;
        }

        /**
         * Show loading state with optional message
         * @param {string} message - Loading message to display
         */
        showLoadingState(message = 'Processing...') {
            if (!this.isInjected()) {
                console.warn('Cannot show loading state - UI not injected');
                return;
            }

            this.currentState = 'loading';
            const button = document.getElementById(this.buttonId);
            const status = document.getElementById(this.statusId);
            
            if (button) {
                button.disabled = true;
                button.style.opacity = '0.7';
                button.style.cursor = 'not-allowed';
                button.innerHTML = `
                    <span style="
                        display: inline-block;
                        width: 16px;
                        height: 16px;
                        border: 2px solid #ffffff40;
                        border-top: 2px solid #ffffff;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    "></span>
                    <span>Generating...</span>
                `;
            }

            if (status) {
                status.style.display = 'flex';
                status.style.color = '#007bff';
                status.innerHTML = `
                    <span style="
                        display: inline-block;
                        width: 12px;
                        height: 12px;
                        border: 2px solid #007bff40;
                        border-top: 2px solid #007bff;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    "></span>
                    <span>${this.escapeHtml(message)}</span>
                `;
            }

            // Add CSS animation if not already present
            this.addSpinAnimation();
        }

        /**
         * Show success state with optional message
         * @param {string} message - Success message to display
         */
        showSuccessState(message = 'Description generated successfully!') {
            if (!this.isInjected()) {
                console.warn('Cannot show success state - UI not injected');
                return;
            }

            this.currentState = 'success';
            const status = document.getElementById(this.statusId);
            
            if (status) {
                status.style.display = 'flex';
                status.style.color = '#28a745';
                status.innerHTML = `
                    <span style="font-size: 14px;">✅</span>
                    <span>${this.escapeHtml(message)}</span>
                `;
            }

            // Auto-hide success message after 3 seconds
            setTimeout(() => {
                if (this.currentState === 'success') {
                    this.hideAllStates();
                }
            }, 3000);
        }

        /**
         * Show error state with message
         * @param {string} message - Error message to display
         */
        showErrorState(message) {
            if (!this.isInjected()) {
                console.warn('Cannot show error state - UI not injected');
                return;
            }

            this.currentState = 'error';
            const status = document.getElementById(this.statusId);
            
            if (status) {
                status.style.display = 'flex';
                status.style.color = '#dc3545';
                status.innerHTML = `
                    <span style="font-size: 14px;">❌</span>
                    <span>${this.escapeHtml(message)}</span>
                `;
            }

            // Auto-hide error message after 5 seconds
            setTimeout(() => {
                if (this.currentState === 'error') {
                    this.hideAllStates();
                }
            }, 5000);
        }

        /**
         * Hide all status indicators and restore button to original state
         */
        hideAllStates() {
            this.currentState = 'idle';
            const button = document.getElementById(this.buttonId);
            const status = document.getElementById(this.statusId);
            
            if (button) {
                button.disabled = false;
                button.style.opacity = '1';
                button.style.cursor = 'pointer';
                button.innerHTML = `
                    <span style="font-size: 16px;">🤖</span>
                    <span>AI Generate</span>
                `;
            }

            if (status) {
                status.style.display = 'none';
                status.innerHTML = '';
            }
        }

        /**
         * Add CSS animation for loading spinners
         */
        addSpinAnimation() {
            const styleId = 'ai-generator-animations';
            if (document.getElementById(styleId)) {
                return; // Already added
            }

            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * Update loading message during different phases
         * @param {string} message - New loading message
         */
        updateLoadingMessage(message) {
            if (this.currentState !== 'loading') {
                console.warn('Cannot update loading message - not in loading state');
                return;
            }

            if (!this.isInjected()) {
                console.warn('Cannot update loading message - UI not injected');
                return;
            }

            const status = document.getElementById(this.statusId);
            if (status) {
                const spinner = status.querySelector('span:first-child');
                status.innerHTML = `
                    ${spinner ? spinner.outerHTML : ''}
                    <span>${this.escapeHtml(message)}</span>
                `;
            }
        }

        /**
         * Escape HTML characters to prevent XSS
         * @param {string} text - Text to escape
         * @returns {string} Escaped text
         */
        escapeHtml(text) {
            if (typeof text !== 'string') {
                return String(text);
            }
            
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        /**
         * Check if UI elements are properly injected
         * @returns {boolean} True if UI is properly injected
         */
        isInjected() {
            const button = document.getElementById(this.buttonId);
            const container = document.getElementById(this.containerId);
            const status = document.getElementById(this.statusId);
            
            console.debug('UI injection verification:', {
                buttonId: this.buttonId,
                containerId: this.containerId,
                statusId: this.statusId,
                hasButton: !!button,
                hasContainer: !!container,
                hasStatus: !!status,
                buttonInDOM: button && document.body.contains(button),
                containerInDOM: container && document.body.contains(container)
            });
            
            return button !== null && container !== null;
        }

        /**
         * Find the comments field using page-type-aware detection
         * @returns {Promise<HTMLElement|null>} The comments field element or null if not found
         */
        async findCommentsField() {
            const pageType = this.pageTypeDetector.detectPageType();
            console.log(`[DEBUG] Finding comments field for page type: ${pageType}`);
            console.log(`[DEBUG] Current URL: ${window.location.href}`);

            // Strategy 1: Standard ID lookup (for POST pages)
            let commentsField = document.getElementById('comments');
            if (commentsField && this.validateCommentsField(commentsField)) {
                console.log('[UI Injection] Found comments field via standard ID');
                return commentsField;
            }

            // Strategy 2: Page-type specific selectors
            const pageSelectors = this.pageTypeDetector.getFieldSelectors(pageType);
            for (const selector of pageSelectors) {
                try {
                    const element = document.querySelector(selector);
                    if (element && this.validateCommentsField(element)) {
                        console.log(`[UI Injection] Found comments field via selector: ${selector}`);
                        return element;
                    }
                } catch (error) {
                    console.warn(`[UI Injection] Error with selector ${selector}:`, error.message);
                }
            }

            // Strategy 3: Fallback selectors
            const fallbackSelectors = [
                'textarea[id*="comment"]',
                'input[id*="comment"]',
                'textarea[name*="comment"]',
                'input[name*="comment"]'
            ];

            for (const selector of fallbackSelectors) {
                try {
                    const element = document.querySelector(selector);
                    if (element && this.validateCommentsField(element)) {
                        console.log(`[UI Injection] Found comments field via fallback selector: ${selector}`);
                        return element;
                    }
                } catch (error) {
                    console.warn(`[UI Injection] Error with fallback selector ${selector}:`, error.message);
                }
            }

            console.warn('[UI Injection] No comments field found');
            return null;
        }

        /**
         * Validate that an element is a suitable comments field
         * @param {HTMLElement} element - Element to validate
         * @returns {boolean} True if element is a valid comments field
         */
        validateCommentsField(element) {
            if (!element) return false;

            // Must be a textarea or input
            const tagName = element.tagName.toLowerCase();
            if (tagName !== 'textarea' && tagName !== 'input') {
                return false;
            }

            // Must be visible and enabled
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
            }

            if (element.disabled || element.readOnly) {
                return false;
            }

            return true;
        }

        /**
         * Get container styles based on page type
         * @param {string} pageType - The detected page type
         * @returns {string} CSS styles for the container
         */
        getContainerStyles(pageType) {
            const baseStyles = `
                margin: 12px 0;
                padding: 16px;
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                position: relative;
                z-index: 1000;
            `;

            if (pageType === 'EDIT') {
                // For EDIT pages, use more compact styling that works better in table layouts
                return baseStyles + `
                    margin: 8px 0;
                    padding: 12px;
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 6px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                `;
            }

            // Default styles for POST pages
            return baseStyles + `
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;
        }

        /**
         * Get button styles based on page type
         * @param {string} pageType - The detected page type
         * @returns {string} CSS styles for the button
         */
        getButtonStyles(pageType) {
            const baseStyles = `
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
                display: flex;
                align-items: center;
                gap: 8px;
                outline: none;
                text-decoration: none;
                user-select: none;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
            `;

            if (pageType === 'EDIT') {
                // For EDIT pages, use slightly more compact button styling
                return baseStyles + `
                    padding: 8px 16px;
                    font-size: 13px;
                    min-width: 120px;
                    justify-content: center;
                `;
            }

            // Default styles for POST pages
            return baseStyles + `
                padding: 10px 20px;
                min-width: 140px;
                justify-content: center;
            `;
        }

        /**
         * Get status indicator styles based on page type
         * @param {string} pageType - The detected page type
         * @returns {string} CSS styles for the status indicator
         */
        getStatusStyles(pageType) {
            const baseStyles = `
                font-size: 14px;
                color: #6c757d;
                display: none;
                align-items: center;
                gap: 8px;
                flex: 1;
                min-height: 20px;
            `;

            if (pageType === 'EDIT') {
                // For EDIT pages, use more compact status styling
                return baseStyles + `
                    font-size: 13px;
                    margin-left: 8px;
                `;
            }

            // Default styles for POST pages
            return baseStyles;
        }

        /**
         * Ensure button accessibility and visibility across different page layouts
         * @param {HTMLElement} button - The button element
         * @param {string} pageType - The detected page type
         */
        enhanceButtonAccessibility(button, pageType) {
            if (!button) return;

            // Add ARIA attributes for accessibility
            button.setAttribute('aria-label', 'Generate AI description for this item');
            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');

            // Add keyboard support
            button.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    button.click();
                }
            });

            // Ensure button is visible and properly styled
            const computedStyle = window.getComputedStyle(button);
            
            // Check if button might be hidden or have poor contrast
            if (computedStyle.visibility === 'hidden' || 
                computedStyle.display === 'none' ||
                computedStyle.opacity === '0') {
                
                console.warn('[UI Styling] Button visibility issues detected, applying fixes');
                button.style.visibility = 'visible';
                button.style.display = 'flex';
                button.style.opacity = '1';
            }

            // Ensure proper z-index for different page layouts
            if (pageType === 'EDIT') {
                button.style.zIndex = '1001';
                button.style.position = 'relative';
            }

            console.log(`[UI Styling] Enhanced button accessibility for ${pageType} page`);
        }

        /**
         * Find the appropriate parent container for the comments field based on page type
         * @param {HTMLElement} commentsInput - The comments input field
         * @param {string} pageType - The detected page type ('POST', 'EDIT', or 'UNKNOWN')
         * @returns {HTMLElement|null} The container element or null if not found
         */
        findCommentsContainer(commentsInput, pageType) {
            console.log(`[UI Injection] Finding container for page type: ${pageType}`);
            
            // Strategy 1: Try the standard .field container (works for POST pages)
            let container = commentsInput.closest('.field');
            if (container) {
                console.log('[UI Injection] Found container using .field selector');
                return container;
            }

            // Strategy 2: For EDIT pages, look for form-specific containers
            if (pageType === 'EDIT') {
                // Try to find a table row or form group container
                container = commentsInput.closest('tr') || 
                           commentsInput.closest('.form-group') ||
                           commentsInput.closest('[class*="field"]') ||
                           commentsInput.closest('[class*="row"]');
                
                if (container) {
                    console.log(`[UI Injection] Found EDIT page container: ${container.className || container.tagName}`);
                    return container;
                }
            }

            // Strategy 3: Try parent element directly
            container = commentsInput.parentElement;
            if (container) {
                console.log('[UI Injection] Using direct parent element as container');
                return container;
            }

            // Strategy 4: Look for any reasonable parent container
            let current = commentsInput;
            let depth = 0;
            const maxDepth = 5;

            while (current.parentElement && depth < maxDepth) {
                current = current.parentElement;
                depth++;

                // Look for containers that seem appropriate
                if (current.tagName === 'TD' || 
                    current.tagName === 'TR' ||
                    current.className.includes('field') ||
                    current.className.includes('form') ||
                    current.className.includes('row') ||
                    current.className.includes('group')) {
                    
                    console.log(`[UI Injection] Found container at depth ${depth}: ${current.tagName}.${current.className}`);
                    return current;
                }
            }

            console.warn('[UI Injection] Could not find suitable container, using parent element');
            return commentsInput.parentElement;
        }

        /**
         * Check if we should skip button injection for multiple items on manage/edit pages
         * @param {HTMLElement} commentsInput - The comments input field
         * @returns {boolean} True if we should skip injection for this field
         */
        shouldSkipMultipleItems(commentsInput) {
            // For manage/edit pages, only inject button for the first comments field
            // to avoid cluttering the interface when editing multiple items
            
            const allCommentsFields = document.querySelectorAll('[id$=".comments"], textarea[name*="comments"]');
            
            if (allCommentsFields.length <= 1) {
                return false; // Only one field, don't skip
            }

            // Check if this is the first field in the document order
            const firstField = allCommentsFields[0];
            const isFirstField = firstField === commentsInput;
            
            if (!isFirstField) {
                console.log('[UI Injection] Skipping button injection for secondary comments field');
                return true;
            }

            console.log(`[UI Injection] Proceeding with injection for first field (${allCommentsFields.length} total fields found)`);
            return false;
        }

        /**
         * Insert the AI container using page-appropriate positioning
         * @param {HTMLElement} aiContainer - The AI container to insert
         * @param {HTMLElement} commentsContainer - The comments field container
         * @param {string} pageType - The detected page type
         */
        insertContainerWithPageAwarePositioning(aiContainer, commentsContainer, pageType) {
            console.log(`[UI Injection] Inserting container for page type: ${pageType}`);

            try {
                if (pageType === 'EDIT') {
                    // For EDIT pages, try to insert in a way that works with table layouts
                    this.insertForEditPage(aiContainer, commentsContainer);
                } else {
                    // For POST pages, use the standard insertion method
                    this.insertForPostPage(aiContainer, commentsContainer);
                }
            } catch (error) {
                console.warn('[UI Injection] Page-specific insertion failed, using fallback:', error.message);
                this.insertWithFallback(aiContainer, commentsContainer);
            }
        }

        /**
         * Insert container for POST pages (standard method)
         * @param {HTMLElement} aiContainer - The AI container to insert
         * @param {HTMLElement} commentsContainer - The comments field container
         */
        insertForPostPage(aiContainer, commentsContainer) {
            // Standard insertion after the comments field container
            commentsContainer.parentNode.insertBefore(aiContainer, commentsContainer.nextSibling);
            console.log('[UI Injection] Inserted using POST page method');
        }

        /**
         * Insert container for EDIT pages (table-aware method)
         * @param {HTMLElement} aiContainer - The AI container to insert
         * @param {HTMLElement} commentsContainer - The comments field container
         */
        insertForEditPage(aiContainer, commentsContainer) {
            // For EDIT pages, we need to handle table layouts differently
            if (commentsContainer.tagName === 'TR') {
                // If the container is a table row, create a new row
                const newRow = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = commentsContainer.children.length || 2;
                cell.appendChild(aiContainer);
                newRow.appendChild(cell);
                
                commentsContainer.parentNode.insertBefore(newRow, commentsContainer.nextSibling);
                console.log('[UI Injection] Inserted as new table row for EDIT page');
            } else if (commentsContainer.tagName === 'TD') {
                // If the container is a table cell, try to insert after the row
                const row = commentsContainer.closest('tr');
                if (row) {
                    const newRow = document.createElement('tr');
                    const cell = document.createElement('td');
                    cell.colSpan = row.children.length || 2;
                    cell.appendChild(aiContainer);
                    newRow.appendChild(cell);
                    
                    row.parentNode.insertBefore(newRow, row.nextSibling);
                    console.log('[UI Injection] Inserted as new table row after current row');
                } else {
                    // Fallback to standard insertion
                    this.insertForPostPage(aiContainer, commentsContainer);
                }
            } else {
                // For non-table containers, use standard insertion
                this.insertForPostPage(aiContainer, commentsContainer);
            }
        }

        /**
         * Fallback insertion method when page-specific methods fail
         * @param {HTMLElement} aiContainer - The AI container to insert
         * @param {HTMLElement} commentsContainer - The comments field container
         */
        insertWithFallback(aiContainer, commentsContainer) {
            try {
                // Try to append to the container itself
                commentsContainer.appendChild(aiContainer);
                console.log('[UI Injection] Used fallback method: appended to container');
            } catch (error) {
                // Last resort: insert after the container
                if (commentsContainer.parentNode) {
                    commentsContainer.parentNode.insertBefore(aiContainer, commentsContainer.nextSibling);
                    console.log('[UI Injection] Used last resort method: inserted after container');
                } else {
                    throw new Error('No viable insertion point found');
                }
            }
        }

        /**
         * Remove all injected UI elements
         */
        remove() {
            const container = document.getElementById(this.containerId);
            if (container) {
                container.remove();
            }

            const style = document.getElementById('ai-generator-animations');
            if (style) {
                style.remove();
            }
        }
    }

    // Error Handler Module
    class ErrorHandler {
        constructor() {
            this.errorCategories = {
                CONFIGURATION: 'configuration',
                NETWORK: 'network',
                SCRAPING: 'scraping',
                API: 'api',
                FORM: 'form',
                VALIDATION: 'validation'
            };

            this.errorMessages = {
                // Configuration errors
                MISSING_API_KEY: "Please configure your OpenAI API key to use AI generation",
                INVALID_API_KEY: "Invalid API key format. OpenAI keys start with 'sk-' and are at least 20 characters long",
                API_KEY_AUTH_FAILED: "API key authentication failed. Please check your OpenAI API key",
                
                // Network errors  
                NETWORK_ERROR: "Network connection failed. Please check your internet connection",
                TIMEOUT_ERROR: "Request timed out. Please try again",
                CONNECTION_REFUSED: "Unable to connect to OpenAI servers. Please try again later",
                
                // Scraping errors
                SCRAPING_ERROR: "Unable to extract release information from the page",
                RELEASE_NOT_FOUND: "Release page could not be accessed or found",
                INSUFFICIENT_DATA: "Not enough release information found to generate description",
                PAGE_STRUCTURE_CHANGED: "Page structure may have changed. Please try refreshing the page",
                
                // API errors
                RATE_LIMIT: "OpenAI API rate limit exceeded. Please wait a moment and try again",
                QUOTA_EXCEEDED: "OpenAI API quota exceeded. Please check your account billing",
                API_SERVER_ERROR: "OpenAI server error. Please try again in a few moments",
                INVALID_REQUEST: "Invalid request sent to OpenAI API",
                
                // Form errors
                FORM_ERROR: "Unable to populate the description field",
                FIELD_NOT_FOUND: "Comments field not found on the page",
                FIELD_READ_ONLY: "Comments field is read-only and cannot be modified",
                
                // Validation errors
                VALIDATION_FAILED: "Generated content failed validation checks",
                CONTENT_TOO_LONG: "Generated description exceeds maximum length limit"
            };

            this.retryableErrors = [
                'NETWORK_ERROR',
                'TIMEOUT_ERROR',
                'CONNECTION_REFUSED',
                'API_SERVER_ERROR',
                'RATE_LIMIT'
            ];

            this.maxRetries = 3;
            this.retryDelays = [1000, 2000, 4000]; // Progressive delays in ms
        }

        /**
         * Categorize error based on error message and context
         * @param {Error} error - Original error
         * @param {string} context - Context where error occurred
         * @returns {Object} Categorized error information
         */
        categorizeError(error, context = 'unknown') {
            const message = error.message || error.toString();
            const lowerMessage = message.toLowerCase();

            let category = 'unknown';
            let errorCode = 'UNKNOWN_ERROR';
            let userMessage = message;
            let isRetryable = false;
            let suggestedAction = 'Please try again or contact support if the problem persists';

            // Configuration errors
            if (lowerMessage.includes('api key') && (lowerMessage.includes('missing') || lowerMessage.includes('required'))) {
                category = this.errorCategories.CONFIGURATION;
                errorCode = 'MISSING_API_KEY';
                userMessage = this.errorMessages.MISSING_API_KEY;
                suggestedAction = 'Click the button again to configure your API key';
            } else if (lowerMessage.includes('invalid') && lowerMessage.includes('api key')) {
                category = this.errorCategories.CONFIGURATION;
                errorCode = 'INVALID_API_KEY';
                userMessage = this.errorMessages.INVALID_API_KEY;
                suggestedAction = 'Please enter a valid OpenAI API key';
            } else if (lowerMessage.includes('401') || lowerMessage.includes('authentication')) {
                category = this.errorCategories.CONFIGURATION;
                errorCode = 'API_KEY_AUTH_FAILED';
                userMessage = this.errorMessages.API_KEY_AUTH_FAILED;
                suggestedAction = 'Please verify your API key is correct and active';
            }
            
            // Network errors
            else if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
                category = this.errorCategories.NETWORK;
                errorCode = 'NETWORK_ERROR';
                userMessage = this.errorMessages.NETWORK_ERROR;
                isRetryable = true;
                suggestedAction = 'Check your internet connection and try again';
            } else if (lowerMessage.includes('timeout')) {
                category = this.errorCategories.NETWORK;
                errorCode = 'TIMEOUT_ERROR';
                userMessage = this.errorMessages.TIMEOUT_ERROR;
                isRetryable = true;
                suggestedAction = 'The request took too long. Please try again';
            } else if (lowerMessage.includes('refused') || lowerMessage.includes('unreachable')) {
                category = this.errorCategories.NETWORK;
                errorCode = 'CONNECTION_REFUSED';
                userMessage = this.errorMessages.CONNECTION_REFUSED;
                isRetryable = true;
                suggestedAction = 'OpenAI servers may be temporarily unavailable';
            }
            
            // API errors
            else if (lowerMessage.includes('rate limit') || lowerMessage.includes('429')) {
                category = this.errorCategories.API;
                errorCode = 'RATE_LIMIT';
                userMessage = this.errorMessages.RATE_LIMIT;
                isRetryable = true;
                suggestedAction = 'Wait a moment before trying again';
            } else if (lowerMessage.includes('quota') || lowerMessage.includes('billing') || lowerMessage.includes('insufficient')) {
                category = this.errorCategories.API;
                errorCode = 'QUOTA_EXCEEDED';
                userMessage = this.errorMessages.QUOTA_EXCEEDED;
                suggestedAction = 'Check your OpenAI account billing and usage limits';
            } else if (lowerMessage.includes('500') || lowerMessage.includes('502') || lowerMessage.includes('503')) {
                category = this.errorCategories.API;
                errorCode = 'API_SERVER_ERROR';
                userMessage = this.errorMessages.API_SERVER_ERROR;
                isRetryable = true;
                suggestedAction = 'OpenAI servers are experiencing issues. Try again shortly';
            } else if (lowerMessage.includes('400') || lowerMessage.includes('invalid request')) {
                category = this.errorCategories.API;
                errorCode = 'INVALID_REQUEST';
                userMessage = this.errorMessages.INVALID_REQUEST;
                suggestedAction = 'There was an issue with the request format';
            }
            
            // Scraping errors
            else if (context === 'scraping' || lowerMessage.includes('scrape') || lowerMessage.includes('extract')) {
                category = this.errorCategories.SCRAPING;
                if (lowerMessage.includes('release') && lowerMessage.includes('not found')) {
                    errorCode = 'RELEASE_NOT_FOUND';
                    userMessage = this.errorMessages.RELEASE_NOT_FOUND;
                    suggestedAction = 'Ensure you are on a valid Discogs listing page';
                } else if (lowerMessage.includes('insufficient') || lowerMessage.includes('not enough')) {
                    errorCode = 'INSUFFICIENT_DATA';
                    userMessage = this.errorMessages.INSUFFICIENT_DATA;
                    suggestedAction = 'The release page may be missing required information';
                } else {
                    errorCode = 'SCRAPING_ERROR';
                    userMessage = this.errorMessages.SCRAPING_ERROR;
                    suggestedAction = 'Try refreshing the page and ensure you are on a Discogs listing page';
                }
            }
            
            // Form errors
            else if (context === 'form' || lowerMessage.includes('field') || lowerMessage.includes('populate')) {
                category = this.errorCategories.FORM;
                if (lowerMessage.includes('not found')) {
                    errorCode = 'FIELD_NOT_FOUND';
                    userMessage = this.errorMessages.FIELD_NOT_FOUND;
                    suggestedAction = 'Ensure you are on a Discogs listing page with a comments field';
                } else {
                    errorCode = 'FORM_ERROR';
                    userMessage = this.errorMessages.FORM_ERROR;
                    suggestedAction = 'Try refreshing the page and try again';
                }
            }

            return {
                category,
                errorCode,
                userMessage,
                originalMessage: message,
                isRetryable,
                suggestedAction,
                context,
                timestamp: new Date().toISOString()
            };
        }

        /**
         * Execute operation with retry logic for retryable errors
         * @param {Function} operation - Async operation to execute
         * @param {string} context - Context for error categorization
         * @param {Object} options - Retry options
         * @returns {Promise} Operation result
         */
        async executeWithRetry(operation, context = 'unknown', options = {}) {
            const maxRetries = options.maxRetries || this.maxRetries;
            const retryDelays = options.retryDelays || this.retryDelays;
            const onRetry = options.onRetry || (() => {});

            let lastError = null;
            let attempt = 0;

            while (attempt <= maxRetries) {
                try {
                    this.logDebug(`Executing operation (attempt ${attempt + 1}/${maxRetries + 1})`, { context });
                    const result = await operation();
                    
                    if (attempt > 0) {
                        this.logInfo(`Operation succeeded after ${attempt} retries`, { context });
                    }
                    
                    return result;
                } catch (error) {
                    lastError = error;
                    const categorizedError = this.categorizeError(error, context);
                    
                    this.logError(`Operation failed on attempt ${attempt + 1}`, {
                        context,
                        error: categorizedError,
                        attempt: attempt + 1,
                        maxRetries: maxRetries + 1
                    });

                    // Don't retry if error is not retryable or we've exhausted retries
                    if (!categorizedError.isRetryable || attempt >= maxRetries) {
                        break;
                    }

                    // Wait before retrying
                    const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
                    this.logDebug(`Waiting ${delay}ms before retry`, { context, attempt: attempt + 1 });
                    
                    await this.delay(delay);
                    
                    // Notify about retry attempt
                    onRetry(attempt + 1, categorizedError);
                    
                    attempt++;
                }
            }

            // All retries exhausted, throw the last error
            throw lastError;
        }

        /**
         * Log error with detailed information
         * @param {string} message - Log message
         * @param {Object} details - Additional details
         */
        logError(message, details = {}) {
            const logEntry = {
                level: 'ERROR',
                message,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href,
                ...details
            };
            
            console.error('[Discogs AI Generator - ERROR]', message, logEntry);
            
            // Store error log for debugging (keep last 50 entries)
            this.storeErrorLog(logEntry);
        }

        /**
         * Log warning with details
         * @param {string} message - Log message
         * @param {Object} details - Additional details
         */
        logWarning(message, details = {}) {
            const logEntry = {
                level: 'WARNING',
                message,
                timestamp: new Date().toISOString(),
                ...details
            };
            
            console.warn('[Discogs AI Generator - WARNING]', message, logEntry);
        }

        /**
         * Log info message
         * @param {string} message - Log message
         * @param {Object} details - Additional details
         */
        logInfo(message, details = {}) {
            const logEntry = {
                level: 'INFO',
                message,
                timestamp: new Date().toISOString(),
                ...details
            };
            
            console.log('[Discogs AI Generator - INFO]', message, logEntry);
        }

        /**
         * Log debug message (only in debug mode)
         * @param {string} message - Log message
         * @param {Object} details - Additional details
         */
        logDebug(message, details = {}) {
            // Only log debug messages if debug mode is enabled
            if (this.isDebugMode()) {
                const logEntry = {
                    level: 'DEBUG',
                    message,
                    timestamp: new Date().toISOString(),
                    ...details
                };
                
                console.debug('[Discogs AI Generator - DEBUG]', message, logEntry);
            }
        }

        /**
         * Check if debug mode is enabled
         * @returns {boolean} True if debug mode is enabled
         */
        isDebugMode() {
            return localStorage.getItem('discogs_ai_debug') === 'true' || 
                   window.location.search.includes('debug=true');
        }

        /**
         * Store error log entry for debugging
         * @param {Object} logEntry - Log entry to store
         */
        storeErrorLog(logEntry) {
            try {
                const storageKey = 'discogs_ai_error_logs';
                const existingLogs = JSON.parse(localStorage.getItem(storageKey) || '[]');
                
                // Add new log entry
                existingLogs.push(logEntry);
                
                // Keep only last 50 entries
                if (existingLogs.length > 50) {
                    existingLogs.splice(0, existingLogs.length - 50);
                }
                
                localStorage.setItem(storageKey, JSON.stringify(existingLogs));
            } catch (error) {
                console.warn('Failed to store error log:', error);
            }
        }

        /**
         * Get stored error logs for debugging
         * @returns {Array} Array of error log entries
         */
        getErrorLogs() {
            try {
                const storageKey = 'discogs_ai_error_logs';
                return JSON.parse(localStorage.getItem(storageKey) || '[]');
            } catch (error) {
                console.warn('Failed to retrieve error logs:', error);
                return [];
            }
        }

        /**
         * Clear stored error logs
         */
        clearErrorLogs() {
            try {
                localStorage.removeItem('discogs_ai_error_logs');
                console.log('Error logs cleared');
            } catch (error) {
                console.warn('Failed to clear error logs:', error);
            }
        }

        /**
         * Create delay promise
         * @param {number} ms - Milliseconds to delay
         * @returns {Promise} Delay promise
         */
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        /**
         * Handle fallback behavior for critical failures
         * @param {Object} categorizedError - Categorized error information
         * @param {Object} fallbackOptions - Fallback options
         * @returns {Object} Fallback result
         */
        handleFallback(categorizedError, fallbackOptions = {}) {
            this.logWarning('Executing fallback behavior', { 
                error: categorizedError,
                fallbackOptions 
            });

            const fallbackResult = {
                success: false,
                error: categorizedError,
                fallbackExecuted: true,
                fallbackType: 'none'
            };

            // Scraping fallback - try alternative scraping methods
            if (categorizedError.category === this.errorCategories.SCRAPING) {
                if (fallbackOptions.enableBasicScraping) {
                    fallbackResult.fallbackType = 'basic_scraping';
                    fallbackResult.message = 'Attempting basic information extraction...';
                    // This would be implemented in the DataScraper class
                }
            }

            // API fallback - suggest manual description
            else if (categorizedError.category === this.errorCategories.API) {
                fallbackResult.fallbackType = 'manual_suggestion';
                fallbackResult.message = 'AI generation unavailable. Consider writing a manual description.';
            }

            // Form fallback - copy to clipboard
            else if (categorizedError.category === this.errorCategories.FORM) {
                if (fallbackOptions.generatedText && navigator.clipboard) {
                    try {
                        navigator.clipboard.writeText(fallbackOptions.generatedText);
                        fallbackResult.fallbackType = 'clipboard_copy';
                        fallbackResult.message = 'Description copied to clipboard. Please paste manually.';
                        fallbackResult.success = true;
                    } catch (clipboardError) {
                        this.logWarning('Clipboard fallback failed', { error: clipboardError });
                    }
                }
            }

            return fallbackResult;
        }
    }

    // OpenAI API Client Module
    class OpenAIClient {
        constructor(apiKey, errorHandler = null) {
            if (!apiKey) {
                throw new Error('API key is required');
            }
            this.apiKey = apiKey;
            this.baseUrl = 'https://api.openai.com/v1';
            this.model = 'gpt-4o-mini';
            this.maxTokens = 200;
            this.temperature = 0.7;
            this.errorHandler = errorHandler || new ErrorHandler();
            
            // VinylScribe prompt from the public comment checker
            this.vinylScribePrompt = `You are VinylScribe, a specialist assistant for creating vinyl record listing descriptions. When the user provides copied text showing both the Discogs release page and their listing details, your job is to:

  1. Carefully examine the provided text to gather information about:
     - The specific pressing details from the Discogs release page
     - The condition notes and any comments from the seller's listing page

  2. CRITICAL: Use ONLY the information provided in the Discogs page text. DO NOT search for additional information or make assumptions about details not explicitly stated on the page.

  3. Focus on the physical characteristics of the record as shown on the Discogs page:
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

  5. Return ONLY the description text with absolutely no other commentary, explanations, or formatting. Do not use markdown formatting (no ** or other markdown). Do not put it in a code block. Just return the plain text description and nothing else.

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

  The Beatles - Revolver (UK Parlophone 1966)
  BRITISH INVASION CORNERSTONE! NM/VG+ 1966 UK Parlophone first pressing (PMC 7009) with crucial KT tax code and "Doctor Robert" spelling error on label. XEX 606-1/XEX 607-1 matrices with Dick James Music credits. Complete with original black inner sleeve. Essential early pressing featuring loud Peter Blake-influenced mono mix before Capitol's altered US version.

  13th Floor Elevators – The Psychedelic Sounds of the 13th Floor Elevators (International Artists 1966)
  TEXAS PSYCH HOLY GRAIL! VG/VG- 1966 International Artists mono pressing (IA LP-1) with crucial first issue blue/white labels. Etched "JAH" in runout denoting Jim Holloway mastering. Houston-pressed copy from first 1,500 run before widespread distribution. Original mix with stronger electric jug presence than subsequent repressings.

  ---

  `;
        }

        /**
         * Generate description using OpenAI API with comprehensive error handling
         * @param {Object} releaseData - Formatted release data
         * @returns {Promise<string>} Generated description
         */
        async generateDescription(releaseData) {
            return await this.errorHandler.executeWithRetry(
                async () => {
                    this.errorHandler.logDebug('Starting description generation', { 
                        hasReleaseData: !!releaseData,
                        model: this.model 
                    });
                    
                    if (!releaseData) {
                        throw new Error('Release data is required');
                    }

                    // Validate release data has minimum required information
                    if (!this.validateReleaseData(releaseData)) {
                        throw new Error('Release data validation failed - insufficient information');
                    }

                    // Format the release data for the API
                    const formattedData = this.formatDataForAPI(releaseData);
                    
                    // Log the formatted data for debugging
                    this.errorHandler.logDebug('Formatted data being sent to API', {
                        dataLength: formattedData.length,
                        dataPreview: formattedData.substring(0, 200) + (formattedData.length > 200 ? '...' : ''),
                        fullData: formattedData // This will help debug what's actually being sent
                    });
                    
                    // Ensure we have meaningful data to send
                    if (!formattedData || formattedData.trim().length < 50) {
                        throw new Error('Insufficient formatted data for API request');
                    }
                    
                    // Prepare the API request
                    const requestBody = {
                        model: this.model,
                        messages: [
                            {
                                role: 'system',
                                content: this.vinylScribePrompt
                            },
                            {
                                role: 'user',
                                content: formattedData
                            }
                        ],
                        max_tokens: this.maxTokens,
                        temperature: this.temperature
                    };

                    this.errorHandler.logDebug('Sending request to OpenAI API', {
                        model: this.model,
                        maxTokens: this.maxTokens,
                        dataLength: formattedData.length
                    });
                    
                    // CRITICAL DEBUG: Log exactly what we're sending to OpenAI
                    console.log('🚨 CRITICAL DEBUG - Data being sent to OpenAI:');
                    console.log('Formatted data length:', formattedData.length);
                    console.log('Formatted data content:');
                    console.log(formattedData);
                    console.log('Full request body:');
                    console.log(JSON.stringify(requestBody, null, 2));
                    console.log('🚨 END CRITICAL DEBUG');

                    // Make the API request using GM_xmlhttpRequest
                    const response = await this.makeApiRequest(requestBody);
                    
                    // CRITICAL DEBUG: Log the raw API response
                    console.log('🚨 CRITICAL DEBUG - Raw API Response:');
                    console.log('Response object:', response);
                    console.log('Response choices:', response.choices);
                    if (response.choices && response.choices[0]) {
                        console.log('Response content:', response.choices[0].message.content);
                    }
                    console.log('🚨 END CRITICAL DEBUG');
                    
                    // Parse and clean the response
                    const description = this.parseApiResponse(response);
                    
                    this.errorHandler.logInfo('Description generated successfully', {
                        descriptionLength: description.length,
                        model: this.model
                    });
                    
                    return description;
                },
                'api',
                {
                    maxRetries: 3,
                    retryDelays: [2000, 5000, 10000], // Longer delays for API calls
                    onRetry: (attempt, error) => {
                        this.errorHandler.logInfo(`Retrying API call (attempt ${attempt})`, {
                            errorCode: error.errorCode,
                            isRateLimit: error.errorCode === 'RATE_LIMIT'
                        });
                    }
                }
            );
        }

        /**
         * Validate that release data contains minimum required information
         * @param {Object} releaseData - Release data to validate
         * @returns {boolean} True if data is valid
         */
        validateReleaseData(releaseData) {
            try {
                // Check basic structure
                if (!releaseData || typeof releaseData !== 'object') {
                    this.errorHandler.logWarning('Release data is not an object', { releaseData });
                    return false;
                }

                // Check for current page data
                if (!releaseData.currentPage) {
                    this.errorHandler.logWarning('Missing current page data', { releaseData });
                    return false;
                }

                // Check for release page data
                if (!releaseData.releasePage) {
                    this.errorHandler.logWarning('Missing release page data', { releaseData });
                    return false;
                }

                // Check for minimum content
                const hasTitle = releaseData.releasePage.title && releaseData.releasePage.title !== 'Unknown Title';
                const hasCondition = releaseData.currentPage.condition && 
                                   (releaseData.currentPage.condition.media || releaseData.currentPage.condition.sleeve);
                const hasContent = releaseData.releasePage.fullText && releaseData.releasePage.fullText.length > 50;

                if (!hasTitle || !hasCondition || !hasContent) {
                    this.errorHandler.logWarning('Insufficient release data for generation', {
                        hasTitle,
                        hasCondition,
                        hasContent,
                        titleLength: releaseData.releasePage.title?.length || 0,
                        contentLength: releaseData.releasePage.fullText?.length || 0
                    });
                    return false;
                }

                return true;
            } catch (error) {
                this.errorHandler.logError('Error validating release data', { error: error.message });
                return false;
            }
        }

        /**
         * Make API request using GM_xmlhttpRequest with enhanced error handling
         * @param {Object} requestBody - Request payload
         * @returns {Promise<Object>} API response
         */
        async makeApiRequest(requestBody) {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${this.baseUrl}/chat/completions`,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`,
                        'User-Agent': 'Discogs-AI-Generator/1.0'
                    },
                    data: JSON.stringify(requestBody),
                    timeout: 45000, // 45 second timeout for better reliability
                    onload: (response) => {
                        const duration = Date.now() - startTime;
                        
                        try {
                            this.errorHandler.logDebug('API request completed', {
                                status: response.status,
                                duration,
                                responseLength: response.responseText?.length || 0
                            });

                            if (response.status === 200) {
                                const data = JSON.parse(response.responseText);
                                
                                // Validate response structure
                                if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                                    reject(new Error('Invalid API response structure - missing required fields'));
                                    return;
                                }
                                
                                resolve(data);
                            } else {
                                // Handle different HTTP error codes
                                let errorMessage = `HTTP ${response.status}`;
                                let errorDetails = {};
                                
                                try {
                                    const errorData = JSON.parse(response.responseText);
                                    errorMessage = errorData.error?.message || errorMessage;
                                    errorDetails = errorData.error || {};
                                } catch (parseError) {
                                    this.errorHandler.logWarning('Failed to parse error response', {
                                        status: response.status,
                                        responseText: response.responseText?.substring(0, 200)
                                    });
                                }

                                // Log detailed error information
                                this.errorHandler.logError('API request failed', {
                                    status: response.status,
                                    errorMessage,
                                    errorDetails,
                                    duration,
                                    requestSize: JSON.stringify(requestBody).length
                                });

                                // Create specific error based on status code
                                if (response.status === 401) {
                                    reject(new Error('API authentication failed - invalid API key'));
                                } else if (response.status === 429) {
                                    reject(new Error('API rate limit exceeded - too many requests'));
                                } else if (response.status === 402) {
                                    reject(new Error('API quota exceeded - billing issue'));
                                } else if (response.status >= 500) {
                                    reject(new Error(`OpenAI server error (${response.status}) - service temporarily unavailable`));
                                } else {
                                    reject(new Error(`API Error ${response.status}: ${errorMessage}`));
                                }
                            }
                        } catch (parseError) {
                            this.errorHandler.logError('Failed to parse API response', {
                                parseError: parseError.message,
                                status: response.status,
                                duration,
                                responsePreview: response.responseText?.substring(0, 200)
                            });
                            reject(new Error(`Failed to parse API response: ${parseError.message}`));
                        }
                    },
                    onerror: (error) => {
                        const duration = Date.now() - startTime;
                        this.errorHandler.logError('API request network error', {
                            error: error.toString(),
                            duration,
                            url: `${this.baseUrl}/chat/completions`
                        });
                        reject(new Error('Network error - unable to connect to OpenAI API'));
                    },
                    ontimeout: () => {
                        const duration = Date.now() - startTime;
                        this.errorHandler.logError('API request timeout', {
                            duration,
                            timeout: 45000,
                            url: `${this.baseUrl}/chat/completions`
                        });
                        reject(new Error('Request timeout - OpenAI API did not respond within 45 seconds'));
                    }
                });
            });
        }

        /**
         * Format release data for API consumption
         * @param {Object} releaseData - Raw release data
         * @returns {string} Formatted data string
         */
        formatDataForAPI(releaseData) {
            let formattedData = '';

            // Add release page information
            if (releaseData.releasePage) {
                // Check if releasePage is a string (raw text) or object (structured data)
                if (typeof releaseData.releasePage === 'string') {
                    formattedData += releaseData.releasePage;
                } else if (typeof releaseData.releasePage === 'object') {
                    // Format structured data into readable text
                    const rp = releaseData.releasePage;
                    
                    if (rp.title) {
                        formattedData += `${rp.title}\n\n`;
                    }
                    
                    if (rp.label) {
                        formattedData += `Label: ${rp.label}\n`;
                    }
                    
                    if (rp.catalogNumber) {
                        formattedData += `Cat#: ${rp.catalogNumber}\n`;
                    }
                    
                    if (rp.format) {
                        formattedData += `Format: ${rp.format}\n`;
                    }
                    
                    if (rp.country) {
                        formattedData += `Country: ${rp.country}\n`;
                    }
                    
                    if (rp.year) {
                        formattedData += `Released: ${rp.year}\n`;
                    }
                    
                    if (rp.genre) {
                        formattedData += `Genre: ${rp.genre}\n`;
                    }
                    
                    if (rp.style) {
                        formattedData += `Style: ${rp.style}\n`;
                    }
                    
                    if (rp.matrixRunout) {
                        formattedData += `Matrix / Runout: ${rp.matrixRunout}\n`;
                    }
                    
                    if (rp.notes) {
                        formattedData += `Notes: ${rp.notes}\n`;
                    }
                    
                    // Add the full text if available (this contains all the scraped content)
                    if (rp.fullText && rp.fullText.length > formattedData.length) {
                        formattedData += `\n--- Full Release Information ---\n${rp.fullText}`;
                    }
                }
            }

            // Add current page information
            if (releaseData.currentPage) {
                formattedData += '\n\nOUR COPY:\n';
                
                if (releaseData.currentPage.condition.media || releaseData.currentPage.condition.sleeve) {
                    const conditionParts = [];
                    if (releaseData.currentPage.condition.media) {
                        conditionParts.push(`Media: ${releaseData.currentPage.condition.media}`);
                    }
                    if (releaseData.currentPage.condition.sleeve) {
                        conditionParts.push(`Sleeve: ${releaseData.currentPage.condition.sleeve}`);
                    }
                    formattedData += `Condition: ${conditionParts.join(' / ')}\n`;
                }
                
                if (releaseData.currentPage.price) {
                    formattedData += `Price: ${releaseData.currentPage.price}\n`;
                }
                
                if (releaseData.currentPage.originalDescription) {
                    formattedData += `Original Description: ${releaseData.currentPage.originalDescription}\n`;
                }
            }

            this.errorHandler.logDebug('Formatted data for API', {
                dataLength: formattedData.length,
                hasReleaseInfo: !!releaseData.releasePage,
                hasCurrentPageInfo: !!releaseData.currentPage
            });

            return formattedData;
        }

        /**
         * Parse API response and extract clean description text
         * @param {Object} response - API response object
         * @returns {string} Clean description text
         */
        parseApiResponse(response) {
            try {
                if (!response.choices || !response.choices[0] || !response.choices[0].message) {
                    throw new Error('Invalid API response structure');
                }

                let description = response.choices[0].message.content;
                
                if (!description || typeof description !== 'string') {
                    throw new Error('No description content in API response');
                }

                // Clean the description text
                description = this.cleanDescriptionText(description);
                
                // Ensure it's within character limit
                if (description.length > 500) {
                    console.warn('Description exceeds 500 characters, truncating...');
                    description = this.truncateDescription(description, 500);
                }

                return description;

            } catch (error) {
                throw new Error(`Failed to parse API response: ${error.message}`);
            }
        }

        /**
         * Clean description text by removing markdown and unwanted formatting
         * @param {string} text - Raw description text
         * @returns {string} Cleaned text
         */
        cleanDescriptionText(text) {
            if (!text || typeof text !== 'string') {
                return '';
            }

            // Remove markdown code blocks
            text = text.replace(/```[\s\S]*?```/g, '');
            text = text.replace(/`([^`]+)`/g, '$1');
            
            // Remove markdown formatting
            text = text.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold
            text = text.replace(/\*(.*?)\*/g, '$1'); // Italic
            text = text.replace(/__(.*?)__/g, '$1'); // Bold
            text = text.replace(/_(.*?)_/g, '$1'); // Italic
            
            // Remove extra whitespace and normalize line breaks
            text = text.replace(/\n\s*\n/g, '\n'); // Multiple line breaks
            text = text.replace(/^\s+|\s+$/g, ''); // Leading/trailing whitespace
            text = text.replace(/\s+/g, ' '); // Multiple spaces
            
            return text;
        }

        /**
         * Truncate description while maintaining readability
         * @param {string} text - Text to truncate
         * @param {number} maxLength - Maximum length
         * @returns {string} Truncated text
         */
        truncateDescription(text, maxLength) {
            if (!text || text.length <= maxLength) {
                return text;
            }

            // Try to truncate at sentence boundary
            const sentences = text.split(/[.!?]+/);
            let truncated = '';
            
            for (let sentence of sentences) {
                const testLength = truncated.length + sentence.length + 1;
                if (testLength <= maxLength - 3) { // Leave room for "..."
                    truncated += (truncated ? '. ' : '') + sentence.trim();
                } else {
                    break;
                }
            }
            
            // If we couldn't fit any complete sentences, truncate at word boundary
            if (!truncated) {
                const words = text.split(' ');
                for (let word of words) {
                    const testLength = truncated.length + word.length + 1;
                    if (testLength <= maxLength - 3) {
                        truncated += (truncated ? ' ' : '') + word;
                    } else {
                        break;
                    }
                }
            }
            
            return truncated + '...';
        }

        /**
         * Validate API key by making a test request
         * @returns {Promise<boolean>} True if API key is valid
         */
        async validateApiKey() {
            try {
                console.log('Validating API key...');
                
                const testRequest = {
                    model: this.model,
                    messages: [
                        {
                            role: 'user',
                            content: 'Test message'
                        }
                    ],
                    max_tokens: 1
                };

                await this.makeApiRequest(testRequest);
                console.log('API key validation successful');
                return true;

            } catch (error) {
                console.error('API key validation failed:', error);
                return false;
            }
        }

        /**
         * Handle API errors and provide user-friendly messages
         * @param {Error} error - Original error
         * @returns {Error} User-friendly error
         */
        handleApiErrors(error) {
            const message = error.message || 'Unknown error';
            
            // Rate limiting
            if (message.includes('rate limit') || message.includes('429')) {
                return new Error('API rate limit exceeded. Please wait a moment and try again.');
            }
            
            // Authentication errors
            if (message.includes('401') || message.includes('authentication') || message.includes('api key')) {
                return new Error('Invalid API key. Please check your OpenAI API key configuration.');
            }
            
            // Quota/billing errors
            if (message.includes('quota') || message.includes('billing') || message.includes('insufficient')) {
                return new Error('API quota exceeded or billing issue. Please check your OpenAI account.');
            }
            
            // Network errors
            if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
                return new Error('Network error. Please check your internet connection and try again.');
            }
            
            // Server errors
            if (message.includes('500') || message.includes('502') || message.includes('503')) {
                return new Error('OpenAI server error. Please try again in a few moments.');
            }
            
            // Generic API errors
            if (message.includes('API Error')) {
                return new Error(`OpenAI API error: ${message}`);
            }
            
            // Return original error if no specific handling
            return error;
        }
    }

    // Data Scraper Module
    class DataScraper {
        constructor(errorHandler = null) {
            this.errorHandler = errorHandler || new ErrorHandler();
            this.cacheManager = new CacheManager();
            this.delimiters = [
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
                "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9",
                "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9",
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
                "Tracklist"
            ];
        }

        /**
         * Scrape current page information with comprehensive error handling and fallbacks
         * @returns {Object} Current page data
         */
        async scrapeCurrentPageInfo() {
            return await this.errorHandler.executeWithRetry(
                async () => {
                    this.errorHandler.logDebug('Starting current page scraping', {
                        url: window.location.href,
                        userAgent: navigator.userAgent
                    });
                    
                    const currentPageData = {
                        condition: {
                            media: '',
                            sleeve: ''
                        },
                        price: '',
                        originalDescription: '',
                        releaseUrl: ''
                    };

                    // Scrape with fallback strategies
                    await this.scrapeConditionInfo(currentPageData);
                    await this.scrapePriceInfo(currentPageData);
                    await this.scrapeDescriptionInfo(currentPageData);
                    await this.scrapeReleaseUrl(currentPageData);

                    // Validate that we have minimum required data
                    this.validateCurrentPageData(currentPageData);

                    this.errorHandler.logInfo('Current page data scraped successfully', {
                        hasMediaCondition: !!currentPageData.condition.media,
                        hasSleeveCondition: !!currentPageData.condition.sleeve,
                        hasPrice: !!currentPageData.price,
                        hasReleaseUrl: !!currentPageData.releaseUrl,
                        descriptionLength: currentPageData.originalDescription.length
                    });

                    return currentPageData;
                },
                'scraping',
                {
                    maxRetries: 2,
                    retryDelays: [500, 1000]
                }
            );
        }

        /**
         * Scrape condition information with fallback strategies
         * @param {Object} currentPageData - Data object to populate
         */
        async scrapeConditionInfo(currentPageData) {
            try {
                // Primary method: look for standard condition selects
                const mediaConditionSelect = document.querySelector('select[name="condition"]');
                if (mediaConditionSelect && mediaConditionSelect.selectedIndex >= 0) {
                    const selectedOption = mediaConditionSelect.options[mediaConditionSelect.selectedIndex];
                    currentPageData.condition.media = selectedOption ? selectedOption.text.trim() : '';
                }

                const sleeveConditionSelect = document.querySelector('select[name="sleeve_condition"]');
                if (sleeveConditionSelect && sleeveConditionSelect.selectedIndex >= 0) {
                    const selectedOption = sleeveConditionSelect.options[sleeveConditionSelect.selectedIndex];
                    currentPageData.condition.sleeve = selectedOption ? selectedOption.text.trim() : '';
                }

                // Fallback: look for alternative selectors
                if (!currentPageData.condition.media) {
                    const altSelectors = [
                        'select[id*="condition"]',
                        'select[class*="condition"]',
                        'select option:checked[value*="mint"], select option:checked[value*="good"], select option:checked[value*="fair"]'
                    ];

                    for (const selector of altSelectors) {
                        const element = document.querySelector(selector);
                        if (element && element.textContent) {
                            currentPageData.condition.media = element.textContent.trim();
                            this.errorHandler.logDebug('Found condition using fallback selector', { selector });
                            break;
                        }
                    }
                }

                this.errorHandler.logDebug('Condition scraping completed', {
                    media: currentPageData.condition.media,
                    sleeve: currentPageData.condition.sleeve
                });

            } catch (error) {
                this.errorHandler.logWarning('Error scraping condition info', { error: error.message });
                // Don't throw - condition might be optional or found elsewhere
            }
        }

        /**
         * Scrape price information with fallback strategies
         * @param {Object} currentPageData - Data object to populate
         */
        async scrapePriceInfo(currentPageData) {
            try {
                // Primary method: look for price input
                const priceInput = document.querySelector('input[name="price"]');
                if (priceInput && priceInput.value) {
                    currentPageData.price = priceInput.value.trim();
                }

                // Fallback: look for alternative price selectors
                if (!currentPageData.price) {
                    const altSelectors = [
                        'input[id*="price"]',
                        'input[class*="price"]',
                        '.price input',
                        '[data-price]'
                    ];

                    for (const selector of altSelectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            const value = element.value || element.textContent || element.dataset.price;
                            if (value && value.trim()) {
                                currentPageData.price = value.trim();
                                this.errorHandler.logDebug('Found price using fallback selector', { selector, value });
                                break;
                            }
                        }
                    }
                }

                this.errorHandler.logDebug('Price scraping completed', { price: currentPageData.price });

            } catch (error) {
                this.errorHandler.logWarning('Error scraping price info', { error: error.message });
                // Don't throw - price might be optional
            }
        }

        /**
         * Scrape description information
         * @param {Object} currentPageData - Data object to populate
         */
        async scrapeDescriptionInfo(currentPageData) {
            try {
                const commentsField = document.getElementById('comments');
                if (commentsField) {
                    currentPageData.originalDescription = commentsField.value || '';
                }

                this.errorHandler.logDebug('Description scraping completed', {
                    descriptionLength: currentPageData.originalDescription.length
                });

            } catch (error) {
                this.errorHandler.logWarning('Error scraping description info', { error: error.message });
                // Don't throw - description is optional
            }
        }

        /**
         * Scrape release URL with multiple fallback strategies
         * @param {Object} currentPageData - Data object to populate
         */
        async scrapeReleaseUrl(currentPageData) {
            try {
                // Strategy 1: Look for "View Complete Release Details" link specifically
                const viewDetailsLink = document.querySelector('a[href*="/release/"]:not([href*="/sell/"]):not([href*="/buy/"])');
                if (viewDetailsLink && viewDetailsLink.href) {
                    currentPageData.releaseUrl = viewDetailsLink.href;
                    this.errorHandler.logDebug('Found release URL via View Complete Release Details link', { 
                        url: currentPageData.releaseUrl,
                        linkText: viewDetailsLink.textContent?.trim()
                    });
                    return;
                }

                // Strategy 2: Look for any direct release link
                const releaseLink = document.querySelector('a[href*="/release/"]');
                if (releaseLink && releaseLink.href) {
                    currentPageData.releaseUrl = releaseLink.href;
                    this.errorHandler.logDebug('Found release URL via direct link', { url: currentPageData.releaseUrl });
                    return;
                }

                // Strategy 2: Look for data attributes
                const releaseElements = document.querySelectorAll('[data-release-id], [data-release-url]');
                for (let element of releaseElements) {
                    if (element.dataset.releaseId) {
                        currentPageData.releaseUrl = `https://www.discogs.com/release/${element.dataset.releaseId}`;
                        this.errorHandler.logDebug('Found release URL via data-release-id', { 
                            releaseId: element.dataset.releaseId,
                            url: currentPageData.releaseUrl 
                        });
                        return;
                    } else if (element.dataset.releaseUrl) {
                        currentPageData.releaseUrl = element.dataset.releaseUrl;
                        this.errorHandler.logDebug('Found release URL via data-release-url', { url: currentPageData.releaseUrl });
                        return;
                    }
                }

                // Strategy 3: Parse from page URL or form data
                const urlMatch = window.location.href.match(/\/sell\/post\/(\d+)/);
                if (urlMatch) {
                    // Look for hidden inputs or form data that might contain release ID
                    const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
                    for (let input of hiddenInputs) {
                        if (input.name && input.name.toLowerCase().includes('release') && input.value) {
                            if (input.value.match(/^\d+$/)) {
                                currentPageData.releaseUrl = `https://www.discogs.com/release/${input.value}`;
                                this.errorHandler.logDebug('Found release URL via hidden input', { 
                                    inputName: input.name,
                                    releaseId: input.value,
                                    url: currentPageData.releaseUrl 
                                });
                                return;
                            }
                        }
                    }
                }

                // Strategy 4: Look in page content for release references
                const pageText = document.body.textContent || '';
                const releaseMatches = pageText.match(/\/release\/(\d+)/g);
                if (releaseMatches && releaseMatches.length > 0) {
                    // Use the first release URL found
                    currentPageData.releaseUrl = `https://www.discogs.com${releaseMatches[0]}`;
                    this.errorHandler.logDebug('Found release URL via page text parsing', { url: currentPageData.releaseUrl });
                    return;
                }

                this.errorHandler.logWarning('No release URL found using any strategy');

            } catch (error) {
                this.errorHandler.logError('Error scraping release URL', { error: error.message });
                throw new Error('Failed to find release URL - ensure you are on a valid Discogs listing page');
            }
        }

        /**
         * Validate that current page data has minimum required information
         * @param {Object} currentPageData - Data to validate
         */
        validateCurrentPageData(currentPageData) {
            const issues = [];

            if (!currentPageData.releaseUrl) {
                issues.push('Release URL not found');
            }

            if (!currentPageData.condition.media && !currentPageData.condition.sleeve) {
                issues.push('No condition information found');
            }

            if (issues.length > 0) {
                const errorMessage = `Current page data validation failed: ${issues.join(', ')}`;
                this.errorHandler.logError('Current page validation failed', { 
                    issues,
                    currentPageData: {
                        hasReleaseUrl: !!currentPageData.releaseUrl,
                        hasMediaCondition: !!currentPageData.condition.media,
                        hasSleeveCondition: !!currentPageData.condition.sleeve,
                        hasPrice: !!currentPageData.price
                    }
                });
                throw new Error(errorMessage);
            }
        }

        /**
         * Scrape release page information with comprehensive error handling and fallbacks
         * @param {string} releaseUrl - URL of the release page to scrape
         * @returns {Object} Release page data
         */
        async scrapeReleasePageInfo(releaseUrl) {
            return await this.errorHandler.executeWithRetry(
                async () => {
                    this.errorHandler.logDebug('Starting release page scraping', { 
                        releaseUrl,
                        timestamp: new Date().toISOString()
                    });
                    
                    if (!releaseUrl) {
                        throw new Error('Release URL is required');
                    }

                    // Validate URL format
                    if (!this.isValidReleaseUrl(releaseUrl)) {
                        throw new Error('Invalid release URL format');
                    }

                    // Check cache first
                    const cachedData = this.cacheManager.getCachedReleaseData(releaseUrl);
                    if (cachedData) {
                        this.errorHandler.logDebug('Using cached release data', { releaseUrl });
                        return cachedData;
                    }

                    // Fetch the release page with timeout and error handling
                    const response = await this.fetchReleasePageWithRetry(releaseUrl);
                    const html = await response.text();
                    
                    if (!html || html.length < 100) {
                        throw new Error("Empty or invalid response from Discogs server");
                    }
                    
                    // Parse and clean the HTML
                    const doc = this.parseAndCleanHtml(html);
                    
                    // Extract content with fallback strategies
                    const { mainContent, allText } = this.extractMainContent(doc);
                    
                    if (allText.length < 50) {
                        throw new Error("Release page content too short - may be blocked, empty, or access denied");
                    }

                    // Clean and format the text
                    const formattedText = this.cleanAndFormatReleaseText(allText);

                    // Extract structured data with fallbacks
                    const releaseData = this.extractStructuredData(doc, formattedText);

                    // Validate extracted data
                    this.validateReleasePageData(releaseData);

                    this.errorHandler.logInfo('Release page data scraped successfully', {
                        releaseUrl,
                        contentLength: allText.length,
                        formattedLength: formattedText.length,
                        hasTitle: !!releaseData.title,
                        hasLabel: !!releaseData.label,
                        hasFormat: !!releaseData.format
                    });

                    // Cache the scraped data for future use
                    this.cacheManager.cacheReleaseData(releaseUrl, releaseData);

                    return releaseData;
                },
                'scraping',
                {
                    maxRetries: 3,
                    retryDelays: [1000, 3000, 5000],
                    onRetry: (attempt, error) => {
                        this.errorHandler.logInfo(`Retrying release page scraping (attempt ${attempt})`, {
                            releaseUrl,
                            errorCode: error.errorCode
                        });
                    }
                }
            );
        }

        /**
         * Validate release URL format
         * @param {string} url - URL to validate
         * @returns {boolean} True if URL is valid
         */
        isValidReleaseUrl(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.hostname.includes('discogs.com') && 
                       url.includes('/release/') && 
                       /\/release\/\d+/.test(url);
            } catch (error) {
                return false;
            }
        }

        /**
         * Fetch release page with retry logic for network issues
         * @param {string} releaseUrl - URL to fetch
         * @returns {Promise<Response>} Fetch response
         */
        async fetchReleasePageWithRetry(releaseUrl) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

            try {
                const response = await fetch(releaseUrl, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; Discogs-AI-Generator/1.0)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Cache-Control': 'no-cache'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('Release page not found (404) - the release may have been deleted');
                    } else if (response.status === 403) {
                        throw new Error('Access denied (403) - you may need to be logged in to Discogs');
                    } else if (response.status === 429) {
                        throw new Error('Rate limited (429) - too many requests to Discogs');
                    } else if (response.status >= 500) {
                        throw new Error(`Discogs server error (${response.status}) - service temporarily unavailable`);
                    } else {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                }

                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                
                if (error.name === 'AbortError') {
                    throw new Error('Request timeout - release page took too long to load');
                }
                
                throw error;
            }
        }

        /**
         * Parse HTML and remove interfering elements
         * @param {string} html - Raw HTML content
         * @returns {Document} Parsed and cleaned document
         */
        parseAndCleanHtml(html) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");

                // Check if parsing was successful
                if (!doc || !doc.body) {
                    throw new Error('Failed to parse HTML document');
                }

                // Remove elements that interfere with scraping
                const junkSelectors = [
                    "script", "style", "nav", "header", "footer", 
                    ".navigation", ".ads", ".advertisement", ".cookie",
                    ".popup", ".modal", ".overlay", ".banner",
                    "[data-testid='ad']", ".ad-container"
                ];

                junkSelectors.forEach(selector => {
                    doc.querySelectorAll(selector).forEach(el => {
                        try {
                            el.remove();
                        } catch (removeError) {
                            // Ignore removal errors
                        }
                    });
                });

                return doc;
            } catch (error) {
                this.errorHandler.logError('Error parsing HTML', { error: error.message });
                throw new Error(`Failed to parse release page HTML: ${error.message}`);
            }
        }

        /**
         * Extract main content from document with fallback strategies
         * @param {Document} doc - Parsed document
         * @returns {Object} Main content element and text
         */
        extractMainContent(doc) {
            const contentSelectors = [
                "#page_content",
                ".content",
                "main",
                "#main",
                ".main-content",
                "[role='main']",
                ".release-page",
                ".profile"
            ];

            let mainContent = null;
            let selectorUsed = null;

            // Try each selector until we find content
            for (const selector of contentSelectors) {
                const element = doc.querySelector(selector);
                if (element) {
                    mainContent = element;
                    selectorUsed = selector;
                    break;
                }
            }

            // Fallback to body if no main content found
            if (!mainContent) {
                mainContent = doc.body;
                selectorUsed = 'body';
                this.errorHandler.logWarning('Using document body as fallback for main content');
            }

            if (!mainContent) {
                throw new Error("Could not find any content on release page");
            }

            const allText = mainContent.textContent || mainContent.innerText || "";

            this.errorHandler.logDebug('Main content extracted', {
                selectorUsed,
                contentLength: allText.length,
                hasTextContent: !!mainContent.textContent,
                hasInnerText: !!mainContent.innerText
            });

            return { mainContent, allText };
        }

        /**
         * Validate that release page data has minimum required information
         * @param {Object} releaseData - Data to validate
         */
        validateReleasePageData(releaseData) {
            const issues = [];

            if (!releaseData.title || releaseData.title === 'Unknown Title') {
                issues.push('Release title not found');
            }

            if (!releaseData.fullText || releaseData.fullText.length < 100) {
                issues.push('Insufficient release page content');
            }

            if (issues.length > 0) {
                const errorMessage = `Release page data validation failed: ${issues.join(', ')}`;
                this.errorHandler.logError('Release page validation failed', { 
                    issues,
                    releaseData: {
                        hasTitle: !!releaseData.title,
                        titleLength: releaseData.title?.length || 0,
                        contentLength: releaseData.fullText?.length || 0,
                        hasLabel: !!releaseData.label,
                        hasFormat: !!releaseData.format
                    }
                });
                throw new Error(errorMessage);
            }
        }

        /**
         * Clean and format release text using delimiter-based parsing
         * @param {string} rawText - Raw text from the release page
         * @returns {string} Cleaned and formatted text
         */
        cleanAndFormatReleaseText(rawText) {
            try {
                // Create regex pattern for delimiters
                const delimiterPattern = new RegExp(
                    `(${this.delimiters.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
                    "gi"
                );

                // Split text by delimiters
                let sections = rawText
                    .split(delimiterPattern)
                    .filter((section) => section.trim().length > 0);

                // Format sections
                let formattedText = "";
                for (let i = 0; i < sections.length; i++) {
                    let section = sections[i].trim();
                    
                    // Skip very short sections, numbers, or junk
                    if (
                        section.length < 2 ||
                        section.toLowerCase().includes("cookie") ||
                        section.toLowerCase().includes("javascript") ||
                        section.match(/^[0-9]+$/)
                    ) {
                        continue;
                    }

                    // Check if this section is a delimiter
                    const isDelimiter = this.delimiters.some((d) => 
                        section.toLowerCase().includes(d.toLowerCase())
                    );

                    if (isDelimiter) {
                        // Add delimiter section
                        if (formattedText.length > 0) formattedText += "\n\n";
                        formattedText += section;
                        
                        // Add the next section if it's not a delimiter
                        if (i + 1 < sections.length) {
                            const nextSection = sections[i + 1].trim();
                            const nextIsDelimiter = this.delimiters.some((d) => 
                                nextSection.toLowerCase().includes(d.toLowerCase())
                            );
                            
                            if (nextSection && !nextIsDelimiter) {
                                formattedText += " " + nextSection;
                                i++; // Skip the next section since we've processed it
                            }
                        }
                    } else {
                        // Add regular content section
                        if (formattedText.length > 0 && !formattedText.endsWith(" ")) {
                            formattedText += "\n";
                        }
                        formattedText += section;
                    }
                }

                return formattedText;

            } catch (error) {
                console.error('Error cleaning release text:', error);
                return rawText; // Return original text if cleaning fails
            }
        }

        /**
         * Extract structured data from the release page DOM
         * @param {Document} doc - Parsed DOM document
         * @param {string} formattedText - Cleaned text content
         * @returns {Object} Structured release data
         */
        extractStructuredData(doc, formattedText) {
            const releaseData = {
                title: '',
                label: '',
                catalogNumber: '',
                year: '',
                country: '',
                format: '',
                genre: '',
                style: '',
                matrixRunout: '',
                notes: '',
                tracklist: '',
                credits: '',
                fullText: formattedText
            };

            try {
                // Extract title
                const titleElement = doc.querySelector('h1[data-testid="title"]') || 
                                   doc.querySelector('h1') ||
                                   doc.querySelector('.profile h1');
                if (titleElement) {
                    releaseData.title = titleElement.textContent.trim();
                }

                // Extract label and catalog number
                const labelElements = doc.querySelectorAll('[data-testid="label"]');
                if (labelElements.length > 0) {
                    releaseData.label = Array.from(labelElements)
                        .map(el => el.textContent.trim())
                        .join(', ');
                }

                const catNoElements = doc.querySelectorAll('[data-testid="catno"]');
                if (catNoElements.length > 0) {
                    releaseData.catalogNumber = Array.from(catNoElements)
                        .map(el => el.textContent.trim())
                        .join(', ');
                }

                // Extract year
                const yearElement = doc.querySelector('[data-testid="year"]');
                if (yearElement) {
                    releaseData.year = yearElement.textContent.trim();
                }

                // Extract country
                const countryElement = doc.querySelector('[data-testid="country"]');
                if (countryElement) {
                    releaseData.country = countryElement.textContent.trim();
                }

                // Extract format
                const formatElements = doc.querySelectorAll('[data-testid="format"]');
                if (formatElements.length > 0) {
                    releaseData.format = Array.from(formatElements)
                        .map(el => el.textContent.trim())
                        .join(', ');
                }

                // Extract genre and style
                const genreElements = doc.querySelectorAll('[data-testid="genre"]');
                if (genreElements.length > 0) {
                    releaseData.genre = Array.from(genreElements)
                        .map(el => el.textContent.trim())
                        .join(', ');
                }

                const styleElements = doc.querySelectorAll('[data-testid="style"]');
                if (styleElements.length > 0) {
                    releaseData.style = Array.from(styleElements)
                        .map(el => el.textContent.trim())
                        .join(', ');
                }

                // Extract matrix/runout information
                const matrixElements = doc.querySelectorAll('[data-testid="matrix"]');
                if (matrixElements.length > 0) {
                    releaseData.matrixRunout = Array.from(matrixElements)
                        .map(el => el.textContent.trim())
                        .join(', ');
                }

                // Extract notes
                const notesElement = doc.querySelector('[data-testid="notes"]');
                if (notesElement) {
                    releaseData.notes = notesElement.textContent.trim();
                }

                console.log('Structured data extracted successfully');
                return releaseData;

            } catch (error) {
                console.error('Error extracting structured data:', error);
                // Return basic data with full text if structured extraction fails
                return {
                    ...releaseData,
                    fullText: formattedText
                };
            }
        }

        /**
         * Format scraped data for API consumption
         * @param {Object} currentPageData - Data from current listing page
         * @param {Object} releasePageData - Data from release page
         * @returns {Object} Formatted data ready for API
         */
        formatDataForAPI(currentPageData, releasePageData) {
            try {
                console.log('Formatting data for API consumption...');

                const formattedData = {
                    // Current page information
                    currentPage: {
                        condition: {
                            media: currentPageData.condition.media || 'Not specified',
                            sleeve: currentPageData.condition.sleeve || 'Not specified'
                        },
                        price: currentPageData.price || 'Not specified',
                        originalDescription: currentPageData.originalDescription || '',
                        releaseUrl: currentPageData.releaseUrl || ''
                    },
                    
                    // Release page information
                    releasePage: {
                        title: releasePageData.title || 'Unknown Title',
                        label: releasePageData.label || 'Unknown Label',
                        catalogNumber: releasePageData.catalogNumber || 'Unknown',
                        year: releasePageData.year || 'Unknown',
                        country: releasePageData.country || 'Unknown',
                        format: releasePageData.format || 'Unknown Format',
                        genre: releasePageData.genre || 'Unknown Genre',
                        style: releasePageData.style || 'Unknown Style',
                        matrixRunout: releasePageData.matrixRunout || 'Not available',
                        notes: releasePageData.notes || 'No notes available',
                        tracklist: releasePageData.tracklist || 'Not available',
                        credits: releasePageData.credits || 'Not available',
                        fullText: releasePageData.fullText || ''
                    }
                };

                console.log('Data formatted for API successfully');
                return formattedData;

            } catch (error) {
                console.error('Error formatting data for API:', error);
                throw new Error(`Failed to format data for API: ${error.message}`);
            }
        }

        /**
         * Validate that required data is present
         * @param {Object} formattedData - Formatted data to validate
         * @returns {boolean} True if data is valid
         */
        validateFormattedData(formattedData) {
            try {
                // Check that we have the basic structure
                if (!formattedData.currentPage || !formattedData.releasePage) {
                    return false;
                }

                // Check that we have at least some release information
                const releaseData = formattedData.releasePage;
                const hasBasicInfo = releaseData.title && 
                                   (releaseData.fullText || releaseData.label || releaseData.format);

                // Check that we have condition information
                const hasCondition = formattedData.currentPage.condition.media || 
                                   formattedData.currentPage.condition.sleeve;

                return hasBasicInfo && hasCondition;

            } catch (error) {
                console.error('Error validating formatted data:', error);
                return false;
            }
        }
    }

    // Form Integration Module
    class FormIntegrator {
        constructor(errorHandler = null) {
            this.maxCharacterLimit = 500;
            this.commentsFieldId = 'comments';
            this.errorHandler = errorHandler || new ErrorHandler();
            this.pageTypeDetector = new PageTypeDetector();
        }

        /**
         * Populate the comments input field with comprehensive error handling and fallbacks
         * @param {string} description - Generated description text
         * @returns {Promise<Object>} Population result with details
         */
        async populateCommentsField(description) {
            return await this.errorHandler.executeWithRetry(
                async () => {
                    this.errorHandler.logDebug('Starting form field population', {
                        descriptionLength: description?.length || 0,
                        fieldId: this.commentsFieldId
                    });
                    
                    // Validate input
                    if (!description || typeof description !== 'string') {
                        throw new Error('Invalid description provided - must be a non-empty string');
                    }

                    if (description.trim().length === 0) {
                        throw new Error('Description is empty after trimming whitespace');
                    }

                    // Find the comments field with fallback strategies
                    const commentsField = await this.getCommentsFieldWithFallback();
                    if (!commentsField) {
                        throw new Error('Comments field not found on page - ensure you are on a Discogs listing page');
                    }

                    // Validate field is writable
                    this.validateFieldWritable(commentsField);

                    // Truncate description if necessary
                    const truncatedDescription = this.truncateDescription(description, this.maxCharacterLimit);
                    
                    if (truncatedDescription.length !== description.length) {
                        this.errorHandler.logWarning('Description truncated to fit character limit', {
                            originalLength: description.length,
                            truncatedLength: truncatedDescription.length,
                            maxLimit: this.maxCharacterLimit
                        });
                    }

                    // Store original value for potential rollback
                    const originalValue = commentsField.value;

                    try {
                        // Clear existing content and set new description
                        await this.setFieldValueSafely(commentsField, truncatedDescription);

                        // Trigger form validation events
                        await this.triggerFormValidation(commentsField);

                        // Apply focus management
                        this.applyFocusManagement(commentsField);

                        // Verify the value was set correctly
                        if (commentsField.value !== truncatedDescription) {
                            this.errorHandler.logWarning('Field value verification failed', {
                                expected: truncatedDescription.substring(0, 50) + '...',
                                actual: commentsField.value.substring(0, 50) + '...'
                            });
                        }

                        const result = {
                            success: true,
                            originalLength: description.length,
                            finalLength: truncatedDescription.length,
                            wasTruncated: truncatedDescription.length !== description.length,
                            fieldId: commentsField.id || commentsField.name,
                            previousValue: originalValue
                        };

                        this.errorHandler.logInfo('Comments field populated successfully', result);
                        return result;

                    } catch (setError) {
                        // Attempt to rollback on failure
                        try {
                            commentsField.value = originalValue;
                            this.errorHandler.logInfo('Rolled back field value after population failure');
                        } catch (rollbackError) {
                            this.errorHandler.logWarning('Failed to rollback field value', { 
                                error: rollbackError.message 
                            });
                        }
                        throw setError;
                    }
                },
                'form',
                {
                    maxRetries: 2,
                    retryDelays: [500, 1000],
                    onRetry: (attempt, error) => {
                        this.errorHandler.logInfo(`Retrying form population (attempt ${attempt})`, {
                            errorCode: error.errorCode
                        });
                    }
                }
            );
        }

        /**
         * Find comments field with multiple fallback strategies using PageTypeDetector
         * @returns {Promise<HTMLElement|null>} Comments field element
         */
        async getCommentsFieldWithFallback() {
            this.errorHandler.logDebug('Starting enhanced field detection with PageTypeDetector');
            
            // Detect page type first
            const pageType = this.pageTypeDetector.detectPageType();
            this.errorHandler.logDebug('Detected page type', { pageType });

            const detectionResults = [];

            // Strategy 1: Standard ID lookup
            this.errorHandler.logDebug('Attempting Strategy 1: Standard ID lookup');
            let commentsField = document.getElementById(this.commentsFieldId);
            if (commentsField && this.validateCommentsField(commentsField)) {
                const confidence = this.calculateConfidenceScore(commentsField, 'standard');
                detectionResults.push({ field: commentsField, method: 'standard', confidence });
                this.errorHandler.logDebug('Found comments field via standard ID', { confidence });
                return commentsField;
            }

            // Strategy 2: Wait a bit and try again (field might be loading)
            this.errorHandler.logDebug('Attempting Strategy 2: Delayed standard ID lookup');
            await this.errorHandler.delay(500);
            commentsField = document.getElementById(this.commentsFieldId);
            if (commentsField && this.validateCommentsField(commentsField)) {
                const confidence = this.calculateConfidenceScore(commentsField, 'standard');
                detectionResults.push({ field: commentsField, method: 'standard-delayed', confidence });
                this.errorHandler.logDebug('Found comments field after waiting', { confidence });
                return commentsField;
            }

            // Strategy 3: Dynamic ID pattern detection (for manage/edit pages)
            this.errorHandler.logDebug('Attempting Strategy 3: Dynamic ID pattern detection');
            const dynamicField = this.detectCommentsFieldDynamic();
            if (dynamicField) {
                const confidence = this.calculateConfidenceScore(dynamicField, 'dynamic');
                detectionResults.push({ field: dynamicField, method: 'dynamic', confidence });
                this.errorHandler.logDebug('Found comments field via dynamic ID pattern', { 
                    id: dynamicField.id, 
                    confidence 
                });
                return dynamicField;
            }

            // Strategy 4: Name attribute pattern matching
            this.errorHandler.logDebug('Attempting Strategy 4: Name attribute pattern matching');
            const nameField = this.detectCommentsFieldByName();
            if (nameField) {
                const confidence = this.calculateConfidenceScore(nameField, 'name');
                detectionResults.push({ field: nameField, method: 'name', confidence });
                this.errorHandler.logDebug('Found comments field via name pattern', { 
                    name: nameField.name, 
                    confidence 
                });
                return nameField;
            }

            // Strategy 5: Page-type specific selectors
            this.errorHandler.logDebug('Attempting Strategy 5: Page-type specific selectors');
            const pageSelectors = this.pageTypeDetector.getFieldSelectors(pageType);
            for (const selector of pageSelectors) {
                try {
                    const element = document.querySelector(selector);
                    if (element && this.validateCommentsField(element)) {
                        const confidence = this.calculateConfidenceScore(element, 'page-specific');
                        detectionResults.push({ field: element, method: 'page-specific', confidence });
                        this.errorHandler.logDebug('Found comments field via page-specific selector', { 
                            selector, 
                            id: element.id,
                            confidence 
                        });
                        return element;
                    }
                } catch (error) {
                    this.errorHandler.logDebug('Error with page-specific selector', { selector, error: error.message });
                }
            }

            // Strategy 6: Proximity-based detection
            this.errorHandler.logDebug('Attempting Strategy 6: Proximity-based detection');
            const proximityField = this.findFieldByProximity();
            if (proximityField) {
                const confidence = this.calculateConfidenceScore(proximityField, 'proximity');
                detectionResults.push({ field: proximityField, method: 'proximity', confidence });
                this.errorHandler.logDebug('Found comments field via proximity detection', { 
                    id: proximityField.id, 
                    confidence 
                });
                return proximityField;
            }

            // Strategy 7: Legacy alternative selectors (for backward compatibility)
            this.errorHandler.logDebug('Attempting Strategy 7: Legacy alternative selectors');
            const alternativeSelectors = [
                'textarea[id*="comment"]',
                'input[id*="comment"]',
                'textarea[placeholder*="comment"]',
                'input[placeholder*="comment"]',
                '.comments textarea',
                '.comments input[type="text"]'
            ];

            for (const selector of alternativeSelectors) {
                try {
                    const element = document.querySelector(selector);
                    if (element && this.validateCommentsField(element)) {
                        const confidence = this.calculateConfidenceScore(element, 'legacy');
                        detectionResults.push({ field: element, method: 'legacy', confidence });
                        this.errorHandler.logDebug('Found comments field via legacy selector', { 
                            selector, 
                            confidence 
                        });
                        return element;
                    }
                } catch (error) {
                    this.errorHandler.logDebug('Error with legacy selector', { selector, error: error.message });
                }
            }

            // Strategy 8: Last resort - any textarea with comment-related attributes
            this.errorHandler.logDebug('Attempting Strategy 8: Last resort textarea search');
            const textareas = document.querySelectorAll('textarea');
            let bestCandidate = null;
            let bestConfidence = 0;

            for (const textarea of textareas) {
                if (!this.validateCommentsField(textarea)) {
                    continue;
                }

                const id = textarea.id?.toLowerCase() || '';
                const name = textarea.name?.toLowerCase() || '';
                const placeholder = textarea.placeholder?.toLowerCase() || '';
                
                if (id.includes('comment') || name.includes('comment') || placeholder.includes('comment')) {
                    const confidence = this.calculateConfidenceScore(textarea, 'textarea-search');
                    detectionResults.push({ field: textarea, method: 'textarea-search', confidence });
                    
                    if (confidence > bestConfidence) {
                        bestCandidate = textarea;
                        bestConfidence = confidence;
                    }
                }
            }

            if (bestCandidate) {
                this.errorHandler.logDebug('Found comments field via textarea search', { 
                    id: bestCandidate.id, 
                    name: bestCandidate.name,
                    confidence: bestConfidence
                });
                return bestCandidate;
            }

            // Log comprehensive failure information
            this.errorHandler.logError('Comments field not found using any strategy', {
                pageType,
                detectionResults,
                availableTextareas: Array.from(document.querySelectorAll('textarea')).map(el => ({
                    id: el.id,
                    name: el.name,
                    placeholder: el.placeholder,
                    tagName: el.tagName,
                    type: el.type
                })),
                availableInputs: Array.from(document.querySelectorAll('input[type="text"]')).map(el => ({
                    id: el.id,
                    name: el.name,
                    placeholder: el.placeholder,
                    tagName: el.tagName,
                    type: el.type
                })),
                pageUrl: window.location.href,
                pageSelectors: pageSelectors
            });

            return null;
        }

        /**
         * Validate that the field is writable
         * @param {HTMLElement} field - Field to validate
         */
        validateFieldWritable(field) {
            if (field.disabled) {
                throw new Error('Comments field is disabled and cannot be modified');
            }

            if (field.readOnly) {
                throw new Error('Comments field is read-only and cannot be modified');
            }

            // Check if field is hidden or not visible
            const style = window.getComputedStyle(field);
            if (style.display === 'none' || style.visibility === 'hidden') {
                this.errorHandler.logWarning('Comments field appears to be hidden', {
                    display: style.display,
                    visibility: style.visibility
                });
            }
        }

        /**
         * Set field value with additional safety checks
         * @param {HTMLElement} field - Field to update
         * @param {string} value - Value to set
         */
        async setFieldValueSafely(field, value) {
            try {
                // Clear the field first
                field.value = '';
                
                // Small delay to ensure clearing is processed
                await this.errorHandler.delay(50);
                
                // Set the new value
                field.value = value;

                // Verify the value was set
                if (field.value !== value) {
                    // Try alternative setting methods
                    field.setAttribute('value', value);
                    
                    // Try dispatching input event to trigger any listeners
                    const inputEvent = new Event('input', { bubbles: true });
                    field.dispatchEvent(inputEvent);
                    
                    // Final check
                    if (field.value !== value) {
                        throw new Error('Field value could not be set correctly');
                    }
                }

                this.errorHandler.logDebug('Field value set successfully', {
                    fieldId: field.id || field.name,
                    valueLength: value.length,
                    actualLength: field.value.length
                });

            } catch (error) {
                this.errorHandler.logError('Error setting field value', { 
                    error: error.message,
                    fieldId: field.id || field.name,
                    fieldType: field.tagName,
                    valueLength: value.length
                });
                throw new Error(`Failed to set field value: ${error.message}`);
            }
        }

        /**
         * Get the comments input field element
         * @returns {HTMLElement|null} Comments field element
         */
        getCommentsField() {
            const commentsField = document.getElementById(this.commentsFieldId);
            
            if (!commentsField) {
                console.error('Comments field not found. Available form fields:', 
                    Array.from(document.querySelectorAll('input, textarea')).map(el => el.id || el.name));
                return null;
            }

            // Verify it's a text input or textarea
            const validTypes = ['text', 'textarea'];
            const fieldType = commentsField.tagName.toLowerCase();
            const inputType = commentsField.type ? commentsField.type.toLowerCase() : 'text';
            
            if (!validTypes.includes(fieldType) && !validTypes.includes(inputType)) {
                console.warn(`Comments field has unexpected type: ${fieldType}/${inputType}`);
            }

            return commentsField;
        }

        /**
         * Set the value of the form field with proper handling
         * @param {HTMLElement} field - Form field element
         * @param {string} value - Value to set
         */
        setFieldValue(field, value) {
            try {
                // Store original value for potential rollback
                const originalValue = field.value;

                // Clear the field first
                field.value = '';
                
                // Set the new value
                field.value = value;

                // Verify the value was set correctly
                if (field.value !== value) {
                    console.warn('Field value may not have been set correctly');
                    console.log('Expected:', value);
                    console.log('Actual:', field.value);
                }

                console.log(`Field value updated: ${originalValue.length} → ${value.length} characters`);

            } catch (error) {
                console.error('Error setting field value:', error);
                throw new Error(`Failed to set field value: ${error.message}`);
            }
        }

        /**
         * Trigger proper form validation events
         * @param {HTMLElement} field - Form field element
         */
        triggerFormValidation(field) {
            try {
                console.log('Triggering form validation events...');

                // Create and dispatch input event (for real-time validation)
                const inputEvent = new Event('input', {
                    bubbles: true,
                    cancelable: true,
                    composed: true
                });
                field.dispatchEvent(inputEvent);

                // Create and dispatch change event (for form state management)
                const changeEvent = new Event('change', {
                    bubbles: true,
                    cancelable: true,
                    composed: true
                });
                field.dispatchEvent(changeEvent);

                // Trigger blur event to ensure validation runs
                const blurEvent = new Event('blur', {
                    bubbles: true,
                    cancelable: true,
                    composed: true
                });
                field.dispatchEvent(blurEvent);

                // For some forms, we may need to trigger keyup as well
                const keyupEvent = new KeyboardEvent('keyup', {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    key: 'Enter',
                    keyCode: 13
                });
                field.dispatchEvent(keyupEvent);

                // Check if the form has any validation feedback
                this.checkValidationFeedback(field);

                console.log('Form validation events triggered successfully');

            } catch (error) {
                console.error('Error triggering form validation:', error);
                // Don't throw here as this is not critical for basic functionality
                console.warn('Form validation may not work properly, but field population succeeded');
            }
        }

        /**
         * Check for validation feedback and log any issues
         * @param {HTMLElement} field - Form field element
         */
        checkValidationFeedback(field) {
            try {
                // Check HTML5 validation
                if (field.validity && !field.validity.valid) {
                    console.warn('Field validation failed:', field.validationMessage);
                }

                // Check for custom validation messages
                const validationElements = [
                    field.parentElement?.querySelector('.error'),
                    field.parentElement?.querySelector('.validation-error'),
                    field.parentElement?.querySelector('[class*="error"]'),
                    document.querySelector(`[data-field="${field.id}"] .error`)
                ].filter(Boolean);

                if (validationElements.length > 0) {
                    console.log('Found validation elements:', validationElements.map(el => el.textContent));
                }

            } catch (error) {
                console.error('Error checking validation feedback:', error);
            }
        }

        /**
         * Apply focus management for better user experience
         * @param {HTMLElement} field - Form field element
         */
        applyFocusManagement(field) {
            try {
                console.log('Applying focus management...');

                // Focus the field to show the user the result
                field.focus();

                // Move cursor to the end of the text
                if (field.setSelectionRange) {
                    const textLength = field.value.length;
                    field.setSelectionRange(textLength, textLength);
                }

                // Scroll the field into view with smooth animation
                field.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });

                // Add a subtle highlight effect to draw attention
                this.addHighlightEffect(field);

                console.log('Focus management applied successfully');

            } catch (error) {
                console.error('Error applying focus management:', error);
                // Don't throw here as this is not critical
                console.warn('Focus management failed, but field population succeeded');
            }
        }

        /**
         * Add a subtle highlight effect to the field
         * @param {HTMLElement} field - Form field element
         */
        addHighlightEffect(field) {
            try {
                // Store original styles
                const originalBackground = field.style.backgroundColor;
                const originalTransition = field.style.transition;

                // Apply highlight effect
                field.style.transition = 'background-color 0.3s ease';
                field.style.backgroundColor = '#e8f5e8'; // Light green highlight

                // Remove highlight after 2 seconds
                setTimeout(() => {
                    field.style.backgroundColor = originalBackground;
                    
                    // Remove transition after animation completes
                    setTimeout(() => {
                        field.style.transition = originalTransition;
                    }, 300);
                }, 2000);

            } catch (error) {
                console.error('Error adding highlight effect:', error);
            }
        }

        /**
         * Truncate description to ensure character limit compliance
         * @param {string} text - Text to truncate
         * @param {number} maxLength - Maximum allowed length
         * @returns {string} Truncated text
         */
        truncateDescription(text, maxLength) {
            if (!text || typeof text !== 'string') {
                return '';
            }

            if (text.length <= maxLength) {
                return text;
            }

            console.log(`Truncating description from ${text.length} to ${maxLength} characters`);

            // Strategy 1: Try to truncate at sentence boundary
            const sentences = text.split(/[.!?]+/);
            let truncated = '';
            
            for (let i = 0; i < sentences.length; i++) {
                const sentence = sentences[i].trim();
                if (!sentence) continue;

                const testLength = truncated.length + sentence.length + (i > 0 ? 2 : 0); // +2 for ". "
                
                if (testLength <= maxLength - 3) { // Leave room for "..."
                    truncated += (truncated ? '. ' : '') + sentence;
                } else {
                    break;
                }
            }
            
            // Strategy 2: If no complete sentences fit, truncate at word boundary
            if (!truncated || truncated.length < maxLength * 0.5) {
                console.log('Sentence-based truncation insufficient, trying word-based truncation');
                
                const words = text.split(' ');
                truncated = '';
                
                for (let word of words) {
                    const testLength = truncated.length + word.length + (truncated ? 1 : 0); // +1 for space
                    
                    if (testLength <= maxLength - 3) { // Leave room for "..."
                        truncated += (truncated ? ' ' : '') + word;
                    } else {
                        break;
                    }
                }
            }
            
            // Strategy 3: If still too long, hard truncate
            if (truncated.length > maxLength - 3) {
                console.log('Word-based truncation still too long, applying hard truncation');
                truncated = text.substring(0, maxLength - 3);
            }
            
            // Add ellipsis if we truncated
            if (truncated.length < text.length) {
                truncated += '...';
            }
            
            console.log(`Truncation complete: ${text.length} → ${truncated.length} characters`);
            return truncated;
        }

        /**
         * Validate that the description meets requirements
         * @param {string} description - Description to validate
         * @returns {Object} Validation result
         */
        validateDescription(description) {
            const result = {
                isValid: true,
                errors: [],
                warnings: []
            };

            try {
                // Check if description exists
                if (!description || typeof description !== 'string') {
                    result.isValid = false;
                    result.errors.push('Description is required and must be a string');
                    return result;
                }

                // Check length
                if (description.length === 0) {
                    result.isValid = false;
                    result.errors.push('Description cannot be empty');
                }

                if (description.length > this.maxCharacterLimit) {
                    result.isValid = false;
                    result.errors.push(`Description exceeds ${this.maxCharacterLimit} character limit (${description.length} characters)`);
                }

                // Check for potentially problematic content
                if (description.includes('<script>') || description.includes('javascript:')) {
                    result.isValid = false;
                    result.errors.push('Description contains potentially unsafe content');
                }

                // Warnings for best practices
                if (description.length < 50) {
                    result.warnings.push('Description is quite short, consider adding more detail');
                }

                if (description.length > this.maxCharacterLimit * 0.9) {
                    result.warnings.push('Description is close to character limit');
                }

                return result;

            } catch (error) {
                result.isValid = false;
                result.errors.push(`Validation error: ${error.message}`);
                return result;
            }
        }

        /**
         * Get current field value for comparison
         * @returns {string} Current field value
         */
        getCurrentFieldValue() {
            try {
                const field = this.getCommentsField();
                return field ? field.value : '';
            } catch (error) {
                console.error('Error getting current field value:', error);
                return '';
            }
        }

        /**
         * Clear the comments field
         * @returns {boolean} Success status
         */
        clearCommentsField() {
            try {
                const field = this.getCommentsField();
                if (!field) {
                    return false;
                }

                this.setFieldValue(field, '');
                this.triggerFormValidation(field);
                
                console.log('Comments field cleared successfully');
                return true;

            } catch (error) {
                console.error('Error clearing comments field:', error);
                return false;
            }
        }

        /**
         * Detect comments field using dynamic ID pattern (e.g., item-123.comments)
         * @returns {HTMLElement|null} Comments field element or null if not found
         */
        detectCommentsFieldDynamic() {
            try {
                this.errorHandler.logDebug('Attempting dynamic ID pattern detection');
                
                // Strategy 1: CSS selector for fields ending with ".comments"
                const dynamicField = document.querySelector('[id$=".comments"]');
                if (dynamicField && this.validateCommentsField(dynamicField)) {
                    this.errorHandler.logDebug('Found comments field via dynamic ID pattern', { 
                        id: dynamicField.id,
                        tagName: dynamicField.tagName 
                    });
                    return dynamicField;
                }

                // Strategy 2: Look for pattern matching item-{number}.comments
                const allElements = document.querySelectorAll('[id*=".comments"]');
                for (const element of allElements) {
                    const pageType = this.pageTypeDetector.detectPageType();
                    if (this.pageTypeDetector.validateFieldId(element.id, pageType) && 
                        this.validateCommentsField(element)) {
                        this.errorHandler.logDebug('Found comments field via pattern validation', { 
                            id: element.id,
                            pageType: pageType 
                        });
                        return element;
                    }
                }

                this.errorHandler.logDebug('No dynamic ID pattern fields found');
                return null;

            } catch (error) {
                this.errorHandler.logError('Error in dynamic ID pattern detection', { error: error.message });
                return null;
            }
        }

        /**
         * Validate that a detected field is actually a comments textarea
         * @param {HTMLElement} field - Field element to validate
         * @returns {boolean} True if field is a valid comments field
         */
        validateCommentsField(field) {
            try {
                if (!field) {
                    return false;
                }

                // Check if it's a textarea or text input
                const tagName = field.tagName.toLowerCase();
                const inputType = field.type ? field.type.toLowerCase() : '';
                
                if (tagName !== 'textarea' && !(tagName === 'input' && inputType === 'text')) {
                    this.errorHandler.logDebug('Field validation failed: not a textarea or text input', {
                        tagName: tagName,
                        inputType: inputType
                    });
                    return false;
                }

                // Check if field is visible and enabled
                const style = window.getComputedStyle(field);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    this.errorHandler.logDebug('Field validation failed: field is hidden', {
                        display: style.display,
                        visibility: style.visibility
                    });
                    return false;
                }

                if (field.disabled) {
                    this.errorHandler.logDebug('Field validation failed: field is disabled');
                    return false;
                }

                // Additional validation for comments-specific attributes
                const id = field.id?.toLowerCase() || '';
                const name = field.name?.toLowerCase() || '';
                const placeholder = field.placeholder?.toLowerCase() || '';
                
                const hasCommentsIndicator = id.includes('comment') || 
                                           name.includes('comment') || 
                                           placeholder.includes('comment');

                if (!hasCommentsIndicator) {
                    this.errorHandler.logDebug('Field validation warning: no comments indicator found', {
                        id: field.id,
                        name: field.name,
                        placeholder: field.placeholder
                    });
                    // Don't return false here as the field might still be valid
                }

                this.errorHandler.logDebug('Field validation passed', {
                    id: field.id,
                    tagName: tagName,
                    hasCommentsIndicator: hasCommentsIndicator
                });

                return true;

            } catch (error) {
                this.errorHandler.logError('Error validating comments field', { error: error.message });
                return false;
            }
        }

        /**
         * Find textarea fields near price/condition fields using proximity-based detection
         * @returns {HTMLElement|null} Comments field element or null if not found
         */
        findFieldByProximity() {
            try {
                this.errorHandler.logDebug('Attempting proximity-based field detection');

                // Look for price and condition related elements as reference points
                const referenceSelectors = [
                    '[name*="price"]',
                    '[id*="price"]',
                    '[name*="condition"]',
                    '[id*="condition"]',
                    '.price',
                    '.condition',
                    '[class*="price"]',
                    '[class*="condition"]'
                ];

                let referenceElements = [];
                for (const selector of referenceSelectors) {
                    const elements = document.querySelectorAll(selector);
                    referenceElements.push(...Array.from(elements));
                }

                if (referenceElements.length === 0) {
                    this.errorHandler.logDebug('No reference elements found for proximity detection');
                    return null;
                }

                // Find textareas near these reference elements
                const textareas = document.querySelectorAll('textarea');
                let bestCandidate = null;
                let bestScore = 0;

                for (const textarea of textareas) {
                    if (!this.validateCommentsField(textarea)) {
                        continue;
                    }

                    let proximityScore = 0;
                    const textareaRect = textarea.getBoundingClientRect();

                    for (const refElement of referenceElements) {
                        try {
                            const refRect = refElement.getBoundingClientRect();
                            
                            // Calculate distance between elements
                            const distance = Math.sqrt(
                                Math.pow(textareaRect.left - refRect.left, 2) + 
                                Math.pow(textareaRect.top - refRect.top, 2)
                            );

                            // Closer elements get higher scores (inverse relationship)
                            const score = Math.max(0, 1000 - distance);
                            proximityScore += score;

                            // Bonus for being in the same container
                            if (textarea.parentElement === refElement.parentElement) {
                                proximityScore += 500;
                            }

                            // Bonus for being in nearby containers
                            if (textarea.closest('form') === refElement.closest('form')) {
                                proximityScore += 200;
                            }

                        } catch (error) {
                            // Skip this reference element if there's an error
                            continue;
                        }
                    }

                    if (proximityScore > bestScore) {
                        bestScore = proximityScore;
                        bestCandidate = textarea;
                    }
                }

                if (bestCandidate) {
                    this.errorHandler.logDebug('Found comments field via proximity detection', {
                        id: bestCandidate.id,
                        score: bestScore,
                        referenceElementsCount: referenceElements.length
                    });
                    return bestCandidate;
                }

                this.errorHandler.logDebug('No suitable field found via proximity detection');
                return null;

            } catch (error) {
                this.errorHandler.logError('Error in proximity-based field detection', { error: error.message });
                return null;
            }
        }

        /**
         * Detect comments field using name attribute pattern matching
         * @returns {HTMLElement|null} Comments field element or null if not found
         */
        detectCommentsFieldByName() {
            try {
                this.errorHandler.logDebug('Attempting name attribute pattern detection');

                // Strategy 1: Exact name match
                const exactMatch = document.querySelector('textarea[name="comments"]');
                if (exactMatch && this.validateCommentsField(exactMatch)) {
                    this.errorHandler.logDebug('Found comments field via exact name match', { 
                        name: exactMatch.name 
                    });
                    return exactMatch;
                }

                // Strategy 2: Partial name match for textareas
                const partialMatches = document.querySelectorAll('textarea[name*="comments"], textarea[name*="comment"]');
                for (const field of partialMatches) {
                    if (this.validateCommentsField(field)) {
                        this.errorHandler.logDebug('Found comments field via partial name match', { 
                            name: field.name 
                        });
                        return field;
                    }
                }

                // Strategy 3: Check input fields as fallback
                const inputMatches = document.querySelectorAll('input[name*="comments"], input[name*="comment"]');
                for (const field of inputMatches) {
                    if (field.type === 'text' && this.validateCommentsField(field)) {
                        this.errorHandler.logDebug('Found comments field via input name match', { 
                            name: field.name,
                            type: field.type 
                        });
                        return field;
                    }
                }

                this.errorHandler.logDebug('No fields found via name attribute pattern');
                return null;

            } catch (error) {
                this.errorHandler.logError('Error in name attribute pattern detection', { error: error.message });
                return null;
            }
        }

        /**
         * Calculate confidence score for different detection methods
         * @param {HTMLElement} field - Field element
         * @param {string} method - Detection method used
         * @returns {number} Confidence score (1-10)
         */
        calculateConfidenceScore(field, method) {
            try {
                let score = 5; // Base score

                if (!field) {
                    return 0;
                }

                // Method-based scoring
                switch (method) {
                    case 'standard':
                        score = 10; // Highest confidence for standard ID
                        break;
                    case 'dynamic':
                        score = 9; // High confidence for dynamic pattern
                        break;
                    case 'name':
                        score = 7; // Good confidence for name attribute
                        break;
                    case 'proximity':
                        score = 6; // Moderate confidence for proximity
                        break;
                    default:
                        score = 5; // Default confidence
                }

                // Adjust based on field characteristics
                const id = field.id?.toLowerCase() || '';
                const name = field.name?.toLowerCase() || '';
                const placeholder = field.placeholder?.toLowerCase() || '';

                // Bonus for explicit comments indicators
                if (id === 'comments' || name === 'comments') {
                    score += 2;
                } else if (id.includes('comment') || name.includes('comment') || placeholder.includes('comment')) {
                    score += 1;
                }

                // Bonus for textarea vs input
                if (field.tagName.toLowerCase() === 'textarea') {
                    score += 1;
                }

                // Penalty for hidden or disabled fields
                const style = window.getComputedStyle(field);
                if (style.display === 'none' || style.visibility === 'hidden' || field.disabled) {
                    score -= 3;
                }

                // Ensure score is within bounds
                score = Math.max(1, Math.min(10, score));

                this.errorHandler.logDebug('Calculated confidence score', {
                    fieldId: field.id,
                    method: method,
                    score: score
                });

                return score;

            } catch (error) {
                this.errorHandler.logError('Error calculating confidence score', { error: error.message });
                return 1; // Minimum confidence on error
            }
        }
    }

    // Page Type Detection and Configuration
    class PageTypeDetector {
        constructor() {
            this.pageConfig = {
                POST: {
                    urlPattern: '/sell/post/',
                    fieldSelectors: ['#comments'],
                    buttonPosition: 'after-field',
                    fieldIdPattern: /^comments$/
                },
                EDIT: {
                    urlPattern: '/sell/manage_edit',
                    fieldSelectors: ['[id$=".comments"]', 'textarea[name*="comments"]'],
                    buttonPosition: 'after-field',
                    fieldIdPattern: /^item-\d+\.comments$/
                }
            };
        }

        /**
         * Detect the current page type based on URL
         * @returns {string} Page type: 'POST', 'EDIT', or 'UNKNOWN'
         */
        detectPageType() {
            try {
                const url = window.location.href;
                
                if (url.includes(this.pageConfig.POST.urlPattern)) {
                    return 'POST';
                }
                
                if (url.includes(this.pageConfig.EDIT.urlPattern)) {
                    return 'EDIT';
                }
                
                return 'UNKNOWN';
            } catch (error) {
                console.error('[PageTypeDetector] Error detecting page type:', error);
                return 'UNKNOWN';
            }
        }

        /**
         * Get field selectors for the specified page type
         * @param {string} pageType - Page type ('POST', 'EDIT', or 'UNKNOWN')
         * @returns {Array<string>} Array of CSS selectors for finding comment fields
         */
        getFieldSelectors(pageType = null) {
            try {
                const type = pageType || this.detectPageType();
                
                if (this.pageConfig[type]) {
                    return this.pageConfig[type].fieldSelectors;
                }
                
                // Fallback to POST selectors for unknown page types
                console.warn(`[PageTypeDetector] Unknown page type '${type}', using POST selectors as fallback`);
                return this.pageConfig.POST.fieldSelectors;
            } catch (error) {
                console.error('[PageTypeDetector] Error getting field selectors:', error);
                return this.pageConfig.POST.fieldSelectors;
            }
        }

        /**
         * Get complete configuration for the specified page type
         * @param {string} pageType - Page type ('POST', 'EDIT', or 'UNKNOWN')
         * @returns {Object} Page configuration object
         */
        getPageConfig(pageType = null) {
            try {
                const type = pageType || this.detectPageType();
                
                if (this.pageConfig[type]) {
                    return { ...this.pageConfig[type], pageType: type };
                }
                
                // Fallback to POST configuration for unknown page types
                console.warn(`[PageTypeDetector] Unknown page type '${type}', using POST configuration as fallback`);
                return { ...this.pageConfig.POST, pageType: 'POST' };
            } catch (error) {
                console.error('[PageTypeDetector] Error getting page configuration:', error);
                return { ...this.pageConfig.POST, pageType: 'POST' };
            }
        }

        /**
         * Validate if a field ID matches the expected pattern for the page type
         * @param {string} fieldId - Field ID to validate
         * @param {string} pageType - Page type to validate against
         * @returns {boolean} True if field ID matches the expected pattern
         */
        validateFieldId(fieldId, pageType = null) {
            try {
                const type = pageType || this.detectPageType();
                
                if (this.pageConfig[type] && this.pageConfig[type].fieldIdPattern) {
                    return this.pageConfig[type].fieldIdPattern.test(fieldId);
                }
                
                return false;
            } catch (error) {
                console.error('[PageTypeDetector] Error validating field ID:', error);
                return false;
            }
        }

        /**
         * Get all supported page types
         * @returns {Array<string>} Array of supported page type names
         */
        getSupportedPageTypes() {
            return Object.keys(this.pageConfig);
        }

        /**
         * Check if the current page type is supported
         * @returns {boolean} True if current page type is supported
         */
        isCurrentPageSupported() {
            const pageType = this.detectPageType();
            return pageType !== 'UNKNOWN';
        }
    }

    // Main Application Class
    class DiscogsAIGenerator {
        constructor() {
            this.errorHandler = new ErrorHandler();
            this.config = new ConfigManager();
            this.pageTypeDetector = new PageTypeDetector();
            this.uiInjector = new UIInjector(this.pageTypeDetector);
            this.dataScraper = new DataScraper(this.errorHandler);
            this.formIntegrator = new FormIntegrator(this.errorHandler);
            
            // Performance optimization managers
            this.debounceManager = new DebounceManager();
            this.domOptimizer = new DOMOptimizer();
            this.updateManager = new UpdateManager();
            
            this.isInitialized = false;
        }

        /**
         * Initialize the application with comprehensive error handling
         */
        async init() {
            if (this.isInitialized) {
                this.errorHandler.logDebug('Application already initialized, skipping');
                return;
            }

            try {
                this.errorHandler.logInfo('Discogs AI Description Generator initializing', {
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                });
                
                // Check if we're on the correct page
                if (!this.isValidPage()) {
                    this.errorHandler.logInfo('Not on a valid Discogs listing page, skipping initialization', {
                        currentUrl: window.location.href
                    });
                    return;
                }

                // Wait for page to be fully loaded with timeout
                await this.waitForPageLoadWithTimeout();

                // Inject UI elements (API key will be prompted when needed)
                await this.injectUIWithErrorHandling();
                
                // Check for updates in the background
                this.updateManager.checkForUpdates().catch(error => {
                    this.errorHandler.logWarning('Update check failed', { error: error.message });
                });
                
                // Set up cleanup on page unload
                this.setupCleanup();
                
                this.errorHandler.logInfo('Discogs AI Description Generator initialized successfully');
                this.isInitialized = true;
                
            } catch (error) {
                this.errorHandler.logError('Failed to initialize Discogs AI Description Generator', {
                    error: error.message,
                    stack: error.stack,
                    url: window.location.href
                });
                
                const categorizedError = this.errorHandler.categorizeError(error, 'initialization');
                this.showError(`Initialization failed: ${categorizedError.userMessage}`);
            }
        }

        /**
         * Wait for page load with timeout and better error handling
         */
        async waitForPageLoadWithTimeout() {
            return new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 100; // 10 seconds maximum wait time
                const checkInterval = 100; // Check every 100ms
                
                const checkForCommentsField = () => {
                    // Use page-type-aware field detection
                    const pageType = this.pageTypeDetector.detectPageType();
                    let commentsField = null;
                    
                    if (pageType === 'POST') {
                        commentsField = document.getElementById('comments');
                    } else if (pageType === 'EDIT') {
                        // For EDIT pages, look for any comments field with the pattern
                        commentsField = document.querySelector('[id$=".comments"]') ||
                                      document.querySelector('textarea[name*="comments"]');
                    }
                    
                    const isPageReady = commentsField && document.readyState === 'complete';
                    
                    if (isPageReady) {
                        this.errorHandler.logDebug('Page ready for UI injection', {
                            attempts,
                            pageType,
                            readyState: document.readyState,
                            hasCommentsField: !!commentsField,
                            fieldId: commentsField.id || commentsField.name || 'unnamed'
                        });
                        resolve();
                    } else {
                        attempts++;
                        if (attempts >= maxAttempts) {
                            this.errorHandler.logError('Page load timeout', {
                                attempts,
                                pageType,
                                readyState: document.readyState,
                                hasCommentsField: !!commentsField,
                                availableElements: Array.from(document.querySelectorAll('input, textarea')).map(el => ({
                                    id: el.id,
                                    name: el.name,
                                    type: el.type
                                }))
                            });
                            reject(new Error(`Page did not load properly within 10 seconds - comments field not found for ${pageType} page`));
                        } else {
                            setTimeout(checkForCommentsField, checkInterval);
                        }
                    }
                };
                
                checkForCommentsField();
            });
        }

        /**
         * Inject UI with enhanced error handling
         */
        async injectUIWithErrorHandling() {
            try {
                console.log('[DEBUG] Starting UI injection process...');
                const pageType = this.pageTypeDetector.detectPageType();
                console.log(`[DEBUG] Detected page type: ${pageType}`);
                
                // Inject the UI directly without DOM optimizer scheduling
                const success = await this.uiInjector.injectGenerateButton(() => {
                    this.handleGenerateClick();
                });

                console.log(`[DEBUG] UI injection result: ${success}`);

                if (!success) {
                    throw new Error('UI injection returned false - button may not have been created');
                }

                // Wait a moment for DOM to update before verification
                await this.errorHandler.delay(100);

                // Verify injection was successful
                if (!this.uiInjector.isInjected()) {
                    throw new Error('UI injection verification failed - elements not found in DOM');
                }

                this.errorHandler.logDebug('UI injection completed successfully');

            } catch (error) {
                this.errorHandler.logError('UI injection failed', { error: error.message });
                throw new Error(`Failed to inject UI elements: ${error.message}`);
            }
        }

        /**
         * Wait for the page to be fully loaded and comments field to be available
         */
        async waitForPageLoad() {
            return new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 50; // 5 seconds maximum wait time
                
                const checkForCommentsField = () => {
                    const commentsField = document.getElementById('comments');
                    if (commentsField) {
                        console.log('Comments field found, page ready for UI injection');
                        resolve();
                    } else {
                        attempts++;
                        if (attempts >= maxAttempts) {
                            reject(new Error('Comments field not found after waiting 5 seconds'));
                        } else {
                            setTimeout(checkForCommentsField, 100);
                        }
                    }
                };
                checkForCommentsField();
            });
        }

        /**
         * Inject UI elements into the page
         */
        async injectUI() {
            const success = await this.uiInjector.injectGenerateButton(() => {
                this.handleGenerateClick();
            });

            if (!success) {
                throw new Error('Failed to inject UI elements');
            }
        }

        /**
         * Handle the generate button click with comprehensive error handling
         */
        async handleGenerateClick() {
            // Use debouncing to prevent multiple simultaneous API calls
            const operationKey = `generate_${window.location.href}`;
            
            return this.debounceManager.debounce(operationKey, async () => {
                let generatedDescription = null;
                
                try {
                    this.errorHandler.logInfo('AI Generate button clicked', {
                        timestamp: new Date().toISOString(),
                        url: window.location.href
                    });
                    
                    // Show initial loading state
                    this.uiInjector.showLoadingState('Initializing...');

                // Ensure we have a valid API key
                const apiKey = await this.ensureValidApiKey();

                // Create OpenAI client with error handler
                const openAIClient = new OpenAIClient(apiKey, this.errorHandler);

                // Scrape data from current page and release page
                const scrapedData = await this.scrapeReleaseDataWithFallback();

                // Generate description using OpenAI API
                this.uiInjector.updateLoadingMessage('Generating description with AI...');
                
                // Debug: Log the scraped data being sent to OpenAI
                console.log('=== DEBUG: Data being sent to OpenAI ===');
                console.log('Scraped data structure:', scrapedData);
                console.log('Current page data:', scrapedData.currentPage);
                console.log('Release page data:', scrapedData.releasePage);
                console.log('=== END DEBUG ===');
                
                generatedDescription = await openAIClient.generateDescription(scrapedData);

                // Populate the comments field with the generated description
                this.uiInjector.updateLoadingMessage('Populating description...');
                const populationResult = await this.formIntegrator.populateCommentsField(generatedDescription);

                // Show success state with details
                let successMessage = 'Description generated and populated successfully!';
                if (populationResult.wasTruncated) {
                    successMessage += ` (Truncated from ${populationResult.originalLength} to ${populationResult.finalLength} characters)`;
                }
                this.uiInjector.showSuccessState(successMessage);

                this.errorHandler.logInfo('Description generation completed successfully', {
                    originalLength: generatedDescription.length,
                    finalLength: populationResult.finalLength,
                    wasTruncated: populationResult.wasTruncated
                });

            } catch (error) {
                this.errorHandler.logError('Generation process failed', { 
                    error: error.message,
                    stack: error.stack
                });

                // Categorize the error for better user feedback
                const categorizedError = this.errorHandler.categorizeError(error, 'generation');
                
                // Attempt fallback behavior
                const fallbackResult = this.errorHandler.handleFallback(categorizedError, {
                    generatedText: generatedDescription,
                    enableBasicScraping: true
                });

                // Show appropriate error message
                let errorMessage = categorizedError.userMessage;
                if (fallbackResult.fallbackExecuted && fallbackResult.success) {
                    errorMessage = fallbackResult.message;
                    this.uiInjector.showSuccessState(errorMessage);
                } else {
                    if (categorizedError.suggestedAction) {
                        errorMessage += ` (${categorizedError.suggestedAction})`;
                    }
                    this.uiInjector.showErrorState(errorMessage);
                }

                // Log user-friendly error for debugging
                console.error('Discogs AI Generator:', errorMessage);
            }
            }, 500); // 500ms debounce delay
        }

        /**
         * Ensure we have a valid API key with enhanced validation
         * @returns {Promise<string>} Valid API key
         */
        async ensureValidApiKey() {
            let apiKey = this.config.getApiKey();
            
            if (!apiKey || !this.config.validateApiKeyFormat(apiKey)) {
                this.errorHandler.logInfo('API key not configured or invalid, prompting user');
                
                try {
                    apiKey = await this.config.promptForApiKey();
                    this.errorHandler.logInfo('API key configured successfully');
                } catch (error) {
                    throw new Error(`API key configuration failed: ${error.message}`);
                }
            }

            // Test the API key with a lightweight validation call
            try {
                await this.validateApiKeyWithTimeout(apiKey);
                this.errorHandler.logDebug('API key validation successful');
            } catch (validationError) {
                this.errorHandler.logError('API key validation failed', { error: validationError.message });
                // Clear the invalid key
                this.config.clearApiKey();
                throw new Error(`API key validation failed: ${validationError.message}`);
            }

            return apiKey;
        }

        /**
         * Validate API key with timeout and better error handling
         * @param {string} apiKey - API key to validate
         * @returns {Promise<boolean>} True if valid
         */
        async validateApiKeyWithTimeout(apiKey) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('API key validation timed out'));
                }, 10000);

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://api.openai.com/v1/models',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 8000,
                    onload: (response) => {
                        clearTimeout(timeout);
                        
                        if (response.status === 200) {
                            resolve(true);
                        } else if (response.status === 401) {
                            reject(new Error('Invalid API key - authentication failed'));
                        } else if (response.status === 429) {
                            reject(new Error('API rate limit exceeded during validation'));
                        } else {
                            reject(new Error(`API validation failed with status ${response.status}`));
                        }
                    },
                    onerror: (error) => {
                        clearTimeout(timeout);
                        reject(new Error('Network error during API key validation'));
                    },
                    ontimeout: () => {
                        clearTimeout(timeout);
                        reject(new Error('API key validation request timed out'));
                    }
                });
            });
        }

        /**
         * Scrape release data with fallback strategies
         * @returns {Object} Formatted data ready for API consumption
         */
        async scrapeReleaseDataWithFallback() {
            try {
                // Step 1: Scrape current page information
                this.uiInjector.updateLoadingMessage('Scraping current page data...');
                const currentPageData = await this.dataScraper.scrapeCurrentPageInfo();

                // Validate that we have a release URL
                if (!currentPageData.releaseUrl) {
                    throw new Error('Could not find release URL on current page');
                }

                // Step 2: Scrape release page information
                this.uiInjector.updateLoadingMessage('Scraping release page data...');
                const releasePageData = await this.dataScraper.scrapeReleasePageInfo(currentPageData.releaseUrl);

                // Step 3: Format data for API consumption
                this.uiInjector.updateLoadingMessage('Formatting data...');
                const formattedData = this.dataScraper.formatDataForAPI(currentPageData, releasePageData);

                // Step 4: Validate the formatted data
                if (!this.dataScraper.validateFormattedData(formattedData)) {
                    throw new Error('Scraped data validation failed - insufficient information found');
                }

                return formattedData;

            } catch (error) {
                this.errorHandler.logError('Error during data scraping', { 
                    error: error.message,
                    url: window.location.href
                });
                throw error;
            }
        }





        /**
         * Utility function to create delays
         * @param {number} ms - Milliseconds to delay
         */
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        /**
         * Set up cleanup handlers for performance optimization
         */
        setupCleanup() {
            // Clean up on page unload
            window.addEventListener('beforeunload', () => {
                this.cleanup();
            });

            // Clean up on navigation (for SPAs)
            window.addEventListener('popstate', () => {
                this.cleanup();
            });

            // Periodic cleanup every 5 minutes
            setInterval(() => {
                this.performPeriodicCleanup();
            }, 5 * 60 * 1000);
        }

        /**
         * Clean up all resources and optimization managers
         */
        cleanup() {
            try {
                this.errorHandler.logDebug('Performing cleanup');
                
                // Cancel all debounced operations
                this.debounceManager.cancelAll();
                
                // Clean up DOM optimizations
                this.domOptimizer.cleanup();
                
                // Clear any temporary data
                this.performPeriodicCleanup();
                
                this.errorHandler.logDebug('Cleanup completed');
            } catch (error) {
                this.errorHandler.logWarning('Cleanup failed', { error: error.message });
            }
        }

        /**
         * Perform periodic cleanup of temporary data
         */
        performPeriodicCleanup() {
            try {
                // Clean up old cache entries
                if (this.dataScraper && this.dataScraper.cacheManager) {
                    this.dataScraper.cacheManager.cleanupOldCacheEntries();
                }
                
                // Clear old error logs (keep last 25 instead of 50)
                const errorLogs = this.errorHandler.getErrorLogs();
                if (errorLogs.length > 25) {
                    const recentLogs = errorLogs.slice(-25);
                    localStorage.setItem('discogs_ai_error_logs', JSON.stringify(recentLogs));
                }
                
                this.errorHandler.logDebug('Periodic cleanup completed');
            } catch (error) {
                this.errorHandler.logWarning('Periodic cleanup failed', { error: error.message });
            }
        }

        /**
         * Get performance statistics
         * @returns {Object} Performance statistics
         */
        getPerformanceStats() {
            try {
                const stats = {
                    version: VERSION_INFO.version,
                    activeOperations: this.debounceManager.getActiveCount(),
                    cacheStats: this.dataScraper.cacheManager.getCacheStats(),
                    errorLogCount: this.errorHandler.getErrorLogs().length,
                    isInitialized: this.isInitialized,
                    timestamp: new Date().toISOString()
                };
                
                return stats;
            } catch (error) {
                return { error: error.message };
            }
        }

        /**
         * Check if current page is a valid Discogs listing page
         * @returns {boolean} True if on valid page
         */
        isValidPage() {
            const url = window.location.href;
            return url.includes('discogs.com/sell/post/') || 
                   url.includes('discogs.com/sell/manage_edit');
        }





        /**
         * Show error message to user with enhanced error handling
         * @param {string} message - Error message to display
         * @param {Object} options - Display options
         */
        showError(message, options = {}) {
            this.errorHandler.logError('Showing error to user', { 
                message,
                options,
                hasUIInjector: !!this.uiInjector,
                isUIInjected: this.uiInjector?.isInjected() || false
            });
            
            // Use UI injector if available and injected
            if (this.uiInjector && this.uiInjector.isInjected()) {
                this.uiInjector.showErrorState(message);
                return;
            }
            
            // Fallback to notification for initialization errors
            try {
                const notification = this.createErrorNotification(message, options);
                document.body.appendChild(notification);
                
                // Auto-remove after specified time or default 10 seconds
                const autoRemoveTime = options.autoRemoveTime || 10000;
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, autoRemoveTime);

                this.errorHandler.logDebug('Error notification displayed', { 
                    autoRemoveTime,
                    messageLength: message.length
                });

            } catch (notificationError) {
                this.errorHandler.logError('Failed to show error notification', { 
                    error: notificationError.message,
                    originalMessage: message
                });
                
                // Ultimate fallback - just alert
                alert(`Discogs AI Generator Error: ${message}`);
            }
        }

        /**
         * Create error notification element
         * @param {string} message - Error message
         * @param {Object} options - Display options
         * @returns {HTMLElement} Notification element
         */
        createErrorNotification(message, options = {}) {
            const notification = document.createElement('div');
            const isDebug = this.errorHandler.isDebugMode();
            
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #f44336;
                color: white;
                padding: 16px 20px;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                z-index: 10000;
                max-width: 450px;
                box-shadow: 0 4px 16px rgba(244, 67, 54, 0.4);
                border-left: 4px solid #d32f2f;
                line-height: 1.4;
            `;
            
            let notificationContent = `
                <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <span>⚠️</span>
                    <span>AI Generator Error</span>
                </div>
                <div style="margin-bottom: 12px;">${this.escapeHtml(message)}</div>
            `;

            // Add debug information if in debug mode
            if (isDebug) {
                notificationContent += `
                    <div style="
                        margin-top: 12px;
                        padding-top: 12px;
                        border-top: 1px solid rgba(255,255,255,0.3);
                        font-size: 12px;
                        opacity: 0.9;
                    ">
                        <div><strong>Debug Info:</strong></div>
                        <div>Time: ${new Date().toLocaleTimeString()}</div>
                        <div>URL: ${window.location.pathname}</div>
                    </div>
                `;
            }

            // Add action buttons if specified
            if (options.showRetryButton || options.showDebugButton) {
                notificationContent += `
                    <div style="
                        margin-top: 12px;
                        display: flex;
                        gap: 8px;
                        justify-content: flex-end;
                    ">
                `;

                if (options.showRetryButton) {
                    notificationContent += `
                        <button onclick="this.parentElement.parentElement.parentElement.remove(); window.location.reload();" style="
                            background: rgba(255,255,255,0.2);
                            border: 1px solid rgba(255,255,255,0.3);
                            color: white;
                            padding: 6px 12px;
                            border-radius: 4px;
                            font-size: 12px;
                            cursor: pointer;
                        ">Retry</button>
                    `;
                }

                if (options.showDebugButton && !isDebug) {
                    notificationContent += `
                        <button onclick="localStorage.setItem('discogs_ai_debug', 'true'); window.location.reload();" style="
                            background: rgba(255,255,255,0.2);
                            border: 1px solid rgba(255,255,255,0.3);
                            color: white;
                            padding: 6px 12px;
                            border-radius: 4px;
                            font-size: 12px;
                            cursor: pointer;
                        ">Debug</button>
                    `;
                }

                notificationContent += `</div>`;
            }

            notification.innerHTML = notificationContent;
            return notification;
        }

        /**
         * Escape HTML to prevent XSS
         * @param {string} text - Text to escape
         * @returns {string} Escaped text
         */
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

    // Initialize when DOM is ready
    function initializeApp() {
        try {
            console.log('[DEBUG] Creating DiscogsAIGenerator instance...');
            const app = new DiscogsAIGenerator();
            
            // Store instance for debugging
            window.discogsAIInstance = app;
            
            console.log('[DEBUG] Starting initialization...');
            app.init().catch(error => {
                console.error('Failed to initialize Discogs AI Description Generator:', error);
                console.error('Error stack:', error.stack);
            });
            
            // Log version information
            console.log(`%c🤖 Discogs AI Description Generator v${VERSION_INFO.version}`, 
                       'color: #4CAF50; font-weight: bold; font-size: 14px;');
            console.log(`%cFeatures: ${VERSION_INFO.features.join(', ')}`, 
                       'color: #666; font-size: 12px;');
            console.log('%cType debugDiscogsAI() for debugging information', 
                       'color: #666; font-size: 11px;');
        } catch (error) {
            console.error('[DEBUG] Failed to create DiscogsAIGenerator instance:', error);
            console.error('[DEBUG] Error stack:', error.stack);
        }
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

    // Export for debugging (optional)
    window.DiscogsAIGenerator = DiscogsAIGenerator;
    window.ConfigManager = ConfigManager;
    window.UIInjector = UIInjector;
    window.DataScraper = DataScraper;
    window.OpenAIClient = OpenAIClient;
    window.FormIntegrator = FormIntegrator;
    window.ErrorHandler = ErrorHandler;
    
    // Add debugging helper
    window.debugDiscogsAI = function() {
        console.log('=== Discogs AI Debug Info ===');
        console.log('Current URL:', window.location.href);
        
        if (window.discogsAIInstance) {
            const pageType = window.discogsAIInstance.pageTypeDetector.detectPageType();
            console.log('Detected page type:', pageType);
            console.log('Is initialized:', window.discogsAIInstance.isInitialized);
            console.log('Is valid page:', window.discogsAIInstance.isValidPage());
            
            // Check for comments fields
            const commentsFields = document.querySelectorAll('[id$=".comments"], #comments, textarea[name*="comments"]');
            console.log('Found comments fields:', commentsFields.length);
            commentsFields.forEach((field, index) => {
                console.log(`  Field ${index + 1}:`, {
                    id: field.id,
                    name: field.name,
                    tagName: field.tagName,
                    visible: window.getComputedStyle(field).display !== 'none'
                });
            });
            
            // Check if button exists
            const button = document.getElementById('ai-generate-btn');
            console.log('AI button exists:', !!button);
            if (button) {
                console.log('Button visible:', window.getComputedStyle(button).display !== 'none');
            }
        } else {
            console.log('Discogs AI instance not found');
        }
        console.log('=== End Debug Info ===');
    };
    
    // Export optimization classes
    window.CacheManager = CacheManager;
    window.DebounceManager = DebounceManager;
    window.DOMOptimizer = DOMOptimizer;
    window.UpdateManager = UpdateManager;
    window.VERSION_INFO = VERSION_INFO;
    
    // Add console commands for debugging and management
    window.discogsAI = {
        getStats: () => {
            const app = window.discogsAIInstance;
            return app ? app.getPerformanceStats() : { error: 'App not initialized' };
        },
        clearCache: () => {
            const app = window.discogsAIInstance;
            if (app && app.dataScraper) {
                app.dataScraper.cacheManager.clearAllCache();
                console.log('Cache cleared successfully');
            } else {
                console.log('App not initialized or cache not available');
            }
        },
        getVersion: () => VERSION_INFO,
        getCacheStats: () => {
            const app = window.discogsAIInstance;
            return app && app.dataScraper ? 
                app.dataScraper.cacheManager.getCacheStats() : 
                { error: 'Cache not available' };
        },
        enableDebug: () => {
            localStorage.setItem('discogs_ai_debug', 'true');
            console.log('Debug mode enabled. Reload the page to see debug logs.');
        },
        disableDebug: () => {
            localStorage.removeItem('discogs_ai_debug');
            console.log('Debug mode disabled.');
        }
    };

})();