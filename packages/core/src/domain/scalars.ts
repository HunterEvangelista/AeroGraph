import { Schema } from "effect";

export const PositiveInteger = Schema.Finite.check(Schema.isInt(), Schema.isGreaterThan(0));

export const NonNegativeInteger = Schema.Finite.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0)
);
