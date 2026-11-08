#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd ~/Desktop/Sillage
git add -A
git commit -m "Save progress $(date '+%Y-%m-%d %H:%M')"
git push
echo ""
echo "✓ Sillage saved to GitHub!"
sleep 2
