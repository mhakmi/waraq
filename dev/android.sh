#!/bin/bash
# Builds Waraq for Android and runs it on a headless emulator of its own.
#
#   dev/android.sh build         generate android/ and build the release APK for arm64-v8a
#   dev/android.sh bundle        build the release app bundle for Google Play, signed with the upload key, then check it
#   dev/android.sh bundle --reuse-version-code   the same, for a versionCode already built for upload
#   dev/android.sh badging       print the APK's package, versions, SDK levels, and permissions
#   dev/android.sh boot          boot the waraq_pixel emulator headless, creating it if missing
#   dev/android.sh install       install the APK on the emulator
#   dev/android.sh install-bundle [aab]  install the newest bundle's APKs for this emulator, as Google Play would
#   dev/android.sh shot <name>   save a screenshot as .dev-data/shots/<name>.png
#   dev/android.sh flow          sign in, search, edit a title, and mark a document done, then the key screens in dark and large text
#   dev/android.sh scan          scan two documents, rotate and split, set a shared tag, stop at Upload, then share a PDF in
#   dev/android.sh upload        scan and upload three documents, then one killed mid-send, then one sent by the background task
#   dev/android.sh settings      theme, labels, permissions as admin and as a limited user, and the crash log, then dark and large text
#   dev/android.sh fields        set a custom field of each type, save a view, add and delete a note, then the same screens in dark and large text
#   dev/android.sh batch-perf [name]  build a batch of 12 documents and save frame times while scrolling and typing
#   dev/android.sh pdf-check     run the PDF writer's checks on the emulator, then open its 10-page PDF on the Mac
#   dev/android.sh check <name>  check the current screen's touch targets and labels with dev/screen-check.ts
#   dev/android.sh talkback on|off  turn TalkBack on or off
#   dev/android.sh speak <name> [n]  with TalkBack on, move focus n times with Tab and save what TalkBack says
#   dev/android.sh logs          print the app's log lines
#   dev/android.sh adb <args>    run adb against this project's own adb server
#   dev/android.sh fn <name> ...  run one of this script's functions by hand, for example fn tap "Scan"
#   dev/android.sh stop          stop this emulator and its adb server, and nothing else
#   dev/android.sh claim         take the emulator for this checkout, refused while another checkout holds it
#   dev/android.sh release       stop the emulator and give it up
#
# Worktrees share .dev-data but there is one emulator, so every command that uses it
# first needs a claim from the checkout that runs it.
#
# JAVA_HOME and ANDROID_HOME come from the environment or from .dev-data/toolchain.env.
# The SDK may belong to another project, so nothing here writes to it or downloads into it.
# Everything the build and the emulator write stays in .dev-data/ and .avd/.
#
# Another project's adb server may already run on the default port 5037 with its own key.
# This emulator registers only with an adb server of its own on ADB_PORT, and its console
# ports sit above 5585, the last port adb servers scan for emulators, so the other server
# never sees it.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DATA=$ROOT/.dev-data
if [ -f "$DATA/toolchain.env" ]; then
  source "$DATA/toolchain.env"
fi
: "${JAVA_HOME:?Set JAVA_HOME to a JDK 17, here or in .dev-data/toolchain.env}"
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK, here or in .dev-data/toolchain.env}"

export ANDROID_SDK_ROOT=$ANDROID_HOME
export GRADLE_USER_HOME=$DATA/gradle
export __UNSAFE_EXPO_HOME_DIRECTORY=$DATA/expo-home
export ANDROID_AVD_HOME=$ROOT/.avd
export ANDROID_USER_HOME=$DATA/android-user
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

APK=$ROOT/android/app/build/outputs/apk/release/app-release.apk
AAB=$ROOT/android/app/build/outputs/bundle/release/app-release.aab
BUNDLES=$DATA/bundles
LAST_VERSION_CODE=$DATA/last-version-code
APP_ID=$(sed -nE 's/.*"androidPackage": "([^"]+)".*/\1/p' "$ROOT/src/brand.json")
AVD=waraq_pixel
ADB_PORT=5038
CONSOLE_PORT=5600
ADB_DEVICE_PORT=5601
GRPC_PORT=8564
export ANDROID_ADB_SERVER_PORT=$ADB_PORT
SERIAL=emulator-$CONSOLE_PORT
BUILD_TOOLS=$ANDROID_HOME/build-tools/36.0.0
LOGS=$DATA/logs
SHOTS=$DATA/shots
POSTER=$ROOT/dev/fixtures/pdf/lease-renewal.png
GRPCURL=${GRPCURL:-grpcurl}
# The address the flows type into the sign-in screen. The upload flow points it at its proxy.
SIGN_IN_ADDRESS=http://10.0.2.2:8010

OWNER_FILE=$DATA/emulator.owner

claim() {
  local owner
  owner=$(cat "$OWNER_FILE" 2>/dev/null || true)
  if [ -n "$owner" ] && [ "$owner" != "$ROOT" ] && [ -d "$owner" ]; then
    echo "The emulator belongs to $owner. Wait until it runs dev/android.sh release." >&2
    exit 1
  fi
  echo "$ROOT" > "$OWNER_FILE"
}

release() {
  require_claim
  talkback off 2> /dev/null || true
  stop
  rm -f "$OWNER_FILE"
}

require_claim() {
  if [ "$(cat "$OWNER_FILE" 2>/dev/null || true)" != "$ROOT" ]; then
    echo "Run dev/android.sh claim first. The emulator is shared by every checkout." >&2
    exit 1
  fi
}

mkdir -p "$DATA/home" "$DATA/tmp" "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME" "$LOGS" "$SHOTS"
# adb and the emulator read and write their keys under $HOME/.android, whatever ANDROID_USER_HOME says.
[ -e "$DATA/home/.android" ] || ln -s ../android-user "$DATA/home/.android"

adb_server() {
  HOME=$DATA/home TMPDIR=$DATA/tmp command adb -P "$ADB_PORT" "$@"
}

adb() {
  adb_server -s "$SERIAL" "$@"
}

emulator() {
  HOME=$DATA/home TMPDIR=$DATA/tmp command emulator "$@"
}

prebuild() {
  cd "$ROOT"
  bun install > "$LOGS/bun-install.log" 2>&1
  CI=1 bunx expo prebuild --platform android --clean --no-install > "$LOGS/prebuild.log" 2>&1
}

build() {
  prebuild
  cd "$ROOT/android"
  ./gradlew assembleRelease \
    -PreactNativeArchitectures=arm64-v8a \
    -Pandroid.builder.sdkDownload=false \
    --console=plain > "$LOGS/gradle-build.log" 2>&1 || {
    echo "the Gradle build failed, see $LOGS/gradle-build.log" >&2
    grep -A 6 'What went wrong' "$LOGS/gradle-build.log" >&2
    return 1
  }
  echo "$APK"
  badging
}

UPLOAD_KEY_VARIABLES=(WARAQ_UPLOAD_STORE_FILE WARAQ_UPLOAD_KEY_ALIAS WARAQ_UPLOAD_STORE_PASSWORD WARAQ_UPLOAD_KEY_PASSWORD)
UPLOAD_KEY=no

load_upload_key() {
  local name count=0
  if [ -f "$DATA/signing.env" ]; then
    source "$DATA/signing.env"
  fi
  for name in "${UPLOAD_KEY_VARIABLES[@]}"; do
    if [ -n "${!name:-}" ]; then
      count=$((count + 1))
    fi
  done
  if [ "$count" = 0 ]; then
    return 0
  fi
  if [ "$count" != "${#UPLOAD_KEY_VARIABLES[@]}" ]; then
    echo "Set all of ${UPLOAD_KEY_VARIABLES[*]}, or none of them." >&2
    return 1
  fi
  if [ ! -f "$WARAQ_UPLOAD_STORE_FILE" ]; then
    echo "There is no keystore at $WARAQ_UPLOAD_STORE_FILE." >&2
    return 1
  fi
  # Gradle would read a relative path from android/app, so the path is made absolute here.
  WARAQ_UPLOAD_STORE_FILE=$(cd "$(dirname "$WARAQ_UPLOAD_STORE_FILE")" && pwd)/$(basename "$WARAQ_UPLOAD_STORE_FILE")
  export "${UPLOAD_KEY_VARIABLES[@]}"
  UPLOAD_KEY=yes
}

