# Fair Records TamperMonkey Scripts

A collection of TamperMonkey scripts for automating and enhancing Discogs marketplace operations and record scanning workflows.

## 🚀 Auto-Updates Enabled

All scripts in this repository are configured with auto-update URLs. Once installed, TamperMonkey will automatically check for and install updates every 24 hours.

## 📦 Available Scripts

### Order Management Scripts

#### **Discogs Feedback Helper - Fast** (v2.2)
Fast and efficient auto-fill positive feedback on Discogs order pages + payment reminders
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/discogs-feedback-helper.user.js)

#### **Discogs Order Location Overview** (v1.1)
Display a visual grid of album covers with their storage locations for easy reference
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/discogs-location-overview.user.js)

#### **Discogs Feedback Checker** (v2.2)
Simple red/green feedback indicator with tracking number links
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_feedback-checker.js)

#### **Discogs Order Pick List with Locations** (v2.2)
Injects a button to print a clean pick list of Discogs orders
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_order-picklist-generate.js)

#### **Discogs Item Collapser** (v1.1)
Collapses multiple items in orders to a toggle view
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_order-item-collapse.js)

#### **Discogs Order Album Thumbnails** (v1.3)
Show album cover thumbnails next to orders on Discogs
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_order-item-cover-inject.js)

### Listing & Inventory Management

#### **Discogs Listing Helper v9.4 - BETA FIXED** (v9.4)
Intelligent pricing with size-based format detection (5-9" singles) and smart "Album" keyword handling
- **Latest:** Size detection now takes precedence over "Album" keyword - 7" Albums correctly detected as singles
- Auto-detection for multi-LP box sets, 10" and shellac 78 RPM support
- Same-media-better-sleeve pricing logic
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_[MAIN-LIST-TOOL].js)

#### **Discogs AI Description Generator** (v1.2)
Generate enhanced product descriptions using OpenAI GPT-4o mini API
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_ai-desciption-generate.js)
- **Note:** Requires OpenAI API key configuration

#### **Discogs Enhanced Comment Checker** (v1.6)
Highlights table rows with non-enhanced descriptions
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_description-checker-bulk.js)

#### **Discogs Enhanced Navigator** (v2.1)
Enhanced Discogs navigation with toggleable auto-navigation features
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/discogs-auto-allVersion-auto-sellCopy.js)

#### **Edit Listing Bulk Opener** (v1.2)
Adds a button to open all "Edit Listing" links in new tabs
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_edit-all-items-on-page.js)

### Search & Discovery

#### **Discogs Release Rarity Finder** (v1.1)
Expand all releases on a Discogs master page, score desirability, highlight the top pick
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_release-desirability-highlighter.js)

#### **Discogs US Vinyl Filter** (v1.1)
Automatically adds US and Vinyl filters to Discogs master pages
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_vinyl-and-US-only-filter.js)

### External Tools

#### **RecordScanner to Discogs Auto Navigator** (v1.1)
Extract records from RecordScanner and auto-navigate to Discogs master releases
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/RECORDSCANNER_extract-records.js)

## 🔧 Installation

### First-Time Installation

1. **Install TamperMonkey**
   - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - [Safari](https://apps.apple.com/us/app/tampermonkey/id1482490089)
   - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

2. **Install a Script**
   - Click any **[Install]** link above
   - TamperMonkey will detect the script and show an installation page
   - Click "Install" to confirm

3. **Done!**
   - The script is now active on Discogs
   - Auto-updates are enabled by default

### Updating Scripts

**Automatic (Recommended):**
- TamperMonkey checks for updates every 24 hours automatically
- No action needed on your part

**Manual Update:**
1. Open TamperMonkey dashboard
2. Click the script name
3. Click "Check for updates" in the menu
4. Update will install if available

## 🛠️ Configuration

### Auto-Update Settings

To change how often TamperMonkey checks for updates:
1. Open TamperMonkey Dashboard
2. Go to Settings tab
3. Find "Script update interval"
4. Choose: Daily (default), Weekly, Monthly, or Never

### Script-Specific Settings

Some scripts have configurable options that appear directly on the Discogs page. Look for:
- Settings panels
- Configuration buttons
- Floating UI controls

## 📋 Requirements

- **TamperMonkey** (or compatible userscript manager)
- **Discogs account** (for Discogs scripts)
- **OpenAI API key** (only for AI Description Generator)

## 🐛 Troubleshooting

### Script Not Working
1. Ensure TamperMonkey is enabled
2. Check that the script is enabled in TamperMonkey dashboard
3. Refresh the Discogs page
4. Clear browser cache if needed

### Updates Not Installing
1. Check your TamperMonkey auto-update settings
2. Manually trigger an update check
3. Verify you have the latest TamperMonkey version
4. Check browser console for errors (F12)

### Script Conflicts
- If multiple scripts conflict, try disabling them one at a time
- Check script execution order in TamperMonkey settings

## 📝 Version History

See individual script headers for version information. All scripts follow semantic versioning:
- **Major.Minor** format (e.g., 2.1)
- Minor version bumps indicate updates or bug fixes
- Major version bumps indicate significant changes

## 🤝 Support

- **Issues:** [GitHub Issues](https://github.com/skyfriends/fair-records-tampermonkey/issues)
- **Homepage:** [Repository](https://github.com/skyfriends/fair-records-tampermonkey)

## 📄 License

These scripts are provided as-is for personal use. Use at your own discretion.

## ⚠️ Disclaimer

These scripts automate interactions with Discogs.com. Please use responsibly and in accordance with Discogs' Terms of Service. The authors are not responsible for any account restrictions or issues that may arise from script usage.

---

**Last Updated:** November 2025
**Author:** rova_records
