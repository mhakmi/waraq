#!/bin/bash
# Takes the phone screenshots for the Google Play listing, against the dev server's sample documents.
#
#   dev/android.sh claim
#   dev/android.sh boot
#   dev/android.sh install-bundle
#   dev/play-screenshots.sh
#   dev/android.sh release
#
# The screenshots go to docs/play/screenshots/. The script uploads two scanned documents and makes
# three custom fields on the dev server, and deletes them again before it ends.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$ROOT/docs/play/screenshots
SHOTS=$ROOT/.dev-data/shots
SERVER=http://localhost:8010
mkdir -p "$OUT"

run() {
  "$ROOT/dev/android.sh" fn "$@"
}

save() {
  run shot "play-$1" > /dev/null
  # Play takes screenshots only as JPEG or as PNG without an alpha channel.
  ffmpeg -loglevel error -y -i "$SHOTS/play-$1.png" -pix_fmt rgb24 "$OUT/$1.png"
  echo "$OUT/$1.png"
}

status_bar() {
  run adb shell am broadcast -a com.android.systemui.demo -e command "$@" > /dev/null
}

clean_status_bar() {
  run adb shell settings put global sysui_demo_allowed 1
  status_bar enter
  status_bar clock -e hhmm 1200
  status_bar battery -e level 100 -e plugged false
  status_bar network -e wifi show -e level 4 -e fully true
  status_bar network -e mobile hide
  status_bar notifications -e visible false
}

fields() {
  python3 - "$SERVER" "$1" << 'EOF'
import base64, json, sys, urllib.request

server, action = sys.argv[1:3]
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

wanted = {
    'Account number': ('string', {}),
    'Total': ('monetary', {'default_currency': 'CAD'}),
    'Paid': ('boolean', {}),
}
existing = {field['name']: field for field in call('GET', 'custom_fields/?page_size=1000')['results']}
for name, (data_type, extra) in wanted.items():
    if action == 'create' and name not in existing:
        call('POST', 'custom_fields/', {'name': name, 'data_type': data_type, 'extra_data': extra})
    if action == 'delete' and name in existing:
        call('DELETE', f"custom_fields/{existing[name]['id']}/")
EOF
}

finish() {
  status_bar exit || true
  run reset_display || true
  fields delete || true
  run delete_uploaded || true
}
trap finish EXIT

documents_by_title() {
  run tap_by_description "Documents"
  run wait_for "Newest first" 30
  run tap "Newest first"
  run wait_for "Title, A to Z" 10
  run tap "Title, A to Z"
  run wait_for "Auto insurance policy summary" 30
  sleep 2
}

# A busy Mac makes the emulator drop typed keys, so each field is read back before Sign in.
type_checked() {
  local field=$1 text=$2 attempt
  for attempt in 1 2 3; do
    run tap "$field" android.widget.EditText || true
    run adb shell input keyevent KEYCODE_MOVE_END
    run adb shell input keyevent $(printf 'KEYCODE_DEL %.0s' $(seq 1 30))
    run adb shell input text "$text"
    sleep 2
    if run screen_contains "text=\"$text\""; then
      return 0
    fi
  done
  echo "could not type \"$text\" into $field" >&2
  return 1
}

clean_status_bar
run reset_display
fields create

run launch_signed_out
type_checked "Server address" "http://10.0.2.2:8010"
run tap "Continue"
run wait_for "Found Paperless-ngx 3.0 or newer at 10.0.2.2:8010" 60
run tap "Show password"
type_checked "Username" admin
type_checked "Password" waraq-dev-password
run tap "Sign in"
run wait_for "Search documents" 60
# Sorted by title, the list opens on the sample documents and not on test leftovers on the dev server.
documents_by_title
save 01-documents

run tap "Electricity bill, September"
run wait_for "Details" 20
sleep 2
save 02-document

run tap "Edit"
run wait_for "Edit details" 10
run add_custom_field "Account number"
run type_into "Account number" "4471-2208"
run add_custom_field "Total"
run type_into "Amount" "83.60"
run add_custom_field "Paid"
run tap "Paid" android.widget.Switch
run hide_keyboard
sleep 1
save 03-edit-custom-fields
# In 0.3.1, Discard on the edit page asks again instead of leaving, so the app is restarted.
# The changes were never saved, so the server keeps the document as it was.
run adb shell am force-stop dev.mhakmi.waraq
run adb shell monkey -p dev.mhakmi.waraq -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
run wait_for "Search documents" 60

run scan_document play-1 2 "Scan"
run wait_for "Document 1" 30
run scan_document play-2 1 "Scan the next document"
run wait_for "Document 2" 30
sleep 1
save 04-batch

run tap "Review and upload 2 documents"
run wait_for "For every document" 10
run tap "Tags, Your server chooses"
run wait_for "Bills" 10
run tap "Bills"
run tap "Done"
run wait_for "Upload 2 documents" 10
sleep 1
save 05-batch-details

run tap "Upload 2 documents"
run wait_for "2 documents added to Uploads" 10
run open_uploads_tab
run wait_for_count "Done" 2 300
sleep 1
save 06-uploads

run open_settings
sleep 1
save 07-settings

run press_back
run adb shell cmd uimode night yes
documents_by_title
save 08-documents-dark
