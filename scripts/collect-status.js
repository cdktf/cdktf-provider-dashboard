#! /usr/bin/env node

const { Octokit } = require("@octokit/rest")
const { throttling } = require("@octokit/plugin-throttling")
const fs = require("fs").promises
const { createActionAuth } = require("@octokit/auth-action")
const { createTokenAuth } = require("@octokit/auth-token")

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

function convertRepoNameForLanguage(repoName, language) {
    const providerName = repoName.replace("cdktf-provider-", "")
    switch (language) {
        case "python":
            return `cdktf-cdktf-provider-${providerName}`
        case "java":
            return repoName
        case "csharp":
            return `HashiCorp.Cdktf.Providers.${providerName}` // The API is agnostic to character casing
    }
}

async function getPypiPackageVersion(repoName) {
    const packageName = convertRepoNameForLanguage(repoName, "python")

    const url = `https://pypi.org/pypi/${packageName}/json`
    const response = await fetch(url)
    if (!response.ok) {
        return null
    }
    const data = await response.json()

    return {
        version: data.info.version,
        packageUrl: data.info.package_url,
        releaseDate: data.releases[data.info.version][0].upload_time
    }
}

async function getMavenPackageVersion(repoName) {
    const packageName = convertRepoNameForLanguage(repoName, "java")
    const url = `https://search.maven.org/solrsearch/select?q=a:${packageName}&rows=20&wt=json`
    const response = await fetch(url)
    if (!response.ok) {
        return null
    }
    const data = await response.json()

    const doc = data.response.docs[0]
    if (!doc) return null
    return {
        version: doc.latestVersion,
        packageUrl: `https://mvnrepository.com/artifact/com.hashicorp/${packageName}/${doc.latestVersion}`,
        releaseDate: new Date(doc.timestamp).toISOString()
    }
}

async function getNuGetPackageVersion(repoName) {
    const packageName = convertRepoNameForLanguage(repoName, "csharp")
    const url = `https://azuresearch-usnc.nuget.org/query?q=${packageName}&prerelease=false`
    const response = await fetch(url)
    if (!response.ok) {
        return null
    }
    const data = await response.json()

    const info = data.data[0]
    if (!info) return null
    return {
        version: info.version,
        packageUrl: `https://www.nuget.org/packages/${packageName}`,
    }
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


const ignoredRepos = [
    "cdktf-provider-project",
    "cdktf-provider-dashboard",
]
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
        (response) => response.data.filter(repo => repo.name.startsWith("cdktf-provider-") && !repo.name.endsWith("-go") && !ignoredRepos.includes(repo.name))
    )
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

(async function () {
    let authToken
    try {
        const auth = createActionAuth();
        authToken = await auth();
    } catch (e) {
        console.error("Unable to get github action token, trying locally passed token")
    }
    if (!authToken) {
        try {
            const auth = createTokenAuth(process.env.GITHUB_TOKEN)
            authToken = await auth();
        } catch (e) {
            console.log("Unable to get locally passed token, proceeding unauthenticated")
        }

    }

    const OctokitWithPlugins = Octokit.plugin(throttling)
    const github = new OctokitWithPlugins({
        auth: authToken && authToken.token,
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
        repo.packageManagerVersions = {
            pypi: await getPypiPackageVersion(repo.name),
            maven: await getMavenPackageVersion(repo.name),
            nuget: await getNuGetPackageVersion(repo.name)
        }

        if (!authToken || !authToken.token) {
            console.log("😮‍💨 for 5 secs")
            await delay(5000)
        }
    }

    await fs.writeFile("./src/_data/repos.json", JSON.stringify(repos, null, 2), "utf8")

    console.log("Done")
})()