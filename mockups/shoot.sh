#!/bin/bash
# Screenshots the whole board in one state with headless Chrome.
#   ./shoot.sh <a|b> <light|dark> <normal|large> <output.png>
set -euo pipefail

MOCKUPS=$(cd "$(dirname "$0")" && pwd)
PROFILE="$MOCKUPS/.chrome-profile"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
WIDTH=2700
HEIGHT=5800

direction=$1
theme=$2
text=$3
output=$4

mkdir -p "$PROFILE" "$(dirname "$output")"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
	--window-size="$WIDTH,$HEIGHT" --force-device-scale-factor=1 --virtual-time-budget=3000 \
	--screenshot="$output" \
	"file://$MOCKUPS/index.html#direction=$direction&theme=$theme&text=$text&clean=1" > /dev/null 2>&1
echo "$output"
