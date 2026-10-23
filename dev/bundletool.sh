#!/bin/bash
# Runs bundletool, Google's tool for app bundles, with any bundletool arguments.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DATA=$ROOT/.dev-data
if [ -f "$DATA/toolchain.env" ]; then
  source "$DATA/toolchain.env"
fi
: "${JAVA_HOME:?Set JAVA_HOME to a JDK 17, here or in .dev-data/toolchain.env}"
CACHE=${GRADLE_USER_HOME:-$DATA/gradle}/caches/modules-2/files-2.1

newest_jar() {
  local group=$1 artifact=$2 jar
  jar=$(ls "$CACHE/$group/$artifact"/*/*/"$artifact"-*.jar 2> /dev/null \
    | grep -v -- '-sources.jar$' | sort -V | tail -1 || true)
  if [ -z "$jar" ]; then
    echo "$group:$artifact is not in the Gradle cache. Run dev/android.sh bundle once first." >&2
    exit 1
  fi
  echo "$jar"
}

classpath=""
for artifact in \
  com.android.tools.build:bundletool \
  com.android.tools.build:aapt2-proto \
  com.google.protobuf:protobuf-java \
  com.google.protobuf:protobuf-java-util \
  com.google.guava:guava \
  com.google.guava:failureaccess \
  com.google.dagger:dagger \
  javax.inject:javax.inject \
  org.bitbucket.b_c:jose4j \
  com.google.code.gson:gson; do
  classpath=$classpath:$(newest_jar "${artifact%%:*}" "${artifact#*:}")
done

exec "$JAVA_HOME/bin/java" -cp "${classpath#:}" com.android.tools.build.bundletool.BundleToolMain "$@"
