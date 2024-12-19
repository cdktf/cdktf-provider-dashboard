/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

const { Octokit } = require("@octokit/rest");
const { throttling } = require("@octokit/plugin-throttling");
const { retry } = require("@octokit/plugin-retry");
const fs = require("fs").promises;
const { createActionAuth } = require("@octokit/auth-action");
const { createTokenAuth } = require("@octokit/auth-token");
const semver = require("semver");

async function processWorkflows(data) {
  const runSet = {};
  for (const run of data.workflow_runs) {
    const name = run.name;
    if (!runSet[name]) {
      runSet[name] = [run];
    } else {
      runSet[name].push(run);
    }
  }

  Object.keys(runSet).forEach((workflowName) => {
    runSet[workflowName] = runSet[workflowName].sort((runA, runB) => {
      const createdA = new Date(runA.created_at);
      const createdB = new Date(runB.created_at);

      return createdB - createdA;
    });
  });

  return runSet;
}

async function getWorkflows(github, repoName) {
  console.log("Workflows for: ", repoName);
  const { data } = await github.actions.listWorkflowRunsForRepo({
    owner: "cdktf",
    repo: repoName,
  });

  return processWorkflows(data);
}

async function getIssues(github, repoName) {
  console.log("Issues for: ", repoName);
  const { data } = await github.rest.issues.listForRepo({
    owner: "cdktf",
    repo: repoName,
    state: "open",
  });

  return data;
}

async function getRelease(github, repoName) {
  console.log("Release for: ", repoName);
  try {
    const { data } = await github.rest.repos.getLatestRelease({
      owner: "cdktf",
      repo: repoName,
      state: "open",
    });
  
    return data;
  } catch (e) {
    console.log("No release found for: ", repoName);
    // Returning a non-release object to indicate no release
    return {
      html_url: "http://cdk.tf",
      tag_name: "999.999.999",
      published_at: "1815-12-27T00:00:00Z", // Adas Birthday, to signal unreleased
    };
  }
 
}

async function getPackageJson(github, repoName) {
  console.log("Package.json for: ", repoName);
  try {
    const { data } = await github.rest.repos.getContent({
      owner: "cdktf",
      repo: repoName,
      path: "package.json",
    });

    return data;
  } catch (e) {
    console.log("No package.json found for: ", repoName);
    return undefined
  }
}

const providerNameOverrides = {
  googlebeta: {
    typescript: "google-beta",
    python: "google_beta",
    java: "google-beta",
    csharp: "GoogleBeta",
    go: "googlebeta",
  },
};

function convertRepoNameForLanguage(repoName, language) {
  let providerName = repoName.replace("cdktf-provider-", "");
  const hasOverrides = !!providerNameOverrides[providerName];
  providerName = hasOverrides
    ? providerNameOverrides[providerName][language]
    : providerName;

  switch (language) {
    case "typescript":
      return `@cdktf/provider-${providerName}`;
    case "python":
      return `cdktf-cdktf-provider-${providerName}`;
    case "java":
      return hasOverrides ? `cdktf-provider-${providerName}` : repoName;
    case "csharp":
      return `HashiCorp.Cdktf.Providers.${providerName}`; // The API is agnostic to character casing
    case "go":
      return `github.com/cdktf/cdktf-provider-${providerName}-go/${providerName}`;
  }
}

async function getNpmPackageVersion(repoName) {
  const packageName = convertRepoNameForLanguage(repoName, "typescript");
  const url = `https://registry.npmjs.org/${packageName}/latest`;
  let data;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // timeout the API call after 5 seconds
    });
    if (!response.ok) {
      return null;
    }
    data = await response.json();
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      console.error(`Request to ${url} timed out after 5 seconds`);
    }
    return null;
  }

  return {
    version: data.version,
    packageUrl: `https://www.npmjs.com/package/${packageName}`,
    isDeprecated: !!data.deprecated,
  };
}

