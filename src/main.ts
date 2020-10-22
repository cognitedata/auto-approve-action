import * as core from '@actions/core';
import * as github from '@actions/github';

const ALLOWED_NAMES = ['dependabot[bot]', 'dependabot-preview[bot]'].reduce(
  (acc, name) => ({ ...acc, [name]: true }),
  {}
);

async function remove_dependabot_approvals(client: any, pr: any) {
  try {
    // Get list of all reviews
    const { data: listReviews } = await client.pulls.listReviews({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: pr.number,
    });
    core.info(`List of reviews: ${listReviews}`);

    // Check if there is an approval by dependabot
    for (let review of listReviews) {
      core.info(
        `Reviewer: ${review.user.login}  Review state: ${review.state}`
      );
      if (ALLOWED_NAMES[review.user.login] && review.state === `APPROVED`) {
        core.info(`Removing an approval from ${review.user.login}`);
        await client.pulls.dismissReview({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          pull_number: pr.number,
          review_id: review.id,
          message: `A commit was added after a dependabot approval`,
        });
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function run() {
  try {
    const token = core.getInput('github-token', { required: true });

    const { pull_request: pr } = github.context.payload;
    if (!pr) {
      throw new Error('Event payload missing `pull_request`');
    }

    const client = new github.GitHub(token);

    // Get a pull request
    const { data: pullRequest } = await client.pulls.get({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: pr.number,
    });

    // Get creator of pull request
    const pr_user = pullRequest.user.login;

    core.info(`PR #${pr.number} opened from ${pr_user}`);

    // Get list of commits on a pull request
    const { data: listCommits } = await client.pulls.listCommits({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: pr.number,
    });

    // Get all commiters on a pull request
    for (let commit of listCommits) {
      // Check if there are commiters other than ALLOWED_NAMES
      if (!ALLOWED_NAMES[commit.author.login]) {
        core.info(
          `Commit ${commit.sha} is not from an approved source (${commit.author.login})`
        );
        // Remove approvals by dependabot if any
        remove_dependabot_approvals(client, pr);
        return;
      }
    }

    core.debug(`Creating approving review for pull request #${pr.number}`);
    await client.pulls.createReview({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: pr.number,
      event: 'APPROVE',
    });
    core.info(`Approved pull request #${pr.number}`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
