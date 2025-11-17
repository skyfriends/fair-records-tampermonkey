// ==UserScript==
// @name         Discogs Order Album Thumbnails v1.2
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Show album cover thumbnails next to orders on Discogs (optimized for speed and clarity)
// @author       rova_records
// @match        https://www.discogs.com/sell/orders*
// @exclude      https://www.discogs.com/sell/orders*archived=Y*
// @grant        GM_xmlhttpRequest
// @connect      discogs.com
// @updateURL    https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_order-item-cover-inject.js
// @downloadURL  https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_order-item-cover-inject.js
// @homepageURL  https://github.com/skyfriends/fair-records-tampermonkey
// @supportURL   https://github.com/skyfriends/fair-records-tampermonkey/issues
// ==/UserScript==

(function () {
  "use strict";

  // Skip execution if URL contains archived=Y
  if (window.location.href.includes("archived=Y")) {
    return;
  }

  const fetchCoverUrl = (releaseUrl) => {
    return new Promise((resolve) => {
      const cached = localStorage.getItem("cover_" + releaseUrl);
      if (cached) {
        resolve(cached);
        return;
      }

      GM_xmlhttpRequest({
        method: "GET",
        url: "https://www.discogs.com" + releaseUrl,
        onload: (res) => {
          const match = res.responseText.match(/<img[^>]+src="([^"]+)"[^>]*alt="[^"]*album cover"/);
          const imageUrl = match ? match[1] : null;
          if (imageUrl) {
            localStorage.setItem("cover_" + releaseUrl, imageUrl);
          }
          resolve(imageUrl);
        },
        onerror: () => resolve(null),
      });
    });
  };

  const injectThumbnails = async () => {
    const rows = document.querySelectorAll('tr[id^="order"]');

    for (const row of rows) {
      const releaseLinks = row.querySelectorAll('td.order_item_name a[href^="/release/"]');
      if (!releaseLinks.length) continue;

      const thumbContainer = document.createElement("div");
      thumbContainer.style.display = "flex";
      thumbContainer.style.flexWrap = "wrap";
      thumbContainer.style.gap = "8px";
      thumbContainer.style.marginTop = "6px";

      const releaseUrls = [...releaseLinks].map((link) => link.getAttribute("href"));
      const coverUrls = await Promise.all(releaseUrls.map(fetchCoverUrl));

      coverUrls.forEach((url) => {
        if (url) {
          const img = document.createElement("img");
          img.src = url;
          img.style.height = "75px"; // adjust as needed
          img.style.borderRadius = "6px";
          img.style.boxShadow = "0 1px 4px rgba(0,0,0,0.3)";
          thumbContainer.appendChild(img);
        }
      });

      if (thumbContainer.children.length > 0) {
        row.querySelector("td.order_item_name").appendChild(thumbContainer);
      }
    }
  };

  injectThumbnails();
})();
