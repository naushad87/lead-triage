/**
 * GitHub sync script — pushes local repo state to naushad87/lead-triage via
 * GitHub's Git Data API, authenticated through the Replit GitHub connector.
 *
 * Authentication: uses @replit/connectors-sdk which reads REPL_IDENTITY and
 * REPLIT_CONNECTORS_HOSTNAME env vars injected by Replit. No token or remote
 * URL needs to be stored in /tmp or elsewhere — credentials are always present.
 *
 * Idempotency: the last successfully-synced LOCAL git SHA is persisted to
 * .local/.github-sync-sha (gitignored, so it stays only in this environment).
 * If the current HEAD matches, the script exits without creating any GitHub
 * objects.
 *
 * Force-update: the remote ref is always updated with force:true because the
 * commits created here have different SHAs from local git commits (GitHub
 * re-hashes them). This is intentional for a one-way Replit→GitHub mirror;
 * the remote should not be pushed to directly.
 */

import { ReplitConnectors } from "@replit/connectors-sdk";
import { execSync } from "child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "fs";
import { dirname } from "path";

const connectors = new ReplitConnectors();

const OWNER = "naushad87";
const REPO = "lead-triage";
const BRANCH = "main";
const LAST_SYNCED_SHA_FILE = ".local/.github-sync-sha";

async function githubApi(
  path: string,
  options: { method?: string; body?: string } = {}
): Promise<unknown> {
  const fetchOptions: {
    method: string;
    body?: string;
    headers?: Record<string, string>;
  } = {
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

function readLastSyncedSha(): string | null {
  try {
    return readFileSync(LAST_SYNCED_SHA_FILE, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function writeLastSyncedSha(sha: string): void {
  const dir = dirname(LAST_SYNCED_SHA_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(LAST_SYNCED_SHA_FILE, sha + "\n", "utf8");
}

async function main(): Promise<void> {
  const currentLocalSha = git("rev-parse HEAD");
  console.log(`Local HEAD: ${currentLocalSha}`);

  const lastSyncedSha = readLastSyncedSha();
  if (lastSyncedSha === currentLocalSha) {
    console.log(
      `Already synced (last synced SHA matches local HEAD). Nothing to do.`
    );
    return;
  }

  if (lastSyncedSha) {
    console.log(`Last synced local SHA: ${lastSyncedSha}`);
  } else {
    console.log("No prior sync record found — performing initial sync");
  }

  let remoteSha: string | null = null;
  try {
    const refData = (await githubApi(
      `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`
    )) as { object: { sha: string } };
    remoteSha = refData.object.sha;
    console.log(`Remote HEAD (GitHub): ${remoteSha}`);
  } catch {
    console.log("Remote ref not found — will create it");
  }

  const trackedLines = git("ls-tree -r HEAD").split("\n").filter(Boolean);

  const localFiles: Record<string, { blobSha: string; mode: string }> = {};
  for (const line of trackedLines) {
    const parts = line.split(/\s+/);
    const mode = parts[0];
    const blobSha = parts[2];
    const filePath = parts.slice(3).join(" ");
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
      console.warn(`  Skipping unreadable file: ${filePath}`);
      continue;
    }

    const blob = (await githubApi(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "base64" }),
    })) as { sha: string };

    console.log(`  Uploaded: ${filePath}`);
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
    // force:true is required because GitHub commits created via the API have
    // different SHAs from their Replit counterparts (Git re-hashes the object).
    // This is a one-way mirror; direct pushes to the remote are not expected.
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

  writeLastSyncedSha(currentLocalSha);

  console.log(`Synced to GitHub: ${newCommit.sha}`);
  console.log(`https://github.com/${OWNER}/${REPO}/commit/${newCommit.sha}`);
}

main().catch((err: Error) => {
  console.error("GitHub sync failed:", err.message);
  process.exit(1);
});
