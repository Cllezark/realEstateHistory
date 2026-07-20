#!/bin/bash
# Re-run a sequence of pipeline stages: scripts/rerun_stages.sh stage1 stage2 ...
set -e
cd "$(dirname "$0")/.."
for s in "$@"; do
  echo "===== running stage: $s ====="
  .venv/bin/python pipeline.py --stage "$s"
done
