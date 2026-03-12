import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  FIXED_TIMESTAMP_ISO,
  createDeterministicIdGenerator,
  fixedDate,
  runEffect,
  runEffectExit,
} from "./index.js"

describe("core test helpers", () => {
  it("produces deterministic incremental ids", () => {
    const nextId = createDeterministicIdGenerator("entity")

    expect(nextId()).toBe("entity-0000")
    expect(nextId()).toBe("entity-0001")
    expect(nextId()).toBe("entity-0002")
  })

  it("returns a fixed date fixture", () => {
    expect(fixedDate().toISOString()).toBe(FIXED_TIMESTAMP_ISO)
  })

  it("runs successful effects", async () => {
    const result = await runEffect(Effect.succeed("ok"))
    expect(result).toBe("ok")
  })

  it("captures failure with exit", async () => {
    const exit = await runEffectExit(Effect.fail("boom"))
    expect(exit._tag).toBe("Failure")
  })
})