warn_debug_signed() {
  cat >&2 << EOF

  ########################################################################
  #  NOT FOR UPLOAD. No upload key is set, so this bundle is signed with  #
  #  the debug key, and Google Play refuses it. Set the upload key in     #
  #  .dev-data/signing.env as docs/release.md says, and build again.      #
  ########################################################################

EOF
}

# Google Play refuses a versionCode it has seen, so each bundle signed for upload needs a higher
# versionCode than the last one.
bundle() {
  local reuse=$1 version_code version_name last_code output
  if [ "${WARAQ_CRASH_TEST:-}" = 1 ]; then
    echo "WARAQ_CRASH_TEST=1 adds a screen that crashes on purpose. Unset it to build a bundle for upload." >&2
    return 1
  fi
  load_upload_key
  prebuild
  (cd "$ROOT" && bun run licenses > "$LOGS/licenses.log" 2>&1)
  if ! git -C "$ROOT" diff --quiet -- src/settings/licenses.json; then
    echo "src/settings/licenses.json changed when the licenses list was made again. Commit it, then build the bundle." >&2
    return 1
  fi
  version_code=$(sed -nE 's/^ *versionCode ([0-9]+)$/\1/p' "$ROOT/android/app/build.gradle")
  version_name=$(sed -nE 's/^ *versionName "([^"]+)"$/\1/p' "$ROOT/android/app/build.gradle")
  last_code=$(cat "$LAST_VERSION_CODE" 2> /dev/null || echo 0)
  if [ "$version_code" -le "$last_code" ] && [ "$reuse" != --reuse-version-code ]; then
    echo "versionCode $version_code is not higher than $last_code, the last one built for upload." >&2
    echo "Raise android.versionCode in app.config.ts, or run dev/android.sh bundle --reuse-version-code." >&2
    return 1
  fi

  cd "$ROOT/android"
  ./gradlew bundleRelease \
    -Pandroid.builder.sdkDownload=false \
    --console=plain > "$LOGS/gradle-bundle.log" 2>&1 || {
    echo "the Gradle build failed, see $LOGS/gradle-bundle.log" >&2
    grep -A 6 'What went wrong' "$LOGS/gradle-bundle.log" >&2
    return 1
  }

  mkdir -p "$BUNDLES"
  if [ "$UPLOAD_KEY" = yes ]; then
    output=$BUNDLES/waraq-$version_name-$version_code.aab
  else
    output=$BUNDLES/waraq-$version_name-$version_code-debug-signed.aab
  fi
  cp "$AAB" "$output"
  echo "$output, $(($(wc -c < "$output") / 1000000)) MB"
  "$JAVA_HOME/bin/keytool" -printcert -jarfile "$output" 2> /dev/null | grep -m 1 '^Owner:' | sed 's/^Owner:/signed by/'
  echo
  "$ROOT/dev/release-check.sh" "$output"

  if [ "$UPLOAD_KEY" = no ]; then
    warn_debug_signed
  elif [ "$version_code" -gt "$last_code" ]; then
    echo "$version_code" > "$LAST_VERSION_CODE"
  fi
}

install_bundle() {
  local aab=$1 spec=$DATA/tmp/emulator-device.json apks=$DATA/tmp/emulator.apks
  if [ -z "$aab" ]; then
    aab=$(ls -t "$BUNDLES"/*.aab | head -1)
  fi
  cat > "$spec" << EOF
{
  "supportedAbis": ["$(adb shell getprop ro.product.cpu.abilist | tr -d '\r' | sed 's/,/", "/g')"],
  "supportedLocales": ["en-US"],
  "screenDensity": $(adb shell wm density | sed -nE 's/^Physical density: ([0-9]+).*/\1/p'),
  "sdkVersion": $(adb shell getprop ro.build.version.sdk | tr -d '\r')
}
EOF
  # Google Play signs these APKs with its own key. Here the debug key stands in for it.
  "$ROOT/dev/bundletool.sh" build-apks --bundle="$aab" --output="$apks" --overwrite \
    --device-spec="$spec" --aapt2="$BUILD_TOOLS/aapt2" \
    --ks="$ROOT/android/app/debug.keystore" --ks-pass=pass:android \
    --ks-key-alias=androiddebugkey --key-pass=pass:android > "$LOGS/build-apks.log" 2>&1 || {
    cat "$LOGS/build-apks.log" >&2
    return 1
  }
  rm -rf "$DATA/tmp/emulator-apks"
  unzip -q "$apks" 'splits/*' -d "$DATA/tmp/emulator-apks"
  echo "installing $aab as $(cd "$DATA/tmp/emulator-apks/splits" && ls | tr '\n' ' ')"
  adb install-multiple -r "$DATA"/tmp/emulator-apks/splits/*.apk
}

badging() {
  "$BUILD_TOOLS/aapt2" dump badging "$APK" \
    | grep -E "^(package|sdkVersion|minSdkVersion|targetSdkVersion|uses-permission|application-label):"
}

# A worktree may link .avd to the main checkout's, so the pointer is written with the real path at every boot.
point_to_avd() {
  cat > "$ANDROID_AVD_HOME/$AVD.ini" <<EOF
avd.ini.encoding=UTF-8
path=$(cd "$ANDROID_AVD_HOME" && pwd -P)/$AVD.avd
target=android-35
EOF
}

create_avd() {
  local folder=$ANDROID_AVD_HOME/$AVD.avd
  mkdir -p "$folder"
  cat > "$folder/config.ini" <<EOF
avd.ini.encoding=UTF-8
AvdId=$AVD
avd.ini.displayname=$AVD
abi.type=arm64-v8a
hw.cpu.arch=arm64
hw.cpu.ncore=4
image.sysdir.1=system-images/android-35/google_apis_playstore/arm64-v8a/
tag.id=google_apis_playstore
PlayStore.enabled=yes
hw.lcd.width=1080
hw.lcd.height=2400
hw.lcd.density=420
hw.ramSize=3072
disk.dataPartition.size=6G
hw.keyboard=yes
hw.gpu.enabled=yes
hw.gpu.mode=host
hw.camera.back=virtualscene
hw.camera.front=none
hw.audioInput=no
EOF
}

is_booted() {
  [ "$(adb shell getprop sys.boot_completed 2> /dev/null | tr -d '\r')" = "1" ]
}

boot() {
  if is_booted; then
    echo "$SERIAL is already running"
    return 0
  fi
  if [ ! -f "$ANDROID_AVD_HOME/$AVD.avd/config.ini" ]; then
    create_avd
  fi
  point_to_avd

  [ -f "$POSTER" ] || "$ROOT/dev/fixtures/make-documents.sh" > /dev/null
  adb_server start-server
  emulator -avd "$AVD" -ports "$CONSOLE_PORT,$ADB_DEVICE_PORT" -grpc "$GRPC_PORT" \
    -camera-back virtualscene -virtualscene-poster "wall=$POSTER" \
    -no-window -no-audio -no-boot-anim -no-snapshot -no-metrics -gpu host > "$LOGS/emulator.log" 2>&1 &
  disown

  local attempt
  for attempt in $(seq 1 100); do
    if is_booted; then
      break
    fi
    sleep 3
  done
  is_booted || {
    echo "$SERIAL did not finish booting, see $LOGS/emulator.log" >&2
    adb_server devices | grep "^$SERIAL" >&2 || true
    return 1
  }
  adb shell settings put global window_animation_scale 0
  adb shell settings put global transition_animation_scale 0
  adb shell settings put global animator_duration_scale 0
  adb shell settings put secure immersive_mode_confirmations confirmed
  echo "$SERIAL booted"
}

install() {
  adb install -r "$APK"
}

shot() {
  adb exec-out screencap -p > "$SHOTS/$1.png"
  echo "$SHOTS/$1.png"
}

check() {
  local name=$1 density
  mkdir -p "$DATA/checks"
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null
  adb shell cat /sdcard/ui.xml > "$DATA/checks/$name.xml"
  density=$(adb shell wm density | tr -d '\r' | awk '{ value = $NF } END { print value }')
  echo "$name:"
  (cd "$ROOT" && bun dev/screen-check.ts "$DATA/checks/$name.xml" "$density")
}

TALKBACK=com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService

talkback() {
  case $1 in
    on)
      adb shell settings put secure enabled_accessibility_services "$TALKBACK"
      sleep 8
      ;;
    off)
      adb shell settings delete secure enabled_accessibility_services > /dev/null
      ;;
  esac
}

# Tab moves TalkBack's focus, so a screen can be read without touch gestures. TalkBack writes what
# it says to the log only with its verbose logging on, which is set once by hand in TalkBack's
# settings, under Advanced settings, Developer settings, Log output level.
speak() {
  local name=$1 count=${2:-12} press
  mkdir -p "$DATA/checks"
  adb logcat -c
  for press in $(seq 1 "$count"); do
    adb shell input keyevent KEYCODE_TAB
    sleep 1.5
  done
  # TalkBack says the name first and the name with its role next, so keep the longer line.
  adb logcat -d | sed -nE 's/.*Speaking fragment text="([^"]*)".*/\1/p' | grep -v '^Double-tap to' \
    | awk 'NR > 1 && index($0, previous) != 1 { print previous } { previous = $0 } END { if (NR > 0) print previous }' \
    > "$DATA/checks/$name.speech" || true
  echo "$name:"
  cat "$DATA/checks/$name.speech"
}

