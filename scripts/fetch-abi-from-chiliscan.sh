#!/bin/bash

# Fetch the TokenVoting ABI used by the PEPPER MainDao track plugins
# Usage: ./scripts/fetch-abi-from-chiliscan.sh
#
# All three track plugins (Standard / Agile / Fast) are proxies to the same
# TokenVoting 1.4 implementation, so one ABI covers them. Chiliscan's own API
# no longer answers, so this uses Routescan's Etherscan-compatible API for
# Chiliz mainnet (chain 88888).

set -euo pipefail

IMPLEMENTATION="0x149aaef5Ffda32D6AC2cE127d04ff0Cf51b4A4AD"
OUTPUT="/tmp/token-voting-abi.json"

echo "📥 Fetching TokenVoting 1.4 ABI"
echo "   Implementation: $IMPLEMENTATION"

curl -s "https://api.routescan.io/v2/network/mainnet/evm/88888/etherscan/api?module=contract&action=getabi&address=$IMPLEMENTATION" \
  | jq -r '.result' \
  > "$OUTPUT"

if [ -s "$OUTPUT" ] && jq -e 'type == "array"' "$OUTPUT" > /dev/null; then
  echo "   ✅ Saved to: $OUTPUT"
else
  echo "   ❌ Failed to fetch ABI"
  exit 1
fi

echo ""
echo "📋 Next step: update TOKEN_VOTING_ABI in config/aragon-abis.ts"
echo "   (keep the trimmed set of errors, events and functions the app uses)"