async function getPypiPackageVersion(repoName) {
  const packageName = convertRepoNameForLanguage(repoName, "python");
  const url = `https://pypi.org/pypi/${packageName}/json`;
  let data;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // timeout the API call after 5 seconds
    });
    if (!response.ok) {
      return null;
    }
    data = await response.json();
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      console.error(`Request to ${url} timed out after 5 seconds`);
    }
    return null;
  }

  return {
    version: data.info.version,
    packageUrl: data.info.package_url,
    releaseDate: data.releases[data.info.version][0].upload_time,
  };
}

async function getMavenPackageVersion(repoName) {
  const packageName = convertRepoNameForLanguage(repoName, "java");
  const url = `https://search.maven.org/solrsearch/select?q=a:${packageName}&rows=20&wt=json`;
  let doc;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000), // timeout the API call after 10 seconds
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    doc = data.response.docs[0];
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      console.error(`Request to ${url} timed out after 10 seconds`);
    }
  }

  if (!doc) return null;
  return {
    version: doc.latestVersion,
    packageUrl: `https://mvnrepository.com/artifact/com.hashicorp/${packageName}/${doc.latestVersion}`,
    releaseDate: new Date(doc.timestamp).toISOString(),
  };
}

async function getNuGetPackageVersion(repoName) {
  const packageName = convertRepoNameForLanguage(repoName, "csharp");
  const url = `https://azuresearch-usnc.nuget.org/query?q=${packageName}&prerelease=false`;
  let info;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000), // timeout the API call after 10 seconds
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    info = data.data[0];
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      console.error(`Request to ${url} timed out after 10 seconds`);
    }
  }

  if (!info) return null;
  return {
    version: info.version,
    packageUrl: `https://www.nuget.org/packages/${packageName}`,
  };
}

async function getGoReleaseVersion(repoName) {
  const packageName = convertRepoNameForLanguage(repoName, "go");
  const goRepoName = repoName + "-go";
  const allTagsUrl = `https://api.github.com/repos/cdktf/${goRepoName}/tags`;
  let firstTag;

  try {
    const response = await fetch(allTagsUrl, {
      signal: AbortSignal.timeout(10000), // timeout the API call after 10 seconds
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    firstTag = data[0];
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      console.error(`Request to ${allTagsUrl} timed out after 10 seconds`);
    }
  }

  if (!firstTag) {
    return {
      version: "999.999.999",
      packageUrl: `https://pkg.go.dev/${packageName}`,
    }
  }

  const version = firstTag.name.split("/")[1].replace("v", "");
  return {
    version,
    packageUrl: `https://pkg.go.dev/${packageName}/v${version.split(".")[0]}`,
  };
}

async function getLatestCdktfVersion() {
  const url = "https://registry.npmjs.org/cdktf";
  let data;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // timeout the API call after 5 seconds
    });
    data = await response.json();
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      console.error(`Request to ${url} timed out after 5 seconds`);
    }
    return null;
  }

  return data["dist-tags"].latest;
}

async function getLatestProviderVersion(name, url) {
  console.log("Fetching provider info: ", name);
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000), // timeout the API call after 30 seconds
    });
    const data = await response.json();
    const sortedVersions = data.included
      .map((data) => ({
        version: data.attributes.version,
        published: data.attributes["published-at"],
      }))
      .sort((a, b) =>
        semver.lt(a.version, b.version) ? 1 : semver.gt(a.version, b.version) ? -1 : a.published < b.published ? 1 : a.published > b.published ? -1 : 0
      );
    const providerVersion = sortedVersions.find((v) => semver.prerelease(v.version) === null).version;

    return providerVersion;
  } catch (e) {
    console.log("Unable to fetch provider info: ", name);
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      console.error(`Request to ${url} timed out after 30 seconds`);
    }
    return "999.999.999"
  }
}

