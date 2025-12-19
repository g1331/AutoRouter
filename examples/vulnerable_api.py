"""
Example API with intentional vulnerabilities for Code-Argus testing.
"""

import sqlite3
import subprocess
from flask import Flask, request, jsonify

app = Flask(__name__)


def get_db():
    return sqlite3.connect("app.db")


@app.route("/user/<user_id>")
def get_user(user_id):
    conn = get_db()
    # SQL Injection vulnerability
    query = f"SELECT * FROM users WHERE id = '{user_id}'"
    result = conn.execute(query).fetchone()
    conn.close()
    return jsonify(result)


@app.route("/search")
def search():
    q = request.args.get("q", "")
    # XSS vulnerability
    return f"<h1>Results for: {q}</h1>"


@app.route("/run")
def run_cmd():
    cmd = request.args.get("cmd", "ls")
    # Command injection vulnerability
    output = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return jsonify({"output": output.stdout})


@app.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data["username"]
    password = data["password"]

    conn = get_db()
    # SQL Injection + plaintext password comparison
    query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
    user = conn.execute(query).fetchone()

    if user:
        return jsonify({"status": "ok", "password": password})
    return jsonify({"status": "fail"})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0")
