import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDeployment } from "./deploy-policy.mjs";

const sha = "a".repeat(40);
const otherSha = "b".repeat(40);
const environment = {
  GITHUB_REPOSITORY: "HunterEvangelista/AeroGraph",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/heads/main",
  GITHUB_SHA: sha,
  CLOUDFLARE_API_TOKEN: "test-token",
  CLOUDFLARE_ACCOUNT_ID: "test-account",
};

test("allows the exact tested upstream main revision, including a current-head rerun", () => {
  assert.doesNotThrow(() => assertDeployment(environment, sha, sha));
});

for (const [name, value] of [
  ["GITHUB_REPOSITORY", "fork/AeroGraph"],
  ["GITHUB_EVENT_NAME", "pull_request"],
  ["GITHUB_EVENT_NAME", "pull_request_target"],
  ["GITHUB_EVENT_NAME", "workflow_dispatch"],
  ["GITHUB_REF", "refs/heads/dev"],
  ["GITHUB_REF", "refs/tags/main"],
  ["GITHUB_SHA", "aaaaaaa"],
  ["GITHUB_SHA", undefined],
  ["CLOUDFLARE_API_TOKEN", ""],
  ["CLOUDFLARE_ACCOUNT_ID", " "],
  ["CLOUDFLARE_API_TOKEN", undefined],
]) {
  test(`rejects ${name}=${value}`, () => {
    assert.throws(() => assertDeployment({ ...environment, [name]: value }, sha, sha));
  });
}

test("rejects a checkout other than the tested revision", () => {
  assert.throws(() => assertDeployment(environment, sha, otherSha), /checkout/);
});

test("rejects out-of-order completion and reruns of older revisions", () => {
  assert.throws(() => assertDeployment(environment, otherSha, sha), /superseded/);
});

test("fails closed when the remote main SHA is missing", () => {
  assert.throws(() => assertDeployment(environment, "", sha), /superseded/);
});
