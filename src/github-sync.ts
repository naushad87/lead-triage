import { ReplitConnectors } from "@replit/connectors-sdk";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const connectors = new ReplitConnectors();

const OWNER = "naushad87";
const REPO = "lead-triage";
const BRANCH = "main";

async function githubApi(
  path: string,
  options: { method?: string; body?: string } = {}
): Promise<unknown> {
  const fetchOptions: { method: string; body?: string; headers?: Record<string, string> } = {
    method: options.method ?? "GET",
  };
  if (options.body) {
    fetchOptions.body = options.body;
    fetchOptions.headers = { "Content-Type": "application/json" };
  }
  const response = await connectors.proxy("github", path, fetchOptions);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status} ${path}: ${text}`);
  }
  return response.json();
}

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
}

async function main(): Promise<void> {
  const currentSha = git("rev-parse HEAD");
  console.log(`Local HEAD: ${currentSha}`);

  let remoteSha: string | null = null;
  try {
    const refData = (await githubApi(
      `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`
    )) as { object: { sha: string } };
    remoteSha = refData.object.sha;
    console.log(`Remote HEAD: ${remoteSha}`);
  } catch {
    console.log("Remote ref not found — will create it");
  }

  if (remoteSha === currentSha) {
    console.log("Already in sync, nothing to do");
    return;
  }

  const trackedLines = git("ls-tree -r HEAD")
    .split("\n")
    .filter(Boolean);

  const localFiles: Record<string, { blobSha: string; mode: string }> = {};
  for (const line of trackedLines) {
    const [mode, , blobSha, ...pathParts] = line.split(/\s+/);
    const filePath = pathParts.join(" ");
    localFiles[filePath] = { blobSha, mode };
  }

  const remoteBlobs: Record<string, string> = {};
  if (remoteSha) {
    try {
      const commitData = (await githubApi(
        `/repos/${OWNER}/${REPO}/git/commits/${remoteSha}`
      )) as { tree: { sha: string } };
      const treeData = (await githubApi(
        `/repos/${OWNER}/${REPO}/git/trees/${commitData.tree.sha}?recursive=1`
      )) as { tree: Array<{ type: string; path: string; sha: string }> };
      for (const item of treeData.tree) {
        if (item.type === "blob") {
          remoteBlobs[item.path] = item.sha;
        }
      }
    } catch {
      console.log("Could not fetch remote tree — uploading all files");
    }
  }

  const filesToUpload = Object.entries(localFiles).filter(
    ([path, { blobSha }]) => remoteBlobs[path] !== blobSha
  );

  console.log(
    `Files to upload: ${filesToUpload.length} of ${Object.keys(localFiles).length}`
  );

  const treeItems: Array<{
    path: string;
    mode: string;
    type: string;
    sha: string;
  }> = [];

  for (const [filePath, { blobSha: localBlobSha, mode }] of filesToUpload) {
    let content: string;
    try {
      content = readFileSync(filePath).toString("base64");
    } catch {
      console.warn(`Skipping unreadable file: ${filePath}`);
      continue;
    }

    const blob = (await githubApi(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "base64" }),
    })) as { sha: string };

    console.log(`  Uploaded: ${filePath} (${localBlobSha.slice(0, 7)})`);
    treeItems.push({ path: filePath, mode, type: "blob", sha: blob.sha });
  }

  for (const [filePath, { blobSha: localBlobSha, mode }] of Object.entries(
    localFiles
  )) {
    if (!filesToUpload.find(([p]) => p === filePath)) {
      treeItems.push({
        path: filePath,
        mode,
        type: "blob",
        sha: localBlobSha,
      });
    }
  }

  const newTree = (await githubApi(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ tree: treeItems }),
  })) as { sha: string };

  const commitMessage = git("log -1 --format=%s");
  const authorName = git("log -1 --format=%an");
  const authorEmail = git("log -1 --format=%ae");
  const authorDate = git("log -1 --format=%aI");

  const commitPayload: {
    message: string;
    tree: string;
    author: { name: string; email: string; date: string };
    parents?: string[];
  } = {
    message: commitMessage,
    tree: newTree.sha,
    author: { name: authorName, email: authorEmail, date: authorDate },
  };
  if (remoteSha) {
    commitPayload.parents = [remoteSha];
  }

  const newCommit = (await githubApi(
    `/repos/${OWNER}/${REPO}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify(commitPayload),
    }
  )) as { sha: string };

  if (remoteSha) {
    await githubApi(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha, force: true }),
    });
  } else {
    await githubApi(`/repos/${OWNER}/${REPO}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${BRANCH}`,
        sha: newCommit.sha,
      }),
    });
  }

  console.log(`Synced to GitHub: ${newCommit.sha}`);
  console.log(`https://github.com/${OWNER}/${REPO}/commit/${newCommit.sha}`);
}

main().catch((err: Error) => {
  console.error("GitHub sync failed:", err.message);
  process.exit(1);
});
