import { Schema } from "effect";

export const PositiveInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));

export const NonNegativeInteger = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0)
);
