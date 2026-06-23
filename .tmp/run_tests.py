import json, os, sys, subprocess

BASE = "http://localhost:8089/api"
TOK_DIR = r"D:\tmp_tok"
TMP = r"D:\pycharmProjects\xhsmedium_github\.tmp"

def load_tok(name):
    with open(os.path.join(TOK_DIR, name + ".tok"), "r", encoding="utf-8") as f:
        return f.read().strip()

def curl(method, path, token, body=None, extra_headers=None, capture_headers=False):
    out_body = os.path.join(TMP, "body.json")
    out_headers = os.path.join(TMP, "headers.txt")
    for p in (out_body, out_headers):
        if os.path.exists(p): os.remove(p)
    args = ["curl", "-s", "-X", method, BASE + path, "-H", "Authorization: Bearer " + token]
    if capture_headers:
        args += ["-D", out_headers]
    if body is not None:
        args += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    if extra_headers:
        for h in extra_headers:
            args += ["-H", h]
    args += ["-o", out_body, "-w", "%{http_code}"]
    code = subprocess.check_output(args, shell=False).decode().strip()
    body_text = open(out_body, "r", encoding="utf-8").read() if os.path.exists(out_body) else ""
    try:
        parsed = json.loads(body_text) if body_text else None
    except Exception:
        parsed = body_text
    headers_text = open(out_headers, "r", encoding="utf-8").read() if capture_headers and os.path.exists(out_headers) else ""
    return code, parsed, headers_text

def summarize(name, code, body, headers=""):
    print("=" * 60)
    print(name)
    print("HTTP", code)
    if isinstance(body, dict):
        keys = list(body.keys())
        print("type: dict, keys count:", len(keys))
        print("keys:", keys[:20])
        for k in ("unreadCount", "unread_count", "total", "items", "ok", "orderId"):
            if k in body:
                v = body[k]
                if isinstance(v, (dict, list)):
                    print(f"  {k}: <{type(v).__name__} len={len(v)}>")
                else:
                    print(f"  {k}: {v}")
    elif isinstance(body, list):
        print("type: list, len:", len(body))
        if body and isinstance(body[0], dict):
            print("first item keys:", list(body[0].keys())[:15])
    else:
        print("raw:", str(body)[:200])
    if headers:
        for line in headers.splitlines():
            if line.lower().startswith(("x-cache", "cache-control")):
                print("  HDR:", line)

youlun   = load_tok("youlun")
sales01  = load_tok("sales01")
academic = load_tok("academic01")

tests = [
    ("1. GET /api/dashboard/summary",        "GET",  "/dashboard/summary",        youlun,   None, False),
    ("2a. GET /api/leads?scope=self",        "GET",  "/leads?scope=self",         sales01,  None, False),
    ("2b. GET /api/leads?scope=all",         "GET",  "/leads?scope=all",          youlun,   None, False),
    ("2c. GET /api/orders?scope=academic",   "GET",  "/orders?scope=academic",    academic, None, False),
    ("2d. GET /api/orders?scope=all",        "GET",  "/orders?scope=all",         youlun,   None, False),
    ("2e. GET /api/collaboration",           "GET",  "/collaboration",            youlun,   None, False),
    ("2f. GET /api/notifications?limit=10",  "GET",  "/notifications?limit=10",   youlun,   None, False),
    ("2g. GET /api/exports",                 "GET",  "/exports",                  youlun,   None, False),
    ("2h. GET /api/rankings/learning-posts", "GET",  "/rankings/learning-posts?days=7", youlun, None, False),
]
for name, m, p, t, b, h in tests:
    code, body, headers = curl(m, p, t, b, capture_headers=h)
    summarize(name, code, body, headers)

# 2i + 2nd call to test cache
name = "2i. GET /api/analytics/snapshots?days=7 (1st)"
code, body, headers = curl("GET", "/analytics/snapshots?days=7", youlun, capture_headers=True)
summarize(name, code, body, headers)

name = "2i'. GET /api/analytics/snapshots?days=7 (2nd, expect HIT)"
code, body, headers = curl("GET", "/analytics/snapshots?days=7", youlun, capture_headers=True)
summarize(name, code, body, headers)