node_bounds() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || true
  adb shell cat /sdcard/ui.xml | tr '>' '\n' \
    | sed -nE 's/.* text="([^"]*)".* class="([^"]*)".* content-desc="([^"]*)".* bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1|\2|\3|\4 \5 \6 \7/p' \
    | awk -F'|' -v label="$1" -v class="${2:-}" -v only="${3:-}" \
      '((only != "description" && $1 == label) || $3 == label) && (class == "" || $2 == class) { print $4; exit }'
}

wait_for() {
  local attempt
  for attempt in $(seq 1 "$2"); do
    if [ -n "$(node_bounds "$1")" ]; then
      return 0
    fi
    sleep 1
  done
  echo "gave up waiting for \"$1\"" >&2
  return 1
}

tap() {
  local bounds
  bounds=$(node_bounds "$1" "${2:-}" "${3:-}")
  if [ -z "$bounds" ]; then
    echo "no node labelled \"$1\"" >&2
    return 1
  fi
  set -- $bounds
  adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}

type_into() {
  tap "$1" android.widget.EditText
  adb shell input text "$2"
}

scroll_to_top() {
  local swipe
  for swipe in 1 2 3; do
    adb shell input swipe 540 900 540 1900 300
  done
  sleep 1
}

scroll_to() {
  local swipe
  for swipe in 1 2 3 4 5; do
    if [ -n "$(node_bounds "$1")" ]; then
      return 0
    fi
    adb shell input swipe 540 1700 540 900 400
    sleep 1
  done
  wait_for "$1" 1
}

launch_signed_out() {
  adb shell pm clear "$APP_ID" > /dev/null
  adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
  wait_for "Connect to your server" 30
}

sign_in() {
  local run=$1 password=$2 username=${3:-admin}
  launch_signed_out
  shot "$run-1-address"
  type_into "Server address" "$SIGN_IN_ADDRESS"
  tap "Continue"
  wait_for "Found Paperless-ngx 3.0 or newer at ${SIGN_IN_ADDRESS#http://}" 20
  type_into "Username" "$username"
  type_into "Password" "$password"
  shot "$run-2-credentials"
  tap "Sign in"
}

see_inbox() {
  local run=$1
  sign_in "$run" waraq-dev-password
  wait_for "Search documents" 30
  tap_by_description "Inbox"
  wait_for "Interest income slip" 30
  shot "$run-3-inbox"
  scroll_to "School trip permission letter"
  scroll_to "Electricity bill, September"
  shot "$run-4-inbox-scrolled"
}


tap_by_description() {
  tap "$1" "" description
}

press_back() {
  adb shell input keyevent KEYCODE_BACK
  sleep 1
}

open_september_bill() {
  local run=$1
  tap_by_description "Documents"
  wait_for "Search documents" 20
  wait_for "Electricity bill, August" 20
  shot "$run-5-documents"
  tap "Search documents"
  sleep 1
  adb shell input text hydro
  wait_for "Suggestions" 10
  shot "$run-6-search-typing"
  adb shell input keyevent KEYCODE_ENTER
  wait_for "Best match" 20
  wait_for "Electricity bill, September" 20
  shot "$run-7-search-results"
  tap "Electricity bill, September"
  wait_for "Details" 20
  sleep 2
  shot "$run-8-document"
}

see_document_extras() {
  local run=$1
  tap "More"
  wait_for "Download" 5
  shot "$run-9-document-menu"
  press_back
  scroll_to "Text found in the document"
  shot "$run-10-document-scrolled"
}

edit_title() {
  local run=$1
  tap "Edit"
  wait_for "Edit details" 10
  shot "$run-11-edit"
  tap "Add a tag"
  wait_for "Search" 10
  shot "$run-11-tag-picker"
  tap "Close"
  wait_for "Edit details" 10
  tap "Title" android.widget.EditText
  adb shell input keyevent KEYCODE_MOVE_END
  adb shell input text "%s2026"
  wait_for "Save 1 change" 5
  shot "$run-12-edit-changed"
  discard_then_edit_again "$run"
  tap "Save 1 change"
  wait_for "Electricity bill, September 2026" 20
  shot "$run-13-document-saved"
}

discard_then_edit_again() {
  local run=$1
  tap "Cancel"
  wait_for "Discard your changes?" 5
  shot "$run-12-discard-asked"
  tap "KEEP EDITING"
  wait_for "Save 1 change" 5
  tap "Cancel"
  wait_for "Discard your changes?" 5
  tap "DISCARD"
  wait_for "Details" 10
  shot "$run-12-discarded"
  tap "Edit"
  wait_for "Edit details" 10
  tap "Title" android.widget.EditText
  adb shell input keyevent KEYCODE_MOVE_END
  adb shell input text "%s2026"
  wait_for "Save 1 change" 5
}

done_and_undo() {
  local run=$1
  press_back
  tap_by_description "Inbox"
  scroll_to_top
  wait_for "Done with Interest income slip" 20
  tap "Done with Interest income slip"
  wait_for "Marked done. Inbox tag removed." 5
  shot "$run-14-inbox-done"
  tap "Undo"
  wait_for "Done with Interest income slip" 20
  shot "$run-15-inbox-undone"
}

see_filters() {
  local run=$1
  tap_by_description "Documents"
  wait_for "Filters" 20
  tap "Filters"
  wait_for "Has all" 10
  shot "$run-16-filters"
  press_back
}

