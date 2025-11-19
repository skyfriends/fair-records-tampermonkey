#!/bin/bash

# Rollback Script for Discogs Tampermonkey Tools
# Easy way to revert to any previous version
#
# Usage:
#   ./rollback.sh              # Interactive mode
#   ./rollback.sh <commit>     # Non-interactive mode

echo "========================================="
echo "  Discogs Tools - Version Rollback"
echo "========================================="
echo ""

# Check if commit hash provided as argument
if [ -n "$1" ]; then
    # Non-interactive mode
    commit_hash="$1"
    echo "Non-interactive mode: Rolling back to $commit_hash"
else
    # Interactive mode
    echo "Recent versions (last 10 commits):"
    echo ""
    git log --oneline --decorate -10 | nl -w2 -s". "
    echo ""

    # Prompt for selection
    read -p "Enter commit number to roll back to (or 'q' to quit): " selection

    if [ "$selection" = "q" ] || [ "$selection" = "Q" ]; then
        echo "Rollback cancelled."
        exit 0
    fi

    # Get the commit hash
    commit_hash=$(git log --oneline -10 | sed -n "${selection}p" | awk '{print $1}')
fi

if [ -z "$commit_hash" ]; then
    echo "❌ Invalid selection."
    exit 1
fi

# Show what we're rolling back to
echo ""
echo "Rolling back to commit: $commit_hash"
git log -1 --format="%h - %s (%ar)" $commit_hash
echo ""

# Confirm (skip in non-interactive mode)
if [ -z "$1" ]; then
    read -p "⚠️  This will HARD RESET to this commit. Continue? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo "Rollback cancelled."
        exit 0
    fi
else
    echo "⚠️  Proceeding with hard reset (non-interactive mode)..."
fi

echo ""
echo "Rolling back..."

# Hard reset to selected commit
git reset --hard $commit_hash

if [ $? -ne 0 ]; then
    echo "❌ Git reset failed!"
    exit 1
fi

echo "✅ Local reset successful."
echo ""

# Ask about force push (auto-yes in non-interactive mode)
if [ -z "$1" ]; then
    read -p "Force push to remote? (yes/no): " push_confirm
else
    push_confirm="yes"
    echo "Auto-pushing to remote (non-interactive mode)..."
fi

if [ "$push_confirm" = "yes" ]; then
    echo "Force pushing to origin main..."
    git push origin main --force

    if [ $? -eq 0 ]; then
        echo "✅ Successfully rolled back and pushed to remote!"
    else
        echo "❌ Push failed! You may need to push manually."
        exit 1
    fi
else
    echo "⚠️  Local rollback complete, but NOT pushed to remote."
    echo "To push later, run: git push origin main --force"
fi

echo ""
echo "========================================="
echo "  Rollback complete!"
echo "========================================="
