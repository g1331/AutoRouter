import fs from "node:fs";

function createRetryBody(message) {
  return `## Code-Argus Review\n\n${message}\n\nComment \`code-argus review\` to retry.`;
}

function parseReviewOutput(output) {
  try {
    return JSON.parse(output.trim());
  } catch {
    const jsonMatch = output.match(/\{[\s\S]*"summary"[\s\S]*"comments"[\s\S]*\}(?=[^}]*$)/);
    if (!jsonMatch) {
      throw new Error("No JSON object found");
    }
    return JSON.parse(jsonMatch[0]);
  }
}

function buildSummarySection(summary) {
  if (!summary) {
    return "";
  }

  let section = "<details open>\n<summary>🤖 <strong>Code-Argus PR Summary</strong></summary>\n\n";

  if (summary.pr_summary) {
    section += `**Summary**: ${summary.pr_summary}\n\n`;
  }

  if (Array.isArray(summary.changes) && summary.changes.length > 0) {
    section += "**Changes**:\n";
    for (const change of summary.changes) {
      section += `- ${change}\n`;
    }
    section += "\n";
  }

  if (summary.technical_notes && summary.technical_notes.trim() !== "") {
    section += `**Technical Notes**: ${summary.technical_notes}\n\n`;
  }

  section += "🤖 Was this summary useful? React with 👍 or 👎\n";
  section += "</details>\n\n---\n\n";
  return section;
}

function buildReviewComments(review) {
  const severityEmoji = { high: "🔴", medium: "🟡", low: "🟢" };
  const reviewComments = [];

  if (!Array.isArray(review.comments)) {
    return reviewComments;
  }

  for (const comment of review.comments) {
    const emoji = severityEmoji[comment.severity] || "🟡";
    let body = `## ${emoji} [${comment.severity.toUpperCase()}] ${comment.title}\n\n`;
    body += `${comment.description}\n\n`;

    if (comment.suggestion) {
      body += "```suggestion\n";
      body += comment.suggestion;
      if (!comment.suggestion.endsWith("\n")) {
        body += "\n";
      }
      body += "```\n";
    }

    const lineEnd = comment.line_end || comment.line_start;
    const reviewComment = {
      path: comment.file,
      line: lineEnd,
      side: "RIGHT",
      body,
    };

    if (comment.line_start && comment.line_end && comment.line_start !== comment.line_end) {
      reviewComment.start_line = comment.line_start;
      reviewComment.start_side = "RIGHT";
    }

    reviewComments.push(reviewComment);
  }

  return reviewComments;
}

function buildSummaryBody(review) {
  const summary = review.summary || {
    total_issues: 0,
    high: 0,
    medium: 0,
    low: 0,
    focus_areas: [],
  };

  let body = buildSummarySection(review.summary);
  body += "## Code-Argus Review\n\n";

  if (summary.total_issues === 0) {
    body += "✅ Review completed. **No significant issues found.**\n\n";
    body += "The changes look good from a correctness, security, and architecture perspective.\n";
  } else {
    body += `Review completed. **${summary.total_issues}** issue(s) found.\n\n`;
    body += "| Severity | Count |\n";
    body += "|----------|-------|\n";
    if (summary.high > 0) {
      body += `| 🔴 High | ${summary.high} |\n`;
    }
    if (summary.medium > 0) {
      body += `| 🟡 Medium | ${summary.medium} |\n`;
    }
    if (summary.low > 0) {
      body += `| 🟢 Low | ${summary.low} |\n`;
    }

    if (Array.isArray(summary.focus_areas) && summary.focus_areas.length > 0) {
      body += `\n**Focus areas**: ${summary.focus_areas.join(", ")}\n`;
    }

    body += "\n---\n";
    body += "💡 **Tip**: Comment the following to trigger auto-fix:\n";
    body += "```\n@autorouter-bot 请根据上方 Code-Argus review 反馈修复代码问题\n```\n";
  }

  body += "\n---\n";
  body += "Comment `code-argus review` to re-trigger review.";
  return body;
}

async function postIssueComment(github, context, issueNumber, body) {
  await github.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issueNumber,
    body,
  });
}

export default async function postReview({ github, context }) {
  const prNumber = Number.parseInt(process.env.PR_NUMBER ?? "", 10);
  const headSha = process.env.HEAD_SHA ?? "";
  const reviewResult = process.env.REVIEW_RESULT ?? "";

  if (!prNumber || Number.isNaN(prNumber)) {
    console.log("Invalid PR number");
    return;
  }

  if (reviewResult !== "success") {
    await postIssueComment(
      github,
      context,
      prNumber,
      createRetryBody(
        `❌ Review failed. Please check the [workflow logs](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}) for details.`
      )
    );
    return;
  }

  let output;
  try {
    output = fs.readFileSync("/tmp/review-results/review_output.json", "utf8");
  } catch {
    await postIssueComment(
      github,
      context,
      prNumber,
      createRetryBody("❌ No output received from review service.")
    );
    return;
  }

  if (!output || output.trim() === "") {
    await postIssueComment(
      github,
      context,
      prNumber,
      createRetryBody("❌ Empty output from review service.")
    );
    return;
  }

  let review;
  try {
    review = parseReviewOutput(output);
  } catch {
    await postIssueComment(
      github,
      context,
      prNumber,
      createRetryBody("❌ Failed to parse review output.")
    );
    return;
  }

  const reviewComments = buildReviewComments(review);
  const summaryBody = buildSummaryBody(review);

  let reviewCreated = false;

  try {
    await github.rest.pulls.createReview({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
      commit_id: headSha,
      event: "COMMENT",
      body: summaryBody,
      comments: reviewComments.length > 0 ? reviewComments : undefined,
    });
    reviewCreated = true;
  } catch (error) {
    console.log(`Failed to create review with inline comments: ${error.message}`);
  }

  if (!reviewCreated) {
    try {
      await github.rest.pulls.createReview({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: prNumber,
        commit_id: headSha,
        event: "COMMENT",
        body: summaryBody,
      });
      reviewCreated = true;
    } catch (error) {
      console.log(`Failed to create summary review: ${error.message}`);
    }

    if (reviewComments.length > 0) {
      for (const comment of reviewComments) {
        try {
          await github.rest.pulls.createReviewComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: prNumber,
            commit_id: headSha,
            path: comment.path,
            line: comment.line,
            side: comment.side,
            start_line: comment.start_line,
            start_side: comment.start_side,
            body: comment.body,
          });
        } catch (error) {
          console.log(
            `Failed to post comment on ${comment.path}:${comment.line}: ${error.message}`
          );
        }
      }
    }

    if (!reviewCreated) {
      await postIssueComment(github, context, prNumber, summaryBody);
    }
  }

  console.log("Review published successfully");
}