restore_seed_data() {
  python3 - "http://localhost:8010" << 'EOF'
import base64, json, sys, urllib.parse, urllib.request

server = sys.argv[1]
auth = base64.b64encode(b'admin:waraq-dev-password').decode()

def call(method, path, body=None):
    request = urllib.request.Request(
        f'{server}/api/{path}',
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization': f'Basic {auth}', 'Accept': 'application/json; version=10', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read() or 'null')

def documents(title_start):
    query = urllib.parse.urlencode({'title__istartswith': title_start, 'fields': 'id,title,tags'})
    return call('GET', f'documents/?{query}')['results']

for document in documents('Electricity bill, September'):
    call('PATCH', f"documents/{document['id']}/", {'title': 'Electricity bill, September'})

inbox = [tag['id'] for tag in call('GET', 'tags/?page_size=1000')['results'] if tag['is_inbox_tag']]
for document in documents('Interest income slip'):
    missing = [tag for tag in inbox if tag not in document['tags']]
    if missing:
        call('PATCH', f"documents/{document['id']}/", {'tags': document['tags'] + missing})

tags = {tag['name']: tag['id'] for tag in call('GET', 'tags/?page_size=1000')['results']}
views = {view['name'] for view in call('GET', 'saved_views/')['results']}
for name in ['Bills', 'School', 'Tax']:
    if name not in views and name in tags:
        call('POST', 'saved_views/', {
            'name': name, 'sort_field': 'created', 'sort_reverse': True,
            'filter_rules': [{'rule_type': 6, 'value': str(tags[name])}],
        })
EOF
}

reset_display() {
  adb shell cmd uimode night no > /dev/null
  adb shell settings put system font_scale 1.0
}

key_screens() {
  local run=$1
  see_inbox "$run"
  open_september_bill "$run"
  tap "Edit"
  wait_for "Edit details" 10
  shot "$run-11-edit"
  tap "Cancel"
  wait_for "Details" 10
  see_document_extras "$run"
  tap "Back"
  see_filters "$run"
}

flow() {
  trap reset_display EXIT
  reset_display
  restore_seed_data

  see_inbox light
  open_september_bill light
  edit_title light
  see_document_extras light
  done_and_undo light
  see_filters light
  restore_seed_data

  sign_in wrong-password not-the-password
  wait_for "Here is how far the connection got." 20
  wait_for "The username or password is wrong." 1
  shot wrong-password-3-checklist

  # Paperless-ngx allows five sign-in requests a minute from one address, and each run makes two.
  sleep 61
  adb shell cmd uimode night yes > /dev/null
  key_screens dark
  reset_display

  adb shell settings put system font_scale 1.3
  key_screens large-text
  echo "flow passed, screenshots in $SHOTS"
}

screen_contains() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || true
  adb shell cat /sdcard/ui.xml | grep -q -F "$1"
}

hide_keyboard() {
  if adb shell dumpsys input_method | grep -q 'mInputShown=true'; then
    press_back
  fi
}

wait_for_containing() {
  local attempt
  for attempt in $(seq 1 "$2"); do
    if screen_contains "$1"; then
      return 0
    fi
    sleep 1
  done
  echo "gave up waiting for a node containing \"$1\"" >&2
  return 1
}

