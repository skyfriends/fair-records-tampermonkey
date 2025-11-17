// ==UserScript==
// @name         Discogs US Vinyl Filter v1.0
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Automatically adds US and Vinyl filters to Discogs master pages
// @author       rova_records
// @match        https://www.discogs.com/master/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_vinyl-and-US-only-filter.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_vinyl-and-US-only-filter.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function () {
  "use strict";

  // Get the current URL
  const currentUrl = window.location.href;

  // Check if the URL already contains our query parameters
  const hasFormat = currentUrl.includes("format=Vinyl");
  const hasCountry = currentUrl.includes("country=US");

  // Only proceed if we need to add one or both parameters
  if (!hasFormat || !hasCountry) {
    // Parse the current URL
    const url = new URL(currentUrl);

    // Add or update the parameters
    url.searchParams.set("format", "Vinyl");
    url.searchParams.set("country", "US");

    // Construct the new URL
    const newUrl = url.toString();

    // Only redirect if the URL has actually changed
    if (newUrl !== currentUrl) {
      console.log("Discogs US Vinyl Filter: Redirecting to filtered view");
      // Redirect to the new URL
      window.location.href = newUrl;
    }
  } else {
    console.log("Discogs US Vinyl Filter: Page already has the correct filters");
  }
})();
