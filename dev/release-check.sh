#!/bin/bash
# Checks a release APK or app bundle before it goes to a phone or to Google Play.
#
#   dev/release-check.sh <apk or aab>
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [ -f "$ROOT/.dev-data/toolchain.env" ]; then
  source "$ROOT/.dev-data/toolchain.env"
fi
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK, here or in .dev-data/toolchain.env}"

ALLOWED_PERMISSIONS=(
  android.permission.INTERNET
  android.permission.VIBRATE
  android.permission.ACCESS_NETWORK_STATE
  android.permission.ACCESS_WIFI_STATE
  android.permission.WAKE_LOCK
  android.permission.RECEIVE_BOOT_COMPLETED
)
MIN_TARGET_SDK=36

DENIED_NPM_PACKAGES=(
  @react-native-firebase/analytics
  @react-native-firebase/crashlytics
  @sentry/react-native
  react-native-appsflyer
  react-native-fbsdk-next
  react-native-google-mobile-ads
  @bugsnag/react-native
)
DENIED_JAVA_PACKAGES=(
  com.google.firebase.analytics
  com.google.android.gms.measurement
  com.google.firebase.crashlytics
  io.sentry
  com.appsflyer
  com.facebook.appevents
  com.facebook.ads
  com.google.android.gms.ads
  com.bugsnag
)

BUILD_TOOLS=$ANDROID_HOME/build-tools/36.0.0
AAPT2=$BUILD_TOOLS/aapt2
READELF=$(ls "$ANDROID_HOME"/ndk/*/toolchains/llvm/prebuilt/*/bin/llvm-readelf | sort -V | tail -1)

ARTIFACT=${1:?usage: dev/release-check.sh <apk or aab>}
[ -f "$ARTIFACT" ] || {
  echo "$ARTIFACT does not exist" >&2
  exit 1
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

case "$ARTIFACT" in
  *.aab)
    "$ROOT/dev/bundletool.sh" build-apks --bundle="$ARTIFACT" --output="$WORK/universal.apks" \
      --mode=universal --aapt2="$AAPT2" > "$WORK/bundletool.log" 2>&1 || {
      cat "$WORK/bundletool.log" >&2
      exit 1
    }
    unzip -q -o "$WORK/universal.apks" universal.apk -d "$WORK"
    APK=$WORK/universal.apk
    ;;
  *.apk)
    APK=$ARTIFACT
    ;;
  *)
    echo "expected an .apk or an .aab, got $ARTIFACT" >&2
    exit 1
    ;;
esac
unzip -q "$APK" 'classes*.dex' 'lib/*' -d "$WORK/apk" 2> /dev/null || true

failures=0
pass() {
  echo "ok    $*"
}
fail() {
  echo "FAIL  $*"
  failures=$((failures + 1))
}

badging=$("$AAPT2" dump badging "$APK")
manifest=$("$AAPT2" dump xmltree --file AndroidManifest.xml "$APK")
package=$(sed -nE "s/^package: name='([^']+)'.*/\1/p" <<< "$badging")
echo "$ARTIFACT"
sed -nE "s/^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'.*/\1, version \3, code \2/p" <<< "$badging"
echo

check_permissions() {
  local permission granted allowed
  for permission in $(sed -nE "s/^uses-permission(-sdk-23)?: name='([^']+)'.*/\2/p" <<< "$badging"); do
    allowed=no
    for granted in "${ALLOWED_PERMISSIONS[@]}" "$package.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"; do
      if [ "$permission" = "$granted" ]; then
        allowed=yes
      fi
    done
    if [ "$allowed" = yes ]; then
      pass "permission $permission"
    else
      fail "permission $permission is not in ALLOWED_PERMISSIONS"
    fi
  done
}

check_target_sdk() {
  local target
  target=$(sed -nE "s/^targetSdkVersion:'([0-9]+)'/\1/p" <<< "$badging")
  if [ "${target:-0}" -ge "$MIN_TARGET_SDK" ]; then
    pass "targetSdk $target, minSdk $(sed -nE "s/^minSdkVersion:'([0-9]+)'/\1/p" <<< "$badging")"
  else
    fail "targetSdk ${target:-missing} is below $MIN_TARGET_SDK"
  fi
}

# Android allows backup when the attribute is missing, so only an explicit false passes.
check_backup() {
  if grep -q 'android:allowBackup(0x01010280)=false' <<< "$manifest"; then
    pass "allowBackup is false"
  else
    fail "allowBackup is true or missing"
  fi
}