settings_cleanup() {
  python3 - "http://localhost:8010" << 'EOF'
import base64, json, sys, urllib.request

server = sys.argv[1]
auth = base64.b64encode(b'admin:waraq-dev-password').decode()

def call(method, path, body=None):
    request = urllib.request.Request(
        f'{server}/api/{path}',
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization': f'Basic {auth}', 'Accept': 'application/json; version=10', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read() or 'null')

made = {'tags': ['Flow tag', 'Flow tag renamed'], 'custom_fields': ['Flow field']}
for kind, names in made.items():
    for item in call('GET', f'{kind}/?page_size=1000')['results']:
        if item['name'] in names:
            call('DELETE', f"{kind}/{item['id']}/")
for user in call('GET', 'users/?page_size=1000')['results']:
    if user['username'] == 'flow-viewer':
        call('DELETE', f"users/{user['id']}/")
EOF
}

make_viewer() {
  curl -sf -u admin:waraq-dev-password -H 'Accept: application/json; version=10' -H 'Content-Type: application/json' \
    -X POST http://localhost:8010/api/users/ \
    -d '{"username":"flow-viewer","password":"flow-viewer-password","user_permissions":["view_uisettings","view_document","view_tag","view_note","add_note"]}' \
    > /dev/null
}

open_settings() {
  tap_by_description "Account and settings"
  wait_for "Appearance" 10
}

settings_screens() {
  local run=$1
  open_settings
  shot "settings-$run-1"
  scroll_to "About"
  shot "settings-$run-2-scrolled"
  scroll_to_top
  tap "Tags"
  wait_for "New tag" 20
  shot "settings-$run-3-tags"
  tap_by_description "New tag"
  wait_for "Inbox tag" 5
  sleep 2
  shot "settings-$run-4-new-tag"
  hide_keyboard
  tap "Cancel" 2> /dev/null || true
  sleep 1
  tap_by_description "Back"
  wait_for "Appearance" 10
  scroll_to "What your account can do"
  tap "What your account can do"
  wait_for "Documents" 20
  shot "settings-$run-5-permissions"
  press_back
  scroll_to "Send a crash report"
  tap "Send a crash report"
  wait_for "Crash report" 10
  shot "settings-$run-6-crash-log"
  press_back
  press_back
}

edit_labels() {
  local run=$1
  tap "Tags"
  wait_for "New tag" 20
  tap_by_description "New tag"
  wait_for "Inbox tag" 5
  sleep 2
  type_into "Name" "Flow%stag"
  sleep 1
  hide_keyboard
  tap_by_description "Red"
  tap "Inbox tag" android.widget.Switch
  shot "settings-$run-labels-1-new-tag"
  tap "Create"
  wait_for "Flow tag" 20
  shot "settings-$run-labels-2-tag-made"
  tap "Flow tag"
  wait_for "Edit Flow tag" 5
  tap "Name" android.widget.EditText
  adb shell input keyevent KEYCODE_MOVE_END
  adb shell input text "%srenamed"
  sleep 1
  hide_keyboard
  tap "Save"
  wait_for "Flow tag renamed" 20
  shot "settings-$run-labels-3-tag-renamed"
  tap "Flow tag renamed"
  wait_for "Edit Flow tag renamed" 5
  tap_by_description "Delete"
  wait_for "Delete the tag Flow tag renamed?" 5
  shot "settings-$run-labels-4-delete-tag"
  tap "DELETE"
  sleep 3
  if [ -n "$(node_bounds "Flow tag renamed")" ]; then
    echo "the tag is still in the list" >&2
    return 1
  fi
  press_back

  scroll_to "Custom fields"
  tap "Custom fields"
  wait_for "New custom field" 20
  tap_by_description "New custom field"
  wait_for "Choice from a list" 5
  sleep 2
  type_into "Name" "Flow%sfield"
  sleep 1
  hide_keyboard
  tap "Choice from a list"
  wait_for "Choice 1" 5
  type_into "Choice 1" Card
  sleep 1
  hide_keyboard
  type_into "Choice 2" Cash
  sleep 1
  hide_keyboard
  shot "settings-$run-labels-5-new-field"
  tap "Create"
  wait_for "Flow field" 20
  shot "settings-$run-labels-6-field-made"
  tap "Flow field"
  wait_for "Card, Cash" 5
  shot "settings-$run-labels-7-field"
  tap_by_description "Delete"
  wait_for "Delete the custom field Flow field?" 5
  tap "DELETE"
  sleep 3
  if [ -n "$(node_bounds "Flow field")" ]; then
    echo "the custom field is still in the list" >&2
    return 1
  fi
  press_back
}

test_crash() {
  local run=$1
  adb shell am start -a android.intent.action.VIEW -d "waraq://settings/crash-test" "$APP_ID" > /dev/null
  wait_for "Something went wrong" 20
  shot "settings-$run-crash-1-screen"
  press_back
  wait_for "Appearance" 10
  scroll_to "Send a crash report"
  tap "Send a crash report"
  wait_for_containing "Test crash from the settings flow" 10
  wait_for_containing "Test rejection from the settings flow" 10
  shot "settings-$run-crash-2-log"
  tap "Send the report"
  sleep 3
  shot "settings-$run-crash-3-share-sheet"
  press_back
  wait_for "Crash report" 10
  press_back
  press_back
}

settings() {
  if ! unzip -p "$APK" assets/app.config | grep -q '"crashTestScreen":true'; then
    echo "The APK has no crash test screen. Build it with: WARAQ_CRASH_TEST=1 dev/android.sh build" >&2
    return 1
  fi
  trap 'reset_display; settings_cleanup' EXIT
  reset_display
  settings_cleanup
  make_viewer

  sign_in settings-light waraq-dev-password
  wait_for "Inbox" 30
  open_settings
  shot settings-light-settings-1
  tap "Dark"
  sleep 2
  shot settings-light-settings-2-dark-chosen
  tap "Light"
  sleep 1
  tap "System"
  sleep 1
  edit_labels light
  scroll_to "What your account can do"
  tap "What your account can do"
  wait_for "Documents" 20
  shot settings-light-permissions-admin
  scroll_to "Groups"
  shot settings-light-permissions-admin-scrolled
  press_back
  test_crash light

  adb shell cmd uimode night yes > /dev/null
  sleep 2
  settings_screens dark
  reset_display
  sleep 2
  adb shell settings put system font_scale 1.3
  sleep 2
  settings_screens large-text
  reset_display
  sleep 2

  open_settings
  tap "Sign out"
  wait_for "Sign out?" 5
  shot settings-light-sign-out
  tap "SIGN OUT"
  wait_for "Connect to your server" 20

  # Paperless-ngx allows five sign-in requests a minute from one address, and each sign-in makes two.
  sleep 61
  sign_in settings-viewer flow-viewer-password flow-viewer
  wait_for "Inbox" 30
  open_settings
  shot settings-viewer-settings
  tap "What your account can do"
  wait_for "Documents" 20
  shot settings-viewer-permissions
  echo "settings flow passed, screenshots in $SHOTS"
}

# The scanner's camera follows the emulator's physical model: a position in metres and a rotation
# in degrees. The poster hangs on the wall of the virtual room near x -0.8, z 5.3.
set_physical_model() {
  "$GRPCURL" -plaintext -import-path "$ANDROID_HOME/emulator/lib" -proto emulator_controller.proto \
    -d "{\"target\":\"$1\",\"value\":{\"data\":[$2,$3,$4]}}" \
    "localhost:$GRPC_PORT" android.emulation.control.EmulatorController/setPhysicalModel > /dev/null
}

face_poster() {
  set_physical_model POSITION -1.6 0.3 3.4
  set_physical_model ROTATION 0 210 0
}

face_blank_wall() {
  set_physical_model POSITION 0 0 0
  set_physical_model ROTATION 0 135 0
}

# Google's scanner opens in auto capture and takes a page as soon as it sees one,
# so it opens on a blank wall and takes each page by hand. Its labels have changed
# between Play services releases, so each button is tried under both names.
capture_pages() {
  local run=$1 count=$2 page
  wait_for "Capture" 240
  sleep 2
  shot "$run-scanner"
  tap "Manual" || true
  for page in $(seq 1 "$count"); do
    if [ "$page" -gt 1 ]; then
      face_blank_wall
      tap "Add page." || tap "Add page. Button."
      wait_for "Capture" 30
      tap "Manual" || true
    fi
    face_poster
    sleep 3
    tap "Capture"
    wait_for "Page $page of $page. Selected." 30
  done
  shot "$run-scanner-pages"
  tap "Next" || tap "Done"
}

scan_batch() {
  local run=$1
  face_blank_wall
  tap "Scan"
  capture_pages "$run-1" 2
  wait_for "Document 1" 30
  sleep 1
  shot "$run-2-batch-one"

  face_blank_wall
  tap "Scan the next document"
  capture_pages "$run-3" 1
  wait_for "Document 2" 30
  sleep 1
  shot "$run-4-batch-two"

  tap "Edit pages of document 1"
  wait_for "Page 2" 10
  sleep 1
  shot "$run-5-editor"
  tap "Menu for page 2"
  wait_for "Rotate" 5
  shot "$run-6-page-menu"
  tap "Rotate"
  sleep 1
  shot "$run-7-rotated"
  tap "Split into two documents after page 1"
  sleep 1
  shot "$run-8-split"
  tap "Done"
  wait_for "Document 3" 10
  sleep 1
  shot "$run-9-batch-three"

  tap "Review and upload 3 documents"
  wait_for "For every document" 10
  shot "$run-10-details"
  tap "Tags, Your server chooses"
  wait_for "Bills" 10
  tap "Bills"
  tap "Done"
  wait_for "Upload 3 documents" 10
  sleep 1
  shot "$run-11-details-tagged"
  scroll_to "Document 3"
  shot "$run-12-details-documents"
}

scan_key_screens() {
  local run=$1
  adb shell am force-stop "$APP_ID"
  adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
  wait_for "Scan" 30
  tap "Scan"
  wait_for "Continue your batch?" 10
  shot "$run-1-continue"
  tap "CONTINUE"
  wait_for "Document 3" 10
  sleep 1
  shot "$run-2-batch"
  tap "Edit pages of document 2"
  wait_for "Page 1" 10
  sleep 1
  shot "$run-3-editor"
  press_back
  tap "Review and upload 3 documents"
  wait_for "For every document" 10
  sleep 1
  shot "$run-4-details"
  scroll_to "Document 3"
  shot "$run-5-details-documents"
  press_back
  press_back
}

share_pdf() {
  local run=$1
  local name=hydro-bill-august.pdf media_id
  adb push "$ROOT/dev/fixtures/pdf/$name" "/sdcard/Download/$name" > /dev/null
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/$name" > /dev/null
  media_id=$(adb shell content query --uri content://media/external/file --projection _id \
    --where "\"_display_name='$name'\"" | sed -nE 's/.*_id=([0-9]+).*/\1/p' | head -1)
  # am grants read access only to the intent's data, so the PDF goes in both the data and the stream.
  adb shell am start -a android.intent.action.SEND -t application/pdf \
    -d "content://media/external/file/$media_id" --eu android.intent.extra.STREAM "content://media/external/file/$media_id" \
    --grant-read-uri-permission -n "$APP_ID/.MainActivity" > /dev/null
  wait_for "Document 4" 20
  sleep 1
  shot "$run-1-shared-pdf"
}

scan() {
  trap reset_display EXIT
  reset_display
  adb shell pm clear "$APP_ID" > /dev/null
  see_inbox scan-signin
  scan_batch scan-light
  press_back
  press_back

  adb shell cmd uimode night yes > /dev/null
  scan_key_screens scan-dark
  reset_display

  adb shell settings put system font_scale 1.3
  scan_key_screens scan-large-text
  reset_display

  share_pdf share
  echo "scan flow passed, screenshots in $SHOTS"
}


# Documents the upload flow sends keep the app's default title, which the seed data never uses,
# so the server can be asked for them by title and they can be removed again.
UPLOAD_TITLE="Scanned document"
DEV_SERVER=http://localhost:8010
# The emulator's network shaping leaves traffic to the host alone, so the upload flow signs in through
# dev/slow-proxy.py on this port, which reads any upload body over 8 KB at 1 KB a second. A scanned page
# makes a PDF of about 25 KB, so each send runs for about half a minute.
PROXY_PORT=8012
PROXY_PID=""

# Prints one line per document the flow uploaded: the id, a tab, and the original file name.
uploaded_documents() {
  python3 - "$DEV_SERVER" "$UPLOAD_TITLE" << 'EOF'
import base64, json, sys, urllib.parse, urllib.request

server, title = sys.argv[1], sys.argv[2]
auth = base64.b64encode(b'admin:waraq-dev-password').decode()
query = urllib.parse.urlencode({'title__iexact': title, 'fields': 'id,original_file_name', 'page_size': 100})
request = urllib.request.Request(
    f'{server}/api/documents/?{query}',
    headers={'Authorization': f'Basic {auth}', 'Accept': 'application/json; version=10'},
)
with urllib.request.urlopen(request) as response:
    for document in json.loads(response.read())['results']:
        print(f"{document['id']}\t{document['original_file_name']}")
EOF
}

# Fails unless the server holds exactly $1 uploaded documents, each under a different <job id>.pdf.
expect_uploaded() {
  local expected=$1 listing names
  listing=$(uploaded_documents)
  names=$(printf '%s\n' "$listing" | cut -f2 | sort)
  echo "uploaded documents on the server:"
  printf '%s\n' "$listing"
  [ "$(printf '%s\n' "$names" | grep -cE '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$')" = "$expected" ] || {
    echo "expected $expected documents named <job id>.pdf" >&2
    return 1
  }
  [ "$(printf '%s\n' "$names" | uniq -d | wc -l)" -eq 0 ] || {
    echo "a document arrived more than once" >&2
    return 1
  }
}

wait_for_uploaded() {
  local expected=$1 seconds=$2 attempt
  for attempt in $(seq 1 "$seconds"); do
    if [ "$(uploaded_documents | wc -l)" -ge "$expected" ]; then
      return 0
    fi
    sleep 1
  done
  echo "the server did not get $expected documents within $seconds seconds" >&2
  return 1
}

delete_uploaded() {
  local id
  for id in $(uploaded_documents | cut -f1); do
    curl -sf -u admin:waraq-dev-password -X DELETE -H 'Accept: application/json; version=10' \
      "$DEV_SERVER/api/documents/$id/" > /dev/null
    echo "deleted document $id from the dev server"
  done
}

count_nodes() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || true
  adb shell cat /sdcard/ui.xml | tr '>' '\n' | grep -c "text=\"$1\"" || true
}

