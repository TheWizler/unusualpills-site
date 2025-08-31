from flask import Flask, render_template, request, redirect, url_for, flash
import sqlite3
from datetime import datetime

app = Flask(__name__)
app.secret_key = "dev-secret"
DB_PATH = "unusualpills.db"

def init_db():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        first_name TEXT,
        last_name TEXT,
        address1 TEXT,
        address2 TEXT,
        city TEXT,
        state TEXT,
        postal_code TEXT,
        country TEXT,
        phone TEXT,
        marketing_consent INTEGER NOT NULL DEFAULT 0,
        consent_timestamp TEXT,
        consent_ip TEXT,
        created_at TEXT NOT NULL
    );
    """)
    con.commit()
    con.close()

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/claw")
def claw():
    return render_template("claw.html")

@app.route("/merch")
def merch():
    return render_template("merch.html")

# --- new routes for free shirt signup ---
@app.get("/free-shirt")
def free_shirt_get():
    return render_template("signup.html")

@app.post("/free-shirt")
def free_shirt_post():
    f = request.form
    # Require consent
    if f.get("marketing_consent") != "on":
        flash("Please tick the email updates box to continue.", "error")
        return redirect(url_for("free_shirt_get"))

    required = ["email","first_name","last_name","address1","city","state","postal_code"]
    if any(not f.get(k,"").strip() for k in required):
        flash("Please fill all required fields.", "error")
        return redirect(url_for("free_shirt_get"))

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    ip = request.headers.get("X-Forwarded-For", request.remote_addr) or ""
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    try:
        cur.execute("""INSERT INTO users
            (email,first_name,last_name,address1,address2,city,state,postal_code,country,phone,
             marketing_consent,consent_timestamp,consent_ip,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f["email"].strip().lower(), f["first_name"], f["last_name"],
             f["address1"], f.get("address2",""), f["city"], f["state"], f["postal_code"],
             f.get("country","USA"), f.get("phone",""),
             1, now, ip, now))
    except sqlite3.IntegrityError:
        cur.execute("""UPDATE users SET first_name=?,last_name=?,address1=?,address2=?,city=?,state=?,postal_code=?,country=?,phone=?,
            marketing_consent=1,consent_timestamp=?,consent_ip=? WHERE email=?""",
            (f["first_name"], f["last_name"], f["address1"], f.get("address2",""), f["city"], f["state"], f["postal_code"],
             f.get("country","USA"), f.get("phone",""), now, ip, f["email"].strip().lower()))
    con.commit(); con.close()

    return redirect(url_for("thanks"))

@app.get("/thanks")
def thanks():
    return render_template("thanks.html")

if __name__ == "__main__":
    init_db()
    app.run(debug=True)
