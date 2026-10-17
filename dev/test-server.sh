#!/bin/bash
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
export PAPERLESS_PORT=8011
URL=http://localhost:$PAPERLESS_PORT

compose() {
  docker compose --project-name waraq-test --file "$HERE/compose.yaml" "$@"
}

case ${1:-} in
  up)
    compose up --detach
    echo "waiting for $URL"
    for _ in $(seq 1 120); do
      if curl -sf -u admin:waraq-dev-password "$URL/api/" > /dev/null; then
        echo "ready"
        exit 0
      fi
      sleep 2
    done
    echo "the test server did not answer within 4 minutes" >&2
    exit 1
    ;;
  down)
    compose down --volumes
    ;;
  *)
    echo "usage: $0 up|down" >&2
    exit 2
    ;;
esac