wait_for_count() {
  local label=$1 expected=$2 seconds=$3 attempt
  for attempt in $(seq 1 "$seconds"); do
    if [ "$(count_nodes "$label")" -ge "$expected" ]; then
      return 0
    fi
    sleep 2
  done
  echo "gave up waiting for $expected rows saying \"$label\"" >&2
  return 1
}

scan_document() {
  local run=$1 pages=$2 button=$3
  face_blank_wall
  tap "$button"
  capture_pages "$run" "$pages"
}

reset_network() {
  adb shell cmd connectivity airplane-mode disable > /dev/null || true
}

start_proxy() {
  python3 "$ROOT/dev/slow-proxy.py" "$PROXY_PORT" 8010 1000 8000 > "$LOGS/slow-proxy.log" 2>&1 &
  PROXY_PID=$!
  sleep 1
}

stop_proxy() {
  if [ -n "$PROXY_PID" ]; then
    kill "$PROXY_PID" 2> /dev/null || true
  fi
}

# The tab's description carries the count of unfinished uploads, which changes as jobs move,
# so the label is read from the screen just before the tap, and the tap is tried again if it moved.
open_uploads_tab() {
  local attempt label
  for attempt in 1 2 3 4 5; do
    adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || true
    label=$(adb shell cat /sdcard/ui.xml | tr '>' '\n' | sed -nE 's/.*content-desc="(Uploads[^"]*)".*/\1/p' | head -1)
    if tap_by_description "${label:-Uploads}" 2> /dev/null; then
      wait_for "Uploads" 10
      return 0
    fi
    sleep 1
  done
  echo "could not open the Uploads tab" >&2
  return 1
}

upload_batch() {
  local run=$1
  scan_document "$run-1" 2 "Scan"
  wait_for "Document 1" 30
  scan_document "$run-2" 1 "Scan the next document"
  wait_for "Document 2" 30
  scan_document "$run-3" 1 "Scan the next document"
  wait_for "Document 3" 30
  sleep 1
  shot "$run-4-batch"
  tap "Review and upload 3 documents"
  wait_for "For every document" 10
  tap "Tags, Your server chooses"
  wait_for "Bills" 10
  tap "Bills"
  tap "Done"
  wait_for "Upload 3 documents" 10
  sleep 1
  shot "$run-5-details"
  tap "Upload 3 documents"
  wait_for "3 documents added to Uploads" 10
  shot "$run-6-added"
  open_uploads_tab
  sleep 1
  shot "$run-7-uploads-queued"
  wait_for_count "Done" 3 300
  sleep 1
  shot "$run-8-uploads-done"
  expect_uploaded 3
}

# Kills the app while the proxy is still reading the send, and starts it again.
crash_mid_send() {
  local run=$1
  scan_document "$run-1" 1 "Scan"
  wait_for "Document 1" 30
  tap "Review and upload"
  wait_for "Upload 1 document" 10
  tap "Upload 1 document"
  open_uploads_tab
  wait_for "Sending" 60
  sleep 2
  shot "$run-2-sending"
  adb shell am force-stop "$APP_ID"
  adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
  wait_for "Scan" 30
  open_uploads_tab
  wait_for "Checking whether your server got it" 30
  sleep 1
  shot "$run-3-checking"
  wait_for_count "Done" 4 400
  sleep 1
  shot "$run-4-done-after-crash"
  expect_uploaded 4
}

# Queues a document with no network, kills the app, brings the network back, and runs the WorkManager
# job by hand, so the upload happens with no screen of the app open. Android drops a force-stopped
# app's scheduled jobs by design, so the app goes to the background and its process is killed instead.
background_send() {
  local run=$1 job
  adb shell cmd connectivity airplane-mode enable > /dev/null
  sleep 3
  scan_document "$run-1" 1 "Scan"
  wait_for "Document 1" 30
  tap "Review and upload"
  wait_for "Upload 1 document" 10
  tap "Upload 1 document"
  open_uploads_tab
  wait_for "Waiting for a connection" 30
  sleep 1
  shot "$run-2-waiting-offline"

  adb shell cmd uimode night yes > /dev/null
  sleep 2
  shot "$run-3-uploads-dark"
  reset_display
  # A font scale change restarts the activity on the Documents tab.
  adb shell settings put system font_scale 1.3
  wait_for "Scan" 30
  open_uploads_tab
  sleep 1
  shot "$run-4-uploads-large-text"
  reset_display
  wait_for "Scan" 30

  adb shell input keyevent KEYCODE_HOME
  sleep 2
  adb shell am kill "$APP_ID"
  sleep 2
  [ -z "$(adb shell pidof "$APP_ID")" ] || {
    echo "the app's process is still alive" >&2
    return 1
  }
  adb shell cmd connectivity airplane-mode disable > /dev/null
  sleep 5
  # The first forced run only starts the process. WorkManager then puts its jobs back and drops the
  # one that was running, so the jobs are run once more with the process alive.
  for attempt in 1 2; do
    for job in $(adb shell dumpsys jobscheduler | tr -d '\r' \
        | sed -nE "s#.*JOB \#u0a[0-9]+/([0-9]+): [0-9a-f]+ $APP_ID/androidx.work.impl.background.systemjob.SystemJobService.*#\1#p" | sort -u); do
      echo "running WorkManager job $job, run $attempt"
      adb shell cmd jobscheduler run -f "$APP_ID" "$job"
    done
    sleep 8
  done
  wait_for_uploaded 5 300
  adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | grep -q "$APP_ID" && {
    echo "the app opened a screen while the background task ran" >&2
    return 1
  }
  echo "the background task sent the document with no screen open"
  expect_uploaded 5
}

upload() {
  trap 'reset_display; reset_network; stop_proxy' EXIT
  reset_display
  reset_network
  start_proxy
  SIGN_IN_ADDRESS=http://10.0.2.2:$PROXY_PORT
  adb shell pm clear "$APP_ID" > /dev/null
  delete_uploaded
  see_inbox upload-signin
  upload_batch upload-light
  crash_mid_send upload-crash
  background_send upload-background
  delete_uploaded
  echo "upload flow passed, screenshots in $SHOTS, the dev server holds its seeded data again"
}

