from flask import Flask, jsonify, request
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from flask_cors import CORS
import datetime

app = Flask(__name__)
CORS(app)

SHEET_ID = "1JV35-XM1kWRGk182jbbMQn3CLZQ5F8tw2ZfRB7rr09U"

def get_sheet(sheet_name="Subreddits"):
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name("credentials.json", scope)
    client = gspread.authorize(creds)
    return client.open_by_key(SHEET_ID).worksheet(sheet_name)

@app.route("/api/subreddits")
def fetch_subreddits():
    sheet = get_sheet()
    rows = sheet.get_all_values()
    headers = rows[0]
    data = [dict(zip(headers, row)) for row in rows[1:] if any(row)]

    nsfw_filter = request.args.get("nsfw")
    oc_required_filter = request.args.get("oc_required")

    if nsfw_filter:
        data = [d for d in data if d.get("NSFW", "").strip() == nsfw_filter.strip()]
    if oc_required_filter:
        data = [d for d in data if d.get("OC Requirement", "").strip() == oc_required_filter.strip()]

    try:
        data.sort(key=lambda x: float(x.get("Posts/Day", "0")), reverse=True)
    except ValueError:
        pass

    return jsonify(data)

@app.route("/api/subreddit-growth")
def get_growth():
    sheet = get_sheet("Subreddit Growth History")
    rows = sheet.get_all_values()
    headers = rows[0]
    data = [dict(zip(headers, row)) for row in rows[1:] if any(row)]
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
