#!/usr/bin/env bash
# Runs every sim model test; exits non-zero if any fail.
cd "$(dirname "$0")/.." || exit 1
fails=0
for f in scripts/sim-tests/*.test.ts; do npx tsx "$f" > /dev/null 2>&1 || { echo "FAIL $f"; fails=$((fails+1)); }; done
echo "$fails failing of $(ls scripts/sim-tests/*.test.ts | wc -l) sim tests"; exit $((fails > 0))
