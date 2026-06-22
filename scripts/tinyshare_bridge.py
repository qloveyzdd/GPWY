import json
import re
import sys


TOKEN_PATTERN = re.compile(r"(token|authorization|cookie)\s*[:=]\s*[^,\s\"'}]+", re.I)
SECRET_PATTERN = re.compile(r"\b[A-Za-z0-9_-]{24,}\b")


def safe_text(value):
    text = str(value)
    text = TOKEN_PATTERN.sub(r"\1=[redacted]", text)
    text = SECRET_PATTERN.sub("[redacted]", text)
    return text[:200]


def classify_error(value):
    text = str(value).lower()
    if "token" in text or "\u65e0\u6548" in text or "invalid" in text:
        return "invalid_token"
    if "\u6743\u9650" in text or "permission" in text or "\u79ef\u5206" in text:
        return "permission_denied"
    if "\u9891" in text or "\u989d\u5ea6" in text or "limit" in text or "rate" in text:
        return "rate_limited"
    if "empty" in text or "no data" in text:
        return "empty_data"
    if "network" in text or "timeout" in text or "connection" in text:
        return "network_or_service"
    return "unknown"


def dataframe_to_table(df, requested_fields):
    columns = [str(column) for column in df.columns]
    selected = [field for field in requested_fields if field in columns]
    if selected:
        df = df[selected]
        columns = selected

    records = json.loads(
        df.where(df.notna(), None).to_json(orient="records", force_ascii=False),
    )
    items = [[record.get(column) for column in columns] for record in records]

    return {"fields": columns, "items": items}


def main():
    try:
        request = json.loads(sys.stdin.read())
        token = request["token"]
        api_name = request["api_name"]
        params = request.get("params") or {}
        fields = request.get("fields") or []

        import tinyshare as ts

        ts.set_token(token)
        pro = ts.pro_api()

        if not hasattr(pro, api_name):
            raise AttributeError(f"unsupported api_name: {api_name}")

        df = getattr(pro, api_name)(**params)

        print(
            json.dumps(
                {"ok": True, "data": dataframe_to_table(df, fields)},
                ensure_ascii=False,
            ),
        )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "category": classify_error(exc),
                    "error_type": type(exc).__name__,
                    "message": safe_text(exc),
                },
                ensure_ascii=False,
            ),
        )


if __name__ == "__main__":
    main()
