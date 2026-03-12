export const FIXED_TIMESTAMP_ISO = "2026-01-01T00:00:00.000Z"

export const fixedDate = (): Date => new Date(FIXED_TIMESTAMP_ISO)

export const createDeterministicIdGenerator = (prefix = "id") => {
  let counter = 0

  return (): string => {
    const id = `${prefix}-${String(counter).padStart(4, "0")}`
    counter += 1
    return id
  }
}