const ignoredRepos = ["cdktf-provider-project", "cdktf-provider-dashboard"];
async function getAllPrebuiltRepos(github) {
  console.log("Getting all repo names");
  return github.paginate(
    github.rest.repos.listForOrg,
    {
      per_page: 100,
      org: "cdktf",
      type: "public",
      filter: "",
    },
    (response) =>
      response.data.filter(
        (repo) =>
          repo.name.startsWith("cdktf-provider-") &&
          !repo.name.endsWith("-go") &&
          !ignoredRepos.includes(repo.name)
      ).sort((a, b) => {
        if (a.name < b.name) {
          return -1;
        }
        if (a.name > b.name) {
          return 1;
        }
        return 0;
      })
  );
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async function () {
  let authToken;
  try {
    const auth = createActionAuth();
    authToken = await auth();
  } catch (e) {
    console.error(
      "Unable to get github action token, trying locally passed token"
    );
  }
  if (!authToken) {
    try {
      const auth = createTokenAuth(process.env.GITHUB_TOKEN);
      authToken = await auth();
    } catch (e) {
      console.log(
        "Unable to get locally passed token, proceeding unauthenticated"
      );
    }
  }

  const OctokitWithPlugins = Octokit.plugin(throttling).plugin(retry);
  const github = new OctokitWithPlugins({
    auth: authToken && authToken.token,
    throttle: {
      onRateLimit: (retryAfter) => {
        console.log(
          `Hitting rate limit, retrying after: ${retryAfter} seconds`
        );
        return true;
      },
      onSecondaryRateLimit: (retryAfter) => {
        console.log(
          `Hitting secondary rate limit, retrying after: ${retryAfter} seconds`
        );
        return true;
      },
    },
    request: { retries: 2 },
  });

  const repos = await getAllPrebuiltRepos(github);
  const latestCdktfVersion = await getLatestCdktfVersion();
  const numArchived = repos.reduce((count, repo) => count + (repo.archived ? 1 : 0), 0);

  for (const repo of repos) {
    const workflows = await getWorkflows(github, repo.name);
    const allIssues = await getIssues(github, repo.name);
    const latestRelease = await getRelease(github, repo.name);
    const packageJson = await getPackageJson(github, repo.name);
    repo.workflows = workflows;
    repo.pulls = allIssues.filter((issue) => !!issue.pull_request);
    repo.issues = allIssues.filter((issue) => !issue.pull_request);
    repo.packageJson = packageJson ? JSON.parse(
      Buffer.from(packageJson.content, "base64").toString()
    ) : {
      cdktf: {
        provider: {
          name: "unknown",
          version: "999.999.999"
        },
        peerDependencies: {
          cdktf: "999.999.999"
        }
      }
    };
    repo.latestRelease = latestRelease;
    repo.latestCdktfVersion = latestCdktfVersion;
    repo.numArchived = numArchived;

    if (repo.packageJson.cdktf && repo.packageJson.cdktf.provider) {
      const registryUrl =
        repo.packageJson.cdktf.provider.name.replace(
          `registry.terraform.io`,
          "https://registry.terraform.io/v2/providers"
        ) + "?include=provider-versions";
      repo.provider = {
        latestVersion: await getLatestProviderVersion(
          repo.packageJson.cdktf.provider.name.replace(
            "registry.terraform.io/",
            ""
          ),
          registryUrl
        ),
      };
    }
    repo.packageManagerVersions = {
      npm: await getNpmPackageVersion(repo.name),
      pypi: await getPypiPackageVersion(repo.name),
      maven: await getMavenPackageVersion(repo.name),
      nuget: await getNuGetPackageVersion(repo.name),
      go: await getGoReleaseVersion(repo.name),
    };

    if (!authToken || !authToken.token) {
      console.log("😮‍💨 for 5 secs");
      await delay(5000);
    }
  }

  await fs.writeFile(
    "./src/_data/repos.json",
    JSON.stringify(repos, null, 2),
    "utf8"
  );

  console.log("Done");
})();
