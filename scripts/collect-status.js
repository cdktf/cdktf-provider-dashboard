#! /usr/bin/env node

const { Octokit } = require("@octokit/rest")
const { throttling } = require("@octokit/plugin-throttling")
const fs = require("fs").promises
const semver = require("semver")

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

async function getRelease(github, repoName) {
    console.log("Release for: ", repoName)
    const { data } = await github.rest.repos.getLatestRelease({
        owner: "cdktf",
        repo: repoName,
        state: "open"
    })

    return data
}

async function getPackageJson(github, repoName) {
    console.log("Package.json for: ", repoName)
    const { data } = await github.rest.repos.getContent({
        owner: "cdktf",
        repo: repoName,
        path: "package.json"
    })

    return data
}

async function getLatestCdktfVersion() {
    const response = await fetch(`https://registry.npmjs.org/cdktf`)
    const data = await response.json();

    return data["dist-tags"].latest
}

async function getLatestProviderVersion(name, url) {
    console.log("Fetching provider info: ", name)
    const response = await fetch(url)
    const data = await response.json()
    const providerVersion = data.included
        .map(data => ({ version: data.attributes.version, published: data.attributes["published-at"] }))
        .sort((a, b) => a.published < b.published ? 1 : (a.published > b.published) ? -1 : 0)[0].version

    return providerVersion
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

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
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
    const latestCdktfVersion = await getLatestCdktfVersion()

    for (const repo of repos) {
        const workflows = await getWorkflows(github, repo.name)
        const allIssues = await getIssues(github, repo.name)
        const latestRelease = await getRelease(github, repo.name)
        const packageJson = await getPackageJson(github, repo.name)
        repo.workflows = workflows;
        repo.pulls = allIssues.filter(issue => !!issue.pull_request);
        repo.issues = allIssues.filter(issue => !issue.pull_request);
        repo.packageJson = JSON.parse(Buffer.from(packageJson.content, "base64").toString())
        repo.latestRelease = latestRelease
        repo.latestCdktfVersion = latestCdktfVersion

        if (repo.packageJson.cdktf && repo.packageJson.cdktf.provider) {
            const registryUrl = repo.packageJson.cdktf.provider.name.replace(`registry.terraform.io`, "https://registry.terraform.io/v2/providers") + "?include=provider-versions"
            repo.provider = {
                latestVersion: await getLatestProviderVersion(repo.packageJson.cdktf.provider.name.replace("registry.terraform.io/", ""), registryUrl)
            }
        }

        await delay(5000)
    }

    await fs.writeFile("./src/_data/repos.json", JSON.stringify(repos, null, 2), "utf8")

    console.log("Done")
})()