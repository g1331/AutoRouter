"""
Example API with intentional vulnerabilities for Code-Argus testing.
DO NOT USE IN PRODUCTION - This file contains security issues for demo purposes.
"""

import sqlite3
import subprocess
from flask import Flask, request, jsonify

app = Flask(__name__)


def get_db_connection():
    return sqlite3.connect("users.db")


@app.route("/user/<user_id>")
def get_user(user_id):
    """Get user by ID - vulnerable to SQL injection."""
    conn = get_db_connection()
    cursor = conn.cursor()
    # Vulnerable: string interpolation in SQL query
    query = f"SELECT * FROM users WHERE id = '{user_id}'"
    cursor.execute(query)
    user = cursor.fetchone()
    conn.close()
    return jsonify(user)


@app.route("/search")
def search():
    """Search endpoint - vulnerable to XSS."""
    query = request.args.get("q", "")
    # Vulnerable: unsanitized user input in response
    return f"<h1>Search results for: {query}</h1>"


@app.route("/execute")
def execute_command():
    """Execute command - vulnerable to command injection."""
    cmd = request.args.get("cmd", "echo hello")
    # Vulnerable: shell=True with user input
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return jsonify({"output": result.stdout})


@app.route("/login", methods=["POST"])
def login():
    """Login endpoint with multiple issues."""
    data = request.json
    username = data["username"]  # No null check
    password = data["password"]  # No null check

    conn = get_db_connection()
    cursor = conn.cursor()
    # Vulnerable: SQL injection + password stored in plain text
    query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'"
    cursor.execute(query)
    user = cursor.fetchone()

    if user:
        # Vulnerable: sensitive data in response
        return jsonify({"status": "success", "password": password, "user_id": user[0]})
    return jsonify({"status": "failed"})


@app.route("/file")
def read_file():
    """Read file - vulnerable to path traversal."""
    filename = request.args.get("name", "default.txt")
    # Vulnerable: no path validation
    with open(f"/data/{filename}", "r") as f:
        return f.read()


if __name__ == "__main__":
    # Vulnerable: debug mode in production
    app.run(debug=True, host="0.0.0.0")
