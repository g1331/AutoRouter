from pathlib import Path
import os


def read_text(path: str) -> str:
    file_path = Path(path)
    if not file_path.exists():
        return ""
    return file_path.read_text(encoding="utf-8")


template = Path(".github/code-argus/review-prompt-template.md").read_text(encoding="utf-8")
replacements = {
    "{{MAX_COMMENTS}}": os.environ.get("MAX_COMMENTS", "10"),
    "{{MIN_SEVERITY}}": os.environ.get("MIN_SEVERITY", "low"),
    "{{LANGUAGE}}": os.environ.get("LANGUAGE", "auto"),
    "{{PR_TITLE}}": read_text("/tmp/pr_title.txt").rstrip("\n"),
    "{{PR_BODY}}": read_text("/tmp/pr_body.txt").rstrip("\n"),
    "{{PR_DIFF}}": read_text("/tmp/pr_diff.txt").rstrip("\n"),
}

result = template
for placeholder, value in replacements.items():
    result = result.replace(placeholder, value)

output_path = Path(".github/codex/prompts/review.md")
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(result + "\n", encoding="utf-8")
