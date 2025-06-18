import gspread
from oauth2client.service_account import ServiceAccountCredentials
import datetime

SHEET_ID = "1JV35-XM1kWRGk182jbbMQn3CLZQ5F8tw2ZfRB7rr09U"

def get_sheet(sheet_name):
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name("credentials.json", scope)
    client = gspread.authorize(creds)
    return client.open_by_key(SHEET_ID).worksheet(sheet_name)

def run_tracker():
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    main_sheet = get_sheet("Subreddits")
    growth_sheet = get_sheet("Subreddit Growth History")

    rows = main_sheet.get_all_values()
    headers = rows[0]
    data = [dict(zip(headers, row)) for row in rows[1:] if any(row)]

    for row in data:
        growth_sheet.append_row([
            now,
            row.get("Subreddit", ""),
            row.get("Subscribers", ""),
            row.get("Posts/Day", ""),
            row.get("Active Users", "")
        ])

if __name__ == "__main__":
    run_tracker()
