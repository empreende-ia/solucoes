import { describe, expect, it } from "vitest";
import { safeSecretEqual } from "@/lib/builder/utils/secret-compare";

describe("safeSecretEqual", () => {
  it("aceita o segredo idêntico", () => {
    expect(safeSecretEqual("s3cret-value", "s3cret-value")).toBe(true);
  });

  it("rejeita segredo diferente, prefixo, sufixo e tamanhos distintos", () => {
    expect(safeSecretEqual("s3cret-valuf", "s3cret-value")).toBe(false);
    expect(safeSecretEqual("s3cret", "s3cret-value")).toBe(false);
    expect(safeSecretEqual("s3cret-value-extra", "s3cret-value")).toBe(false);
    expect(safeSecretEqual("S3CRET-VALUE", "s3cret-value")).toBe(false);
  });

  it("rejeita header ausente ou vazio", () => {
    expect(safeSecretEqual(null, "s3cret")).toBe(false);
    expect(safeSecretEqual(undefined, "s3cret")).toBe(false);
    expect(safeSecretEqual("", "s3cret")).toBe(false);
  });

  it("lida com unicode sem lançar", () => {
    expect(safeSecretEqual("ção🔐", "ção🔐")).toBe(true);
    expect(safeSecretEqual("çao🔐", "ção🔐")).toBe(false);
  });
});