# Both print one line per element: its path, then its attributes sorted by name.
plugin_network_config() {
  python3 - "$ROOT/plugins/network-security.ts" << 'EOF'
import re, sys, xml.etree.ElementTree as ElementTree

def walk(element, path):
    path = f'{path}/{element.tag}' if path else element.tag
    attributes = sorted(f'{name.split("}")[-1]}={value}' for name, value in element.attrib.items())
    print(' '.join([path] + attributes))
    for child in element:
        walk(child, path)

text = open(sys.argv[1]).read()
source = re.search(r'(<network-security-config>.*</network-security-config>)', text, re.DOTALL).group(1)
walk(ElementTree.fromstring(source), '')
EOF
}

built_network_config() {
  "$AAPT2" dump xmltree --file "$1" "$APK" | python3 -c '
import re, sys

stack, lines = [], []
for raw in sys.stdin:
    element = re.match(r"^( *)E: (\S+)", raw)
    if element:
        indent = len(element.group(1))
        while stack and stack[-1][0] >= indent:
            stack.pop()
        stack.append((indent, element.group(2)))
        lines.append(["/".join(name for _, name in stack)])
        continue
    attribute = re.match(r"^ *A: (?:\S+:)?(\w+)(?:\(0x[0-9a-f]+\))?=(\"([^\"]*)\"|\S+)", raw)
    if attribute:
        value = attribute.group(3) if attribute.group(3) is not None else attribute.group(2)
        lines[-1].append(f"{attribute.group(1)}={value}")
for line in lines:
    print(" ".join([line[0]] + sorted(line[1:])))
'
}

check_network_config() {
  local id file
  id=$(sed -nE 's/.*android:networkSecurityConfig\(0x01010527\)=(@0x[0-9a-f]+).*/\1/p' <<< "$manifest")
  if [ -z "$id" ]; then
    fail "the manifest names no network security config"
    return 0
  fi
  file=$("$AAPT2" dump resources "$APK" | grep -A 1 "resource ${id#@} " | sed -nE 's/.*\(file\) ([^ ]+) type=XML.*/\1/p')
  built_network_config "$file" > "$WORK/network-config.built"
  plugin_network_config > "$WORK/network-config.expected"
  if diff -u "$WORK/network-config.expected" "$WORK/network-config.built" > "$WORK/network-config.diff"; then
    pass "network security config matches plugins/network-security.ts"
    sed 's/^/        /' "$WORK/network-config.built"
  else
    fail "network security config differs from plugins/network-security.ts"
    sed 's/^/        /' "$WORK/network-config.diff"
  fi
}

check_native_libraries() {
  local abi name align smallest
  if [ ! -d "$WORK/apk/lib" ]; then
    pass "no native libraries"
    return 0
  fi
  for abi in $(ls "$WORK/apk/lib"); do
    case "$abi" in
      arm64-v8a | x86_64) ;;
      *)
        echo "skip  16 KB  $abi  $(ls "$WORK/apk/lib/$abi" | wc -l | tr -d ' ') libraries, a 32-bit ABI keeps 4 KB pages"
        continue
        ;;
    esac
    for name in $(ls "$WORK/apk/lib/$abi"); do
      smallest=""
      for align in $("$READELF" -l -W "$WORK/apk/lib/$abi/$name" | awk '$1 == "LOAD" { print $NF }'); do
        if [ -z "$smallest" ] || [ $((align)) -lt $((smallest)) ]; then
          smallest=$align
        fi
      done
      if [ $((smallest)) -ge 16384 ]; then
        pass "16 KB  $abi  $name  LOAD align $smallest"
      else
        fail "16 KB  $abi  $name  LOAD align $smallest is below 0x4000"
      fi
    done
  done
  # Libraries stored uncompressed are loaded straight from the APK, so their offsets need 16 KB too.
  if "$BUILD_TOOLS/zipalign" -c -P 16 4 "$APK" > "$WORK/zipalign.log" 2>&1; then
    pass "16 KB  native libraries are aligned inside the APK"
  else
    fail "16 KB  native libraries are not aligned inside the APK"
    grep -v '(OK' "$WORK/zipalign.log" | sed 's/^/        /'
  fi
}

check_trackers() {
  local package_name prefix found=0
  for package_name in "${DENIED_NPM_PACKAGES[@]}"; do
    if grep -qF "\"$package_name\"" "$ROOT/bun.lock"; then
      fail "bun.lock carries $package_name"
      found=1
    fi
  done
  for prefix in "${DENIED_JAVA_PACKAGES[@]}"; do
    if grep -aqF "L${prefix//.//}/" "$WORK"/apk/classes*.dex; then
      fail "the app's code carries $prefix"
      found=1
    fi
    if grep -qF "$prefix." <<< "$manifest"; then
      fail "the manifest names $prefix"
      found=1
    fi
  done
  if [ "$found" = 0 ]; then
    pass "no analytics, ads, or crash SDK in bun.lock, the code, or the manifest"
  fi
}

check_permissions
check_target_sdk
check_backup
check_network_config
check_native_libraries
check_trackers

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures checks failed"
  exit 1
fi
echo "every check passed"
