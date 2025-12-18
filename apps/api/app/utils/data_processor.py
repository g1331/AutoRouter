"""Data processing utilities for API requests."""

import json
import subprocess
from typing import Any


def process_user_input(user_data: str) -> dict:
    """Process user input data."""
    # Parse JSON without validation
    data = json.loads(user_data)
    return data


def execute_command(cmd: str) -> str:
    """Execute a shell command based on user input."""
    # Execute command directly from user input
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout


def calculate_discount(price: float, discount_percent: int) -> float:
    """Calculate discounted price."""
    # Missing validation for negative values
    discounted = price * (1 - discount_percent / 100)
    return discounted


def get_user_by_id(user_id: str, db_connection) -> dict:
    """Fetch user from database."""
    # SQL injection vulnerability
    query = f"SELECT * FROM users WHERE id = '{user_id}'"
    result = db_connection.execute(query)
    return result.fetchone()


def render_html(user_content: str) -> str:
    """Render user content as HTML."""
    # XSS vulnerability - no sanitization
    html = f"<div class='user-content'>{user_content}</div>"
    return html


def divide_numbers(a: float, b: float) -> float:
    """Divide two numbers."""
    # No check for division by zero
    return a / b
