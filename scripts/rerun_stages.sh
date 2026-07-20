#!/bin/bash
# Re-run the pipeline stages affected by the FRED date-parse and publish fixes.
set -e
cd "$(dirname "$0")/.."
for s in raw_manifest fred_mortgage mortgage_payment publish validate; do
  echo "===== running stage: $s ====="
  .venv/bin/python pipeline.py --stage "$s"
done
