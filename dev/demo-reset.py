"""Puts the public demo server back to its seeded state.

A nightly Coolify scheduled task runs it inside the demo's Paperless-ngx container, signed in as the
admin from the container's own environment. It lives at /usr/src/paperless/data/demo-reset.py, in the
data volume, because Coolify drops file mounts added to this service and caps a task command at about
255 characters. To install a new version, post the file as a note on any demo document, then run once:
    cd /usr/src/paperless/src && python3 manage.py shell -c "from documents.models import Note;
    n=Note.objects.get(id=<note id>);open('/usr/src/paperless/data/demo-reset.py','w').write(n.note);n.delete()"
The demo account cannot delete anything, so the seeded documents and labels are still there and
are only restored. Everything else that the account added is deleted.
"""

import base64
import json
import os
import urllib.parse
import urllib.request

SERVER = "http://localhost:8000"
DEMO_OWNER = 3
NO_SHARING = {"view": {"users": [], "groups": []}, "change": {"users": [], "groups": []}}

TAGS = {
    1: {"name": "Inbox", "is_inbox_tag": True, "color": "#1f6feb"},
    2: {"name": "Bills"},
    3: {"name": "Home"},
    4: {"name": "Health"},
    5: {"name": "Insurance"},
    6: {"name": "School"},
    7: {"name": "Tax"},
    8: {"name": "Warranty"},
}
CORRESPONDENTS = {
    1: "Northfield Hydro",
    2: "Maple Court Rentals",
    3: "Brightside Dental Clinic",
    4: "Harbourline Insurance",
    5: "Orbit Electronics",
    6: "Cedar Park Elementary",
    7: "Lakeshore Savings",
}
DOCUMENT_TYPES = {1: "Bill", 2: "Letter", 3: "Receipt", 4: "Policy", 5: "Certificate", 6: "Tax slip"}
DOCUMENTS = {
    1: {"title": "Electricity bill, August", "correspondent": 1, "document_type": 1, "tags": [1, 2, 3], "created": "2026-10-31"},
    2: {"title": "Electricity bill, September", "correspondent": 1, "document_type": 1, "tags": [1, 2, 3], "created": "2026-10-31"},
    3: {"title": "Lease renewal notice", "correspondent": 2, "document_type": 2, "tags": [1, 3], "created": "2026-02-07"},
    4: {"title": "Dental cleaning receipt", "correspondent": 3, "document_type": 3, "tags": [1, 4], "created": "2026-10-31"},
    5: {"title": "Auto insurance policy summary", "correspondent": 4, "document_type": 4, "tags": [1, 5], "created": "2026-01-05"},
    6: {"title": "Laptop warranty certificate", "correspondent": 5, "document_type": 5, "tags": [1, 8], "created": "2026-10-31"},
    7: {"title": "School trip permission letter", "correspondent": 6, "document_type": 2, "tags": [1, 6], "created": "2026-08-09"},
    8: {"title": "Interest income slip", "correspondent": 7, "document_type": 6, "tags": [1, 7], "created": "2026-10-31"},
}

credentials = f"{os.environ['PAPERLESS_ADMIN_USER']}:{os.environ['PAPERLESS_ADMIN_PASSWORD']}"
headers = {
    "Authorization": "Basic " + base64.b64encode(credentials.encode()).decode(),
    "Accept": "application/json; version=9",
    "Content-Type": "application/json",
    # Paperless-ngx accepts only the host names it is served under.
    "Host": urllib.parse.urlparse(os.environ["PAPERLESS_URL"]).hostname,
}


def call(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(SERVER + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read()
    return json.loads(text) if text else None


def all_ids(endpoint):
    ids = []
    path = f"/api/{endpoint}/?page_size=100&fields=id"
    while path:
        page = call("GET", path)
        ids += [item["id"] for item in page["results"]]
        path = page["next"] and page["next"][page["next"].index("/api/"):]
    return ids


extra_documents = [id for id in all_ids("documents") if id not in DOCUMENTS]
if extra_documents:
    call("POST", "/api/documents/bulk_edit/", {"documents": extra_documents, "method": "delete", "parameters": {}})
trashed = [item["id"] for item in call("GET", "/api/trash/?page_size=100")["results"]]
if trashed:
    call("POST", "/api/trash/", {"documents": trashed, "action": "empty"})

for id, fields in DOCUMENTS.items():
    call("PATCH", f"/api/documents/{id}/", {**fields, "storage_path": None, "custom_fields": [], "owner": DEMO_OWNER, "set_permissions": NO_SHARING})
    for note in call("GET", f"/api/documents/{id}/notes/"):
        call("DELETE", f"/api/documents/{id}/notes/?id={note['id']}")

for endpoint, seeded in (("tags", TAGS), ("correspondents", CORRESPONDENTS), ("document_types", DOCUMENT_TYPES)):
    for id in all_ids(endpoint):
        if id not in seeded:
            call("DELETE", f"/api/{endpoint}/{id}/")
    for id, fields in seeded.items():
        call("PATCH", f"/api/{endpoint}/{id}/", fields if isinstance(fields, dict) else {"name": fields})

for endpoint in ("storage_paths", "custom_fields", "saved_views"):
    for id in all_ids(endpoint):
        call("DELETE", f"/api/{endpoint}/{id}/")

print(f"Demo reset: removed {len(extra_documents)} added documents, restored {len(DOCUMENTS)} seeded documents.")
