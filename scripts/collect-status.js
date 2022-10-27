#! /usr/bin/env node

const { Octokit } = require("@octokit/rest")
const { throttling } = require("@octokit/plugin-throttling")
const fs = require("fs").promises


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
        console.log("Workflows for: ", repo.name)
        const { data } = await github.actions.listWorkflowRunsForRepo({
            owner: "cdktf",
            repo: repo.name
        })
        const runSet = {}
        for (const run in data.workflow_runs) {
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

                return createdA - createdB
            })
        })

        repo.workflows = runSet
    }

    await fs.writeFile("./repos.json", JSON.stringify(repos, null, 2), "utf8")

    console.log("Done")
})()