# Version Bump Checklist

## ⚠️ IMPORTANT: Read This Before Making Any Script Changes

Whenever you make changes to a TamperMonkey script in this repository, you **MUST** follow this checklist to ensure users receive updates properly.

---

## 📋 Version Bump Procedure

### For: `DISCOGS_[MAIN-LIST-TOOL].js`

When making changes to the Discogs Listing Helper script, update **ALL** of the following locations:

#### 1. Script Metadata Header
- **File:** `DISCOGS_[MAIN-LIST-TOOL].js`
- **Lines to update:**
  - Line 2: `// @name` - Update version number in script name
  - Line 4: `// @version` - Increment version number

**Example:**
```javascript
// @name         Discogs Listing Helper v9.5 - BETA FIXED
// @version      9.5
```

#### 2. Script Initialization
- **File:** `DISCOGS_[MAIN-LIST-TOOL].js`
- **Line:** ~35
- **Update:** Debug log initialization message

**Example:**
```javascript
debugLog("Script initialized - Version 9.5");
```

#### 3. Debug Panel Version
- **File:** `DISCOGS_[MAIN-LIST-TOOL].js`
- **Line:** ~4000 (inside `addDebugInfoPanel` function)
- **Update:** Debug panel version display

**Example:**
```javascript
<div><b>Version:</b> 9.5-debug</div>
```

#### 4. Quick Set Box Title
- **File:** `DISCOGS_[MAIN-LIST-TOOL].js`
- **Line:** ~3546 (inside `createOverlay` function)
- **Update:** Quick Set box header

**Example:**
```javascript
"⚡ Quick Set (v9.5)",
```

#### 5. README.md
- **File:** `README.md`
- **Section:** Listing & Inventory Management
- **Update:**
  - Script title with new version
  - Add brief description of what changed (in bullet point under title)
  - Keep install link the same (it automatically serves latest from main branch)

**Example:**
```markdown
#### **Discogs Listing Helper v9.5 - BETA FIXED** (v9.5)
Intelligent pricing with size-based format detection (5-9" singles) and smart "Album" keyword handling
- **Latest:** [Brief description of v9.5 changes]
- Size detection now takes precedence over "Album" keyword - 7" Albums correctly detected as singles
- Auto-detection for multi-LP box sets, 10" and shellac 78 RPM support
- Same-media-better-sleeve pricing logic
- [Install](https://raw.githubusercontent.com/skyfriends/fair-records-tampermonkey/main/DISCOGS_[MAIN-LIST-TOOL].js)
```

---

## 🔢 Version Numbering Convention

Use semantic versioning with **Major.Minor** format:

- **Minor version bump** (9.4 → 9.5): Bug fixes, small improvements, tweaks
- **Major version bump** (9.x → 10.0): Significant new features, major refactoring, breaking changes

---

## ✅ Final Steps

After updating all version numbers and the README:

1. **Test the script locally** to ensure it works
2. **Commit changes** with a descriptive message:
   ```bash
   git add DISCOGS_[MAIN-LIST-TOOL].js README.md
   git commit -m "Update to v9.5: [brief description of changes]"
   ```
3. **Push to GitHub:**
   ```bash
   git push origin main
   ```
4. **Verify on GitHub** that the raw file shows the correct version
5. **Test auto-update** by checking for updates in TamperMonkey

---

## 🚨 Common Mistakes to Avoid

- ❌ Forgetting to update the Quick Set box version
- ❌ Updating script version but not README version
- ❌ Not updating the debug panel version
- ❌ Skipping the debug log initialization message
- ❌ Not testing before pushing to main

---

## 📁 Quick Reference: Files to Update

For the **Discogs Listing Helper** script, always update:

1. ✅ `DISCOGS_[MAIN-LIST-TOOL].js` - Line 2 (script name)
2. ✅ `DISCOGS_[MAIN-LIST-TOOL].js` - Line 4 (@version)
3. ✅ `DISCOGS_[MAIN-LIST-TOOL].js` - Line ~35 (debug log)
4. ✅ `DISCOGS_[MAIN-LIST-TOOL].js` - Line ~3546 (Quick Set title)
5. ✅ `DISCOGS_[MAIN-LIST-TOOL].js` - Line ~4000 (debug panel)
6. ✅ `README.md` - Listing Helper section

---

## 🔄 Version History Quick Log

Keep this updated with each version:

- **v9.4** - Prioritize size over "Album" keyword, fix 7" Album detection
- **v9.3** - Expand single detection to all small formats (5-9")
- **v9.2** - Fix 7-inch single detection with improved regex
- **v9.1** - Same-media-better-sleeve pricing logic
- **v9.0** - Multi-LP box set auto-detection

---

**Last Updated:** 2025-01-19
**Maintainer:** rova_records
