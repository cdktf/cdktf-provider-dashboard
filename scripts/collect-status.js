#! /usr/bin/env node

const { Octokit } = require("@octokit/rest")
const { throttling } = require("@octokit/plugin-throttling")
const fs = require("fs").promises

async function processWorkflows(data) {
    const runSet = {}
    for (const run of data.workflow_runs) {
        const name = run.name
        if (!runSet[name]) {
            runSet[name] = [run]
        } else {
            runSet[name].push(run)
        }
    }

    Object.keys(runSet).forEach(workflowName => {
        runSet[workflowName] = runSet[workflowName].sort((runA, runB) => {
            const createdA = new Date(runA.created_at)
            const createdB = new Date(runB.created_at)

            return createdB - createdA
        })
    })

    return runSet
}

async function getWorkflows(github, repoName) {
    console.log("Workflows for: ", repoName)
    const { data } = await github.actions.listWorkflowRunsForRepo({
        owner: "cdktf",
        repo: repoName
    })

    return processWorkflows(data)
}

async function getIssues(github, repoName) {
    console.log("Issues for: ", repoName)
    const { data } = await github.rest.issues.listForRepo({
        owner: "cdktf",
        repo: repoName,
        state: "open"
    })

    return data
}


async function getAllPrebuiltRepos(github) {
    console.log("Getting all repo names")
    return github.paginate(
        github.rest.repos.listForOrg,
        {
            per_page: 100,
            org: "cdktf",
            type: "public",
            filter: ""
        },
        (response) => response.data.filter(repo => repo.name.startsWith("cdktf-provider-") && !repo.name.endsWith("-go"))
    )
}

(async function () {
    const OctokitWithPlugins = Octokit.plugin(throttling)
    const github = new OctokitWithPlugins({
        throttle: {
            onRateLimit: (retryAfter) => {
                console.log(`Hitting rate limit, retrying after: ${retryAfter} seconds`)
                return true
            },
            onSecondaryRateLimit: (retryAfter) => {
                console.log(`Hitting secondary rate limit, retrying after: ${retryAfter} seconds`)
                return true
            }
        }
    });

    const repos = await getAllPrebuiltRepos(github)

    for (const repo of repos) {
        const workflows = await getWorkflows(github, repo.name)
        const allIssues = await getIssues(github, repo.name)
        repo.workflows = workflows;
        repo.pulls = allIssues.filter(issue => !!issue.pull_request);
        repo.issues = allIssues.filter(issue => !issue.pull_request);
    }

    await fs.writeFile("./src/_data/repos.json", JSON.stringify(repos, null, 2), "utf8")

    console.log("Done")
})()