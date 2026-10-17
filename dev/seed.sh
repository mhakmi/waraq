#!/bin/bash
# Loads the synthetic sample documents into the local Paperless-ngx.
# Safe to run twice: it creates only the labels and documents that are missing.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
URL=${PAPERLESS_URL:-http://localhost:8010}
AUTH=admin:waraq-dev-password
ACCEPT="Accept: application/json; version=9"

api() {
  curl -sf -u "$AUTH" -H "$ACCEPT" "$@"
}

# Prints the id of the label with this name, creating it first if needed.
ensure_label() {
  local endpoint=$1 name=$2 extra=${3:-'{}'}
  local id
  id=$(api "$URL/api/$endpoint/?name__iexact=$(jq -rn --arg v "$name" '$v|@uri')" | jq -r '.results[0].id // empty')
  if [ -z "$id" ]; then
    id=$(api -X POST -H 'Content-Type: application/json' \
      -d "$(jq -n --arg name "$name" --argjson extra "$extra" '{name: $name} + $extra')" \
      "$URL/api/$endpoint/" | jq -r '.id')
  fi
  echo "$id"
}

ensure_label tags Inbox '{"is_inbox_tag": true, "color": "#1f6feb"}' > /dev/null
for tag in Bills Home Health Insurance School Tax Warranty; do
  ensure_label tags "$tag" > /dev/null
done
for type in Bill Letter Receipt Policy Certificate "Tax slip"; do
  ensure_label document_types "$type" > /dev/null
done

[ -d "$HERE/fixtures/pdf" ] || "$HERE/fixtures/make-documents.sh" > /dev/null

existing=$(api "$URL/api/documents/?page_size=100&fields=title" | jq -r '.results[].title')

tail -n +2 "$HERE/fixtures/samples.tsv" | while IFS=$'\t' read -r file title sender type tags; do
  if grep -qxF "$title" <<< "$existing"; then
    continue
  fi
  args=(-F "document=@$HERE/fixtures/pdf/$file.pdf" -F "title=$title")
  args+=(-F "correspondent=$(ensure_label correspondents "$sender")")
  args+=(-F "document_type=$(ensure_label document_types "$type")")
  IFS=, read -ra names <<< "$tags"
  for name in "${names[@]}"; do
    args+=(-F "tags=$(ensure_label tags "$name")")
  done
  task=$(api -X POST "${args[@]}" "$URL/api/documents/post_document/")
  echo "queued $title as task $task"
done
