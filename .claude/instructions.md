# Repository Instructions for Claude Code

## ⚠️ CRITICAL: Version Bump Requirements

**EVERY TIME** you make changes to `DISCOGS_[MAIN-LIST-TOOL].js`, you **MUST** update version numbers in **5 LOCATIONS** + README:

### Required Updates Checklist:

1. **Line 2** - Script name: `// @name Discogs Listing Helper v9.X`
2. **Line 4** - Version metadata: `// @version 9.X`
3. **Line ~35** - Debug log: `debugLog("Script initialized - Version 9.X");`
4. **Line ~3546** - Quick Set title: `"⚡ Quick Set (v9.X)"`
5. **Line ~4000** - Debug panel: `<div><b>Version:</b> 9.X-debug</div>`
6. **README.md** - Update version in "Discogs Listing Helper" section AND add description of changes

### Version Increment Rules:
- **Minor bump** (9.4 → 9.5): Bug fixes, tweaks, small improvements
- **Major bump** (9.x → 10.0): Major features, breaking changes

### 🚨 Git Commit Process (MANDATORY):
**YOU MUST COMPLETE ALL THESE STEPS - DO NOT STOP AFTER MAKING CODE CHANGES!**

1. Update ALL 5 locations in the script file
2. Update README.md with new version and change description
3. **GIT ADD** all modified files: `git add DISCOGS_[MAIN-LIST-TOOL].js README.md VERSION_CHECKLIST.md .claude/instructions.md`
4. **GIT COMMIT** with descriptive message: `git commit -m "Update Discogs List Tool v9.X: [description]"`
5. **GIT PUSH** to main branch: `git push origin main`
6. **VERIFY** changes on GitHub before considering the task complete

**CRITICAL:** Users will NOT receive updates until changes are pushed to GitHub. The workflow is NOT complete until step 5 is done!

## Version History:
- **v9.5** - Fixed 7" single auto-detection for format patterns like "7", 1973"
- **v9.4** - Prioritize size over "Album" keyword detection
- **v9.3** - Expand single detection to all formats 5-9"
- **v9.2** - Fix 7-inch detection regex
- **v9.1** - Same-media-better-sleeve pricing logic

See `VERSION_CHECKLIST.md` for detailed procedures.
