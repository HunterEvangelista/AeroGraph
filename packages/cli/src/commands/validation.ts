import { NonNegativeInteger, PositiveInteger } from "@kioku/core";
import { Schema } from "effect";

export const decodePositiveInteger = (value: number): number =>
  Schema.decodeUnknownSync(PositiveInteger)(value);

export const parsePositiveInteger = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (String(parsed) !== value) {
    throw new Error("Invalid positive integer");
  }

  return decodePositiveInteger(parsed);
};

export const isPositiveInteger = (value: number): boolean => Schema.is(PositiveInteger)(value);

export const isNonNegativeInteger = (value: number): boolean =>
  Schema.is(NonNegativeInteger)(value);
