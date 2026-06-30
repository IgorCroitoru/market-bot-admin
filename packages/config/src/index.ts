import { z } from "zod";

export { z };

export const numberFromEnv = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }

    if (typeof value === "string") {
      return Number(value);
    }

    return value;
  }, z.number().int().nonnegative());

export const optionalNumberFromEnv = () =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (typeof value === "string") {
      return Number(value);
    }

    return value;
  }, z.number().int().positive().optional());

export const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }

    if (typeof value === "string") {
      return /^(1|true|yes|on)$/i.test(value);
    }

    return Boolean(value);
  }, z.boolean());

export const optionalBooleanFromEnv = () =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (typeof value === "string") {
      return /^(1|true|yes|on)$/i.test(value);
    }

    return Boolean(value);
  }, z.boolean().optional());

export const optionalTrimmedString = () =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().optional());