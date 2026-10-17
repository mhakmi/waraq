#!/bin/bash
# Builds Waraq for Android and runs it on a headless emulator of its own.
#
#   dev/android.sh build         generate android/ and build the release APK for arm64-v8a
#   dev/android.sh badging       print the APK's package, versions, SDK levels, and permissions
#   dev/android.sh boot          boot the waraq_pixel emulator headless, creating it if missing
#   dev/android.sh install       install the APK on the emulator
#   dev/android.sh shot <name>   save a screenshot as .dev-data/shots/<name>.png
#   dev/android.sh logs          print the app's log lines
#   dev/android.sh adb <args>    run adb against this project's own adb server
#   dev/android.sh stop          stop this emulator and its adb server, and nothing else
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

build() {
  cd "$ROOT"
  bun install > "$LOGS/bun-install.log" 2>&1
  CI=1 bunx expo prebuild --platform android --clean --no-install > "$LOGS/prebuild.log" 2>&1
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

badging() {
  "$BUILD_TOOLS/aapt2" dump badging "$APK" \
    | grep -E "^(package|sdkVersion|minSdkVersion|targetSdkVersion|uses-permission|application-label):"
}

create_avd() {
  local folder=$ANDROID_AVD_HOME/$AVD.avd
  mkdir -p "$folder"
  cat > "$ANDROID_AVD_HOME/$AVD.ini" <<EOF
avd.ini.encoding=UTF-8
path=$folder
target=android-35
EOF
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
hw.camera.back=none
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

  adb_server start-server
  emulator -avd "$AVD" -ports "$CONSOLE_PORT,$ADB_DEVICE_PORT" -grpc "$GRPC_PORT" \
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
  echo "$SERIAL booted"
}

install() {
  adb install -r "$APK"
}

shot() {
  adb exec-out screencap -p > "$SHOTS/$1.png"
  echo "$SHOTS/$1.png"
}

logs() {
  adb logcat -d -v time | grep -E "ReactNativeJS|AndroidRuntime|$APP_ID" || true
}

stop() {
  adb emu kill || true
  adb_server kill-server || true
}

case "${1:-}" in
  build | badging | boot | install | logs | stop)
    "$1"
    ;;
  adb)
    shift
    adb_server "$@"
    ;;
  shot)
    shot "${2:?usage: $0 shot <name>}"
    ;;
  *)
    sed -n 's/^#   //p' "$0"
    exit 1
    ;;
esac
