#!/bin/bash
# Initialize Prometheus config files from examples if they don't exist
# Run this on first deployment before starting docker compose

TARGETS_DIR="infrastructure/docker/prometheus/targets"
ALERTS_FILE="infrastructure/docker/prometheus/alerts.yml"

# Initialize alerts.yml
if [ ! -f "$ALERTS_FILE" ]; then
  cp "${ALERTS_FILE}.example" "$ALERTS_FILE"
  echo "Created $ALERTS_FILE from example"
fi

# Initialize target files
for dir in "$TARGETS_DIR"/*/; do
  target_file="${dir}targets.json"
  if [ ! -f "$target_file" ]; then
    echo "[]" > "$target_file"
    echo "Created $target_file"
  fi
done

echo "Prometheus config initialization complete"
