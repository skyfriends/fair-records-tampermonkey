// ==UserScript==
// @name         LinkedIn Filter Applied Jobs
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Filter LinkedIn jobs: hide applied jobs, non-Easy Apply jobs, and promoted jobs
// @author       rova_records
// @match        https://www.linkedin.com/jobs/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/LINKEDIN_filter-applied-jobs.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/LINKEDIN_filter-applied-jobs.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function() {
    'use strict';

    /*************************************************************************
     * Configuration
     *************************************************************************/
    const STORAGE_KEY_APPLIED = 'linkedin_hide_applied_jobs';
    const STORAGE_KEY_EASY_APPLY = 'linkedin_hide_easy_apply';
    const STORAGE_KEY_NON_EASY_APPLY = 'linkedin_hide_non_easy_apply';
    const STORAGE_KEY_PROMOTED = 'linkedin_hide_promoted';

    let hideApplied = localStorage.getItem(STORAGE_KEY_APPLIED) !== 'false'; // Enabled by default
    let hideEasyApply = localStorage.getItem(STORAGE_KEY_EASY_APPLY) === 'true'; // Disabled by default
    let hideNonEasyApply = localStorage.getItem(STORAGE_KEY_NON_EASY_APPLY) === 'true'; // Disabled by default
    let hidePromoted = localStorage.getItem(STORAGE_KEY_PROMOTED) === 'true'; // Disabled by default
    let hiddenCount = 0;

    /*************************************************************************
     * Core functionality - Filter jobs
     *************************************************************************/
    function filterJobs() {
        // Find all job listings
        const jobListings = document.querySelectorAll('li.scaffold-layout__list-item');

        jobListings.forEach(listing => {
            // Skip if already processed
            if (listing.dataset.appliedProcessed) return;

            // Mark as processed
            listing.dataset.appliedProcessed = 'true';

            let shouldHide = false;

            // Check 1: Applied status
            if (hideApplied) {
                const footerState = listing.querySelector('.job-card-container__footer-job-state');
                if (footerState && footerState.textContent.trim() === 'Applied') {
                    shouldHide = true;
                }
            }

            // Check 2: Easy Apply status (need to check once for both filters)
            if (!shouldHide && (hideEasyApply || hideNonEasyApply)) {
                const footerItems = listing.querySelectorAll('.job-card-container__footer-item');
                let hasEasyApply = false;

                footerItems.forEach(item => {
                    if (item.textContent.trim() === 'Easy Apply') {
                        hasEasyApply = true;
                    }
                });

                // Hide jobs WITH Easy Apply if that filter is on
                if (hideEasyApply && hasEasyApply) {
                    shouldHide = true;
                }

                // Hide jobs WITHOUT Easy Apply if that filter is on
                if (hideNonEasyApply && !hasEasyApply) {
                    shouldHide = true;
                }
            }

            // Check 3: Promoted
            if (!shouldHide && hidePromoted) {
                // Check the entire footer wrapper for "Promoted" text
                const footerWrapper = listing.querySelector('.job-card-container__footer-wrapper');
                if (footerWrapper) {
                    const text = footerWrapper.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
                    if (text.includes('promoted')) {
                        shouldHide = true;
                    }
                }

                // Also check individual footer items as fallback
                if (!shouldHide) {
                    const footerItems = listing.querySelectorAll('.job-card-container__footer-item');
                    footerItems.forEach(item => {
                        const text = item.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
                        if (text.includes('promoted')) {
                            shouldHide = true;
                        }
                    });
                }
            }

            // Apply visibility
            if (shouldHide) {
                listing.style.display = 'none';
                hiddenCount++;
            } else {
                listing.style.display = '';
            }
        });

        updateCounter();
    }

    /*************************************************************************
     * Watch for dynamically loaded content
     *************************************************************************/
    function setupObserver() {
        const observer = new MutationObserver((mutations) => {
            // Check if new job listings were added
            let shouldProcess = false;

            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        // Check if the added node is a job listing or contains job listings
                        if (node.classList && node.classList.contains('scaffold-layout__list-item')) {
                            shouldProcess = true;
                        } else if (node.querySelectorAll) {
                            const hasJobListings = node.querySelectorAll('li.scaffold-layout__list-item').length > 0;
                            if (hasJobListings) shouldProcess = true;
                        }
                    }
                });
            });

            if (shouldProcess) {
                filterJobs();
            }
        });

        // Start observing the document body for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /*************************************************************************
     * UI - Toggle buttons and counter
     *************************************************************************/
    function createToggleUI() {
        // Don't create if already exists
        if (document.getElementById('linkedin-applied-filter')) return;

        const container = document.createElement('div');
        container.id = 'linkedin-applied-filter';
        Object.assign(container.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '999999',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            borderRadius: '10px',
            overflow: 'hidden',
            border: '1px solid #ddd',
            background: 'white'
        });

        // Header
        const header = document.createElement('div');
        header.textContent = 'LinkedIn Job Filters v2.3';
        Object.assign(header.style, {
            padding: '10px 14px',
            background: 'linear-gradient(135deg, #0a66c2, #004182)',
            color: 'white',
            fontWeight: '600',
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: '14px'
        });

        // Content
        const content = document.createElement('div');
        Object.assign(content.style, {
            padding: '12px',
            display: 'grid',
            gap: '8px',
            minWidth: '220px'
        });

        // Helper function to create toggle button
        function createToggleButton(label, isOn, onClick) {
            const btn = document.createElement('button');
            btn.textContent = label;
            Object.assign(btn.style, {
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '12px',
                background: isOn ? '#10b981' : '#e5e7eb',
                color: isOn ? 'white' : '#374151',
                transition: 'all 0.2s',
                textAlign: 'left'
            });
            btn.onclick = onClick;
            btn.onmouseover = () => btn.style.opacity = '0.8';
            btn.onmouseout = () => btn.style.opacity = '1';
            return btn;
        }

        // Helper to reprocess jobs
        function reprocessJobs() {
            hiddenCount = 0;
            document.querySelectorAll('li.scaffold-layout__list-item').forEach(listing => {
                delete listing.dataset.appliedProcessed;
            });
            filterJobs();
        }

        // Toggle 1: Hide Applied Jobs
        const appliedToggle = createToggleButton(
            hideApplied ? 'Hide Applied Jobs' : 'Hide Applied Jobs',
            hideApplied,
            () => {
                hideApplied = !hideApplied;
                localStorage.setItem(STORAGE_KEY_APPLIED, hideApplied);
                appliedToggle.textContent = hideApplied ? 'Hide Applied Jobs' : 'Hide Applied Jobs';
                appliedToggle.style.background = hideApplied ? '#10b981' : '#e5e7eb';
                appliedToggle.style.color = hideApplied ? 'white' : '#374151';
                reprocessJobs();
                showToast(hideApplied ? 'Hiding applied jobs' : 'Showing applied jobs');
            }
        );

        // Toggle 2: Hide Easy Apply
        const hideEasyApplyToggle = createToggleButton(
            hideEasyApply ? 'Hide Easy Apply' : 'Hide Easy Apply',
            hideEasyApply,
            () => {
                hideEasyApply = !hideEasyApply;
                localStorage.setItem(STORAGE_KEY_EASY_APPLY, hideEasyApply);
                hideEasyApplyToggle.textContent = hideEasyApply ? 'Hide Easy Apply' : 'Hide Easy Apply';
                hideEasyApplyToggle.style.background = hideEasyApply ? '#10b981' : '#e5e7eb';
                hideEasyApplyToggle.style.color = hideEasyApply ? 'white' : '#374151';
                reprocessJobs();
                showToast(hideEasyApply ? 'Hiding Easy Apply jobs' : 'Showing Easy Apply jobs');
            }
        );

        // Toggle 3: Easy Apply Only
        const easyApplyOnlyToggle = createToggleButton(
            hideNonEasyApply ? 'Easy Apply Only' : 'Easy Apply Only',
            hideNonEasyApply,
            () => {
                hideNonEasyApply = !hideNonEasyApply;
                localStorage.setItem(STORAGE_KEY_NON_EASY_APPLY, hideNonEasyApply);
                easyApplyOnlyToggle.textContent = hideNonEasyApply ? 'Easy Apply Only' : 'Easy Apply Only';
                easyApplyOnlyToggle.style.background = hideNonEasyApply ? '#10b981' : '#e5e7eb';
                easyApplyOnlyToggle.style.color = hideNonEasyApply ? 'white' : '#374151';
                reprocessJobs();
                showToast(hideNonEasyApply ? 'Easy Apply only' : 'Showing all jobs');
            }
        );

        // Toggle 4: Hide Promoted
        const promotedToggle = createToggleButton(
            hidePromoted ? 'Hide Promoted' : 'Hide Promoted',
            hidePromoted,
            () => {
                hidePromoted = !hidePromoted;
                localStorage.setItem(STORAGE_KEY_PROMOTED, hidePromoted);
                promotedToggle.textContent = hidePromoted ? 'Hide Promoted' : 'Hide Promoted';
                promotedToggle.style.background = hidePromoted ? '#10b981' : '#e5e7eb';
                promotedToggle.style.color = hidePromoted ? 'white' : '#374151';
                reprocessJobs();
                showToast(hidePromoted ? 'Hiding promoted jobs' : 'Showing promoted jobs');
            }
        );

        // Counter
        const counter = document.createElement('div');
        counter.id = 'applied-jobs-counter';
        Object.assign(counter.style, {
            fontSize: '12px',
            color: '#666',
            padding: '6px 8px',
            background: '#f9f9f9',
            borderRadius: '4px',
            textAlign: 'center',
            marginTop: '4px'
        });
        counter.textContent = 'Hidden: 0 jobs';

        content.appendChild(appliedToggle);
        content.appendChild(hideEasyApplyToggle);
        content.appendChild(easyApplyOnlyToggle);
        content.appendChild(promotedToggle);
        content.appendChild(counter);

        // Collapse behavior
        let collapsed = false;
        header.addEventListener('click', () => {
            collapsed = !collapsed;
            content.style.display = collapsed ? 'none' : 'grid';
        });

        container.appendChild(header);
        container.appendChild(content);
        document.body.appendChild(container);
    }

    function updateCounter() {
        const counter = document.getElementById('applied-jobs-counter');
        if (counter) {
            counter.textContent = `Hidden: ${hiddenCount} job${hiddenCount !== 1 ? 's' : ''}`;
        }
    }

    function showToast(msg, ttl = 2000) {
        const existing = document.getElementById('linkedin-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'linkedin-toast';
        Object.assign(toast.style, {
            position: 'fixed',
            right: '20px',
            bottom: '200px',
            background: 'rgba(0,0,0,0.9)',
            color: 'white',
            padding: '10px 16px',
            borderRadius: '8px',
            zIndex: '1000000',
            fontSize: '13px',
            fontWeight: '500',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        });
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), ttl);
    }

    /*************************************************************************
     * Initialize
     *************************************************************************/
    function init() {
        // Wait for page to stabilize
        setTimeout(() => {
            createToggleUI();
            filterJobs();
            setupObserver();

            if (hiddenCount > 0) {
                showToast(`Filtered ${hiddenCount} job${hiddenCount !== 1 ? 's' : ''}`);
            }
        }, 1000);
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
