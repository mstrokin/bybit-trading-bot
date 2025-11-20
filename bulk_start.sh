#!/bin/bash

# bulk_start.sh: Starts specified start_*.sh scripts using pm2.
# Usage: ./bulk_start.sh [CURRENCY1 CURRENCY2 ...]
# If no currencies provided, starts all start_*.sh scripts.
# Example: ./bulk_start.sh ANIME ARB DOGE
# Ensure pm2 is installed and configured.

if [ $# -eq 0 ]; then
  echo "No currencies specified. Starting all bots with pm2..."
  for script in start_*.sh; do
    if [[ -f "$script" ]]; then
      echo "Starting $script"
      pm2 start "./$script"
    fi
  done
else
  echo "Starting specified bots with pm2..."
  for currency in "$@"; do
    script="start_${currency}.sh"
    if [[ -f "$script" ]]; then
      echo "Starting $script"
      pm2 start "./$script"
    else
      echo "Script $script not found. Skipping."
    fi
  done
fi

echo "Bulk start complete. Use 'pm2 list' to check status."