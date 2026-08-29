import { describe, expect, it } from "bun:test";
import { compareSemver, evaluatePublishTransition, type PackageManifest } from "./release-trigger";

const manifest = (version: string, tag = "latest"): PackageManifest => ({
  name: "aerograph",
  version,
  publishConfig: { tag },
});

describe("release trigger", () => {
  it("skips publication when package metadata changes without a version change", () => {
    expect(evaluatePublishTransition(manifest("0.1.0-alpha.0"), manifest("0.1.0-alpha.0"))).toEqual(
      {
        publish: false,
        version: "0.1.0-alpha.0",
      }
    );
  });

  it("does not interpret the repository's package rename as a version transition", () => {
    const previous = { ...manifest("0.1.0"), name: "@kioku/cli" };
    expect(evaluatePublishTransition(previous, manifest("0.0.0"))).toEqual({
      publish: false,
      version: "0.0.0",
    });
  });

  it("publishes an incremented alpha version", () => {
    expect(evaluatePublishTransition(manifest("0.0.0"), manifest("0.1.0-alpha.0"))).toEqual({
      publish: true,
      version: "0.1.0-alpha.0",
    });
    expect(
      evaluatePublishTransition(manifest("0.1.0-alpha.9"), manifest("0.1.0-alpha.10"))
    ).toEqual({
      publish: true,
      version: "0.1.0-alpha.10",
    });
  });

  it("rejects downgrades and non-alpha releases", () => {
    expect(() =>
      evaluatePublishTransition(manifest("0.1.0-alpha.1"), manifest("0.1.0-alpha.0"))
    ).toThrow("version downgrade");
    expect(() => evaluatePublishTransition(manifest("0.1.0-alpha.1"), manifest("0.1.0"))).toThrow(
      "only publishes alpha"
    );
  });

  it("requires prereleases to remain the default before the first stable release", () => {
    expect(() =>
      evaluatePublishTransition(manifest("0.0.0"), manifest("0.1.0-alpha.0", "alpha"))
    ).toThrow("publishConfig.tag latest");
  });

  it("rejects any future package identity at this release boundary", () => {
    const current = { ...manifest("0.1.0-alpha.0"), name: "@aerograph/other" };
    expect(() => evaluatePublishTransition(manifest("0.0.0"), current)).toThrow(
      "only publishes aerograph"
    );
  });

  it("uses SemVer precedence for numeric and prerelease identifiers", () => {
    expect(compareSemver("0.1.0-alpha.10", "0.1.0-alpha.9")).toBe(1);
    expect(compareSemver("0.1.0-alpha.0", "0.1.0-alpha.beta")).toBe(-1);
    expect(compareSemver("0.1.0", "0.1.0-alpha.99")).toBe(1);
  });
});