# The fields flow makes these on the dev server and deletes them again at the end. Each custom field
# is named "Flow " and its type, so the flow can find what it made.
FLOW_VIEW="Flow view"
FLOW_NOTE="Flow note"

fields_server() {
  python3 - "$DEV_SERVER" "$1" "$FLOW_VIEW" "$FLOW_NOTE" << 'EOF'
import base64, json, sys, urllib.parse, urllib.request

server, action, view_name, note_text = sys.argv[1:5]
auth = base64.b64encode(b'admin:waraq-dev-password').decode()

def call(method, path, body=None):
    request = urllib.request.Request(
        f'{server}/api/{path}',
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization': f'Basic {auth}', 'Accept': 'application/json; version=10', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read() or 'null')

types = {
    'string': {}, 'url': {}, 'date': {}, 'boolean': {}, 'integer': {}, 'float': {},
    'monetary': {'default_currency': 'CAD'}, 'documentlink': {},
    'select': {'select_options': [{'label': 'Chequing'}, {'label': 'Savings'}]}, 'longtext': {},
}
fields = [field for field in call('GET', 'custom_fields/?page_size=1000')['results'] if field['name'].startswith('Flow ')]

if action == 'create':
    names = {field['name'] for field in fields}
    for data_type, extra in types.items():
        if f'Flow {data_type}' not in names:
            call('POST', 'custom_fields/', {'name': f'Flow {data_type}', 'data_type': data_type, 'extra_data': extra})
elif action == 'show':
    query = urllib.parse.urlencode({'title__iexact': 'Electricity bill, September', 'fields': 'id,custom_fields'})
    document = call('GET', f'documents/?{query}')['results'][0]
    names = {field['id']: field['name'] for field in fields}
    for entry in document['custom_fields']:
        print(f"{names.get(entry['field'], entry['field'])}: {json.dumps(entry['value'])}")
elif action == 'delete':
    for field in fields:
        call('DELETE', f"custom_fields/{field['id']}/")
    for view in call('GET', 'saved_views/?page_size=1000')['results']:
        if view['name'] == view_name:
            call('DELETE', f"saved_views/{view['id']}/")
    for document in call('GET', 'documents/?page_size=1000&fields=id,notes')['results']:
        for note in document['notes']:
            if note['note'] == note_text:
                call('DELETE', f"documents/{document['id']}/notes/?id={note['id']}")
EOF
}

scroll_to_end() {
  local swipe
  for swipe in 1 2 3; do
    adb shell input swipe 540 1900 540 500 300
  done
  sleep 1
}

hide_keyboard() {
  if adb shell dumpsys input_method | grep -q "mInputShown=true"; then
    adb shell input keyevent KEYCODE_BACK
    sleep 1
  fi
}

add_custom_field() {
  local name=$1
  hide_keyboard
  scroll_to_end
  tap "Add a custom field"
  wait_for "$name" 10
  tap "$name"
  sleep 1
}

set_every_field() {
  local run=$1
  tap "Edit"
  wait_for "Edit details" 10
  add_custom_field "Flow string"
  type_into "Flow string" "Account%s4471"
  add_custom_field "Flow url"
  type_into "Flow url" "https://example.com/bill"
  add_custom_field "Flow integer"
  type_into "Flow integer" "-42"
  add_custom_field "Flow float"
  type_into "Flow float" "3.25"
  add_custom_field "Flow longtext"
  type_into "Flow longtext" "Paid%sby%scheque"
  add_custom_field "Flow monetary"
  type_into "Amount" "83.6"
  add_custom_field "Flow boolean"
  tap "Flow boolean" android.widget.Switch
  add_custom_field "Flow date"
  tap "Flow date, None"
  wait_for "OK" 10
  tap "OK"
  sleep 1
  add_custom_field "Flow select"
  tap "Flow select, None"
  wait_for "Savings" 10
  tap "Savings"
  sleep 1
  add_custom_field "Flow documentlink"
  scroll_to "Link a document to Flow documentlink"
  tap "Link a document to Flow documentlink"
  wait_for "Link documents" 10
  type_into "Search" "interest"
  wait_for "Interest income slip" 20
  tap "Interest income slip"
  tap "Done"
  sleep 2
  hide_keyboard
  shot "$run-1-edit-fields"
  scroll_to_top
  shot "$run-2-edit-fields-top"
  wait_for "Save 10 changes" 5
  tap "Save 10 changes"
  wait_for "Details" 20
  sleep 2
  scroll_to "Flow string"
  shot "$run-3-document-fields"
  fields_server show
  tap "Edit"
  wait_for "Edit details" 10
  scroll_to "Flow documentlink"
  shot "$run-4-edit-reopened"
  tap "Cancel"
  wait_for "Details" 10
}

see_permissions_and_note() {
  local run=$1
  scroll_to "Permissions"
  scroll_to "Add a note"
  shot "$run-5-permissions"
  type_into "Add a note" "$(echo "$FLOW_NOTE" | sed 's/ /%s/g')"
  hide_keyboard
  tap "Add a note" android.widget.Button
  wait_for "$FLOW_NOTE" 20
  sleep 1
  shot "$run-6-note-added"
  wait_for "Delete note" 10
  tap "Delete note"
  wait_for "Delete this note?" 10
  shot "$run-7-note-confirm"
  tap "DELETE NOTE"
  sleep 3
  shot "$run-8-note-deleted"
}

save_view() {
  local run=$1
  tap "Back"
  wait_for "Search documents, hydro" 20
  tap "Filters"
  wait_for "Save as view" 10
  shot "$run-9-filters"
  tap "Save as view"
  wait_for "Name" 10
  adb shell input text "$(echo "$FLOW_VIEW" | sed 's/ /%s/g')"
  shot "$run-10-save-view"
  tap "Save"
  wait_for "Saved the view $FLOW_VIEW." 20
  sleep 1
  shot "$run-11-view-chip"
}

batch_fields() {
  local run=$1
  local name=hydro-bill-august.pdf media_id
  adb push "$ROOT/dev/fixtures/pdf/$name" "/sdcard/Download/$name" > /dev/null
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/$name" > /dev/null
  media_id=$(adb shell content query --uri content://media/external/file --projection _id \
    --where "\"_display_name='$name'\"" | sed -nE 's/.*_id=([0-9]+).*/\1/p' | head -1)
  adb shell am start -a android.intent.action.SEND -t application/pdf \
    -d "content://media/external/file/$media_id" --eu android.intent.extra.STREAM "content://media/external/file/$media_id" \
    --grant-read-uri-permission -n "$APP_ID/.MainActivity" > /dev/null
  wait_for "Review and upload" 20
  tap "Review and upload"
  wait_for "For every document" 10
  tap "Add a custom field"
  wait_for "Flow select" 10
  tap "Flow select"
  wait_for "Set" 10
  tap "Flow select, None"
  wait_for "Chequing" 10
  tap "Chequing"
  sleep 1
  shot "$run-12-batch-sheet"
  tap "Set"
  sleep 1
  scroll_to_end
  shot "$run-13-batch-from-batch"
  tap "Flow select, Chequing, From the batch"
  wait_for "Set" 10
  tap "Flow select, Chequing"
  wait_for "Savings" 10
  tap "Savings"
  sleep 1
  tap "Set"
  sleep 1
  shot "$run-14-batch-only-this"
  press_back
  wait_for "Discard batch" 10
  tap "Discard batch"
  wait_for "Discard this batch?" 10
  tap "DISCARD"
  sleep 1
}

fields_screens() {
  local run=$1
  adb shell am force-stop "$APP_ID"
  adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
  wait_for "Search documents" 30
  open_september_bill "$run"
  scroll_to "Flow string"
  shot "$run-3-document-fields"
  scroll_to_end
  shot "$run-5-permissions"
  scroll_to_top
  tap "Edit"
  wait_for "Edit details" 10
  scroll_to "Flow monetary"
  shot "$run-1-edit-fields"
  tap "Cancel"
  wait_for "Details" 10
  tap "Back"
  tap "Filters"
  wait_for "Save as view" 10
  shot "$run-9-filters"
  press_back
}

fields() {
  trap 'reset_display; fields_server delete' EXIT
  reset_display
  restore_seed_data
  fields_server delete
  fields_server create
  see_inbox fields-signin
  open_september_bill fields-light
  set_every_field fields-light
  see_permissions_and_note fields-light
  save_view fields-light
  batch_fields fields-light

  adb shell cmd uimode night yes > /dev/null
  fields_screens fields-dark
  reset_display

  adb shell settings put system font_scale 1.3
  fields_screens fields-large-text
  reset_display
  echo "fields flow passed, screenshots in $SHOTS"
}

pdf_check() {
  cd "$ROOT/android"
  ./gradlew :scanner:assembleDebugAndroidTest \
    -Pandroid.builder.sdkDownload=false \
    --console=plain > "$LOGS/pdf-check-build.log" 2>&1 || {
    echo "the test build failed, see $LOGS/pdf-check-build.log" >&2
    grep -A 6 'What went wrong' "$LOGS/pdf-check-build.log" >&2
    return 1
  }
  adb install -r "$ROOT/modules/scanner/android/build/outputs/apk/androidTest/debug/scanner-debug-androidTest.apk" > /dev/null
  adb logcat -c
  local result
  result=$(adb shell am instrument -w dev.mhakmi.scanner.test/androidx.test.runner.AndroidJUnitRunner | tr -d '\r')
  echo "$result"
  adb logcat -d -s PdfWriterTest:I | grep PdfWriterTest || true
  adb exec-out run-as dev.mhakmi.scanner.test cat files/pdf-check/ten-pages.pdf > "$DATA/ten-pages.pdf"
  swift "$ROOT/dev/pdf-pages.swift" "$DATA/ten-pages.pdf"
  echo "$result" | grep -q '^OK '
}

share_image() {
  local file=$1 name media_id
  name=$(basename "$file")
  adb push "$file" "/sdcard/Download/$name" > /dev/null
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/$name" > /dev/null
  sleep 1
  media_id=$(adb shell content query --uri content://media/external/file --projection _id \
    --where "\"_display_name='$name'\"" | sed -nE 's/.*_id=([0-9]+).*/\1/p' | head -1)
  adb shell am start -a android.intent.action.SEND -t image/jpeg \
    -d "content://media/external/file/$media_id" --eu android.intent.extra.STREAM "content://media/external/file/$media_id" \
    --grant-read-uri-permission -n "$APP_ID/.MainActivity" > /dev/null
}

frame_stats() {
  adb shell dumpsys gfxinfo "$APP_ID" | tr -d '\r' \
    | grep -m 6 -E '^(Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile):'
}

# Resets the frame counters, runs the rest of the arguments, and prints the frame times they drew.
measure_frames() {
  local name=$1
  shift
  adb shell dumpsys gfxinfo "$APP_ID" reset > /dev/null
  "$@"
  sleep 2
  echo "== $name"
  frame_stats
}

scroll_down_and_up() {
  local swipe
  for swipe in 1 2 3 4; do
    adb shell input swipe 540 1700 540 700 300
  done
  for swipe in 1 2 3 4; do
    adb shell input swipe 540 700 540 1700 300
  done
}

type_title() {
  tap "Title" android.widget.EditText
  sleep 1
  adb shell input text "abcdefghijklmnopqrstuvwxyz"
}

# Moves the only page of document 2 to the end of document 1, which holds $1 pages so far.
move_into_first() {
  local pages=$1 label
  label=$([ "$pages" = 1 ] && echo "1 page" || echo "$pages pages")
  tap "Edit pages of document 2"
  wait_for "Menu for page 1" 10
  tap "Menu for page 1"
  wait_for "Move to another document" 5
  tap "Move to another document"
  wait_for "Document 1 · $label" 5
  tap "Document 1 · $label"
  wait_for "Review and upload $(( 17 - pages )) documents" 10
}

# Shares 17 pictures of A4 at 300 dpi, each becoming a document, and moves 5 of them into
# document 1, for a batch of 12 documents with one of 6 pages. Then it measures frame times
# on the batch screens while scrolling and while typing a title.
batch_perf() {
  local run=${1:-batch-perf} page=$DATA/perf-page.jpg number out
  trap 'reset_display; adb shell rm -f "/sdcard/Download/page-*.jpg"' EXIT
  reset_display
  mkdir -p "$DATA/perf"
  out=$DATA/perf/$run.txt
  sips -z 3508 2480 -s format jpeg -s formatOptions 85 "$POSTER" --out "$page" > /dev/null
  adb shell pm clear "$APP_ID" > /dev/null
  see_inbox "$run-signin"
  {
    # Frame times on the emulator follow the load on the Mac, so the run notes it, and the inbox gives a list to compare with.
    echo "Mac load averages: $(sysctl -n vm.loadavg)"
    measure_frames "inbox, scrolling, for comparison" scroll_down_and_up
  } | tee "$out"
  for number in $(seq 1 17); do
    cp "$page" "$DATA/perf/page-$number.jpg"
    share_image "$DATA/perf/page-$number.jpg"
    if [ "$number" = 1 ]; then
      wait_for "Review and upload" 20
    else
      wait_for "Review and upload $number documents" 20
    fi
  done
  scroll_to_top
  for number in $(seq 1 5); do
    move_into_first "$number"
  done
  wait_for "Review and upload 12 documents" 10
  sleep 2
  shot "$run-batch"
  {
    echo "Mac load averages: $(sysctl -n vm.loadavg)"
    measure_frames "batch screen, scrolling" scroll_down_and_up
    scroll_to_top
    tap "Edit pages of document 1"
    wait_for "6 pages" 10
    sleep 1
    measure_frames "page editor, scrolling" scroll_down_and_up
    tap "Done"
    wait_for "Document 1" 10
    tap "Review and upload 12 documents"
    wait_for "For every document" 10
    sleep 2
    measure_frames "batch details, scrolling" scroll_down_and_up
    scroll_to_top
    measure_frames "batch details, typing 26 letters into a title" type_title
  } | tee -a "$out"
  shot "$run-details-typed"
  adb shell rm -f "/sdcard/Download/page-*.jpg"
  echo "frame times in $out"
}

logs() {
  adb logcat -d -v time | grep -E "ReactNativeJS|AndroidRuntime|$APP_ID" || true
}

stop() {
  adb emu kill || true
  adb_server kill-server || true
}

case "${1:-}" in
  build | badging | claim | release)
    "$1"
    ;;
  bundle)
    bundle "${2:-}"
    ;;
  install-bundle)
    require_claim
    install_bundle "${2:-}"
    ;;
  boot | install | flow | scan | upload | settings | fields | logs | stop)
    require_claim
    "$1"
    ;;
  batch-perf)
    require_claim
    batch_perf "${2:-}"
    ;;
  pdf-check)
    require_claim
    pdf_check
    ;;
  adb)
    require_claim
    shift
    adb_server "$@"
    ;;
  fn)
    require_claim
    shift
    "$@"
    ;;
  shot)
    require_claim
    shot "${2:?usage: $0 shot <name>}"
    ;;
  check)
    require_claim
    check "${2:?usage: $0 check <name>}"
    ;;
  speak)
    require_claim
    speak "${2:?usage: $0 speak <name> [count]}" "${3:-12}"
    ;;
  talkback)
    require_claim
    talkback "${2:?usage: $0 talkback on|off}"
    ;;
  *)
    sed -n 's/^#   //p' "$0"
    exit 1
    ;;
esac
