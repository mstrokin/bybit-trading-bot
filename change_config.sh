#!/bin/bash

# change_config.sh: Updates parameter values in all start_*.sh scripts.
# Usage: ./change_config.sh --TP=2.0 --interval=10 --BALERT=30
# This will replace the values for the specified parameters in all start_*.sh files.

for arg in "$@"; do
  if [[ $arg =~ ^--([A-Za-z]+)=(.+)$ ]]; then
    param="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    echo "Updating --$param to $value in all start_*.sh files..."
    for file in start_*.sh; do
      if [[ -f "$file" ]]; then
        sed -i '' "s/--$param=[^ ]*/--$param=$value/g" "$file"
        echo "Updated $file"
      fi
    done
  else
    echo "Invalid argument: $arg. Use format --PARAM=VALUE"
  fi
done

echo "Updates complete."