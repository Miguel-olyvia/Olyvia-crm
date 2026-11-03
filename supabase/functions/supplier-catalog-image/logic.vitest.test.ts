import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  buildStoragePath,
  checkImage,
  isServiceCredential,
  jsonActionSchema,
  rpcErrorBody,
  uploadFieldsSchema,
} from "./logic";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
// HEIC: "ftypheic" a partir do byte 4 (o detector vê-o como mp4) → recusado.
const HEIC = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const ACC = "6c8d8d81-a686-447b-824b-2a926ef378ac";
const ITEM = "7bcb6096-9b9f-4533-92c6-617ee1021545";
const LEAF = "00000000-0000-4000-8000-000000000003";

describe("checkImage", () => {
  it("aceita JPEG, PNG e WEBP pelo conteúdo", () => {
    expect(checkImage(JPEG)).toEqual({ ok: true, type: { mime: "image/jpeg", ext: "jpg" } });
    expect(checkImage(PNG)).toEqual({ ok: true, type: { mime: "image/png", ext: "png" } });
    expect(checkImage(WEBP)).toEqual({ ok: true, type: { mime: "image/webp", ext: "webp" } });
  });
  it("recusa HEIC, GIF, PDF, SVG", () => {
    for (const b of [HEIC, GIF, PDF, SVG]) {
      const r = checkImage(b);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(415);
        expect(r.error).toBe("file_type_not_allowed");
      }
    }
  });
  it("recusa vazio e acima de 5 MB", () => {
    const empty = checkImage(new Uint8Array());
    expect(empty.ok === false && empty.error).toBe("empty_file");
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(JPEG);
    const r = checkImage(big);
    expect(r.ok === false && r.status).toBe(413);
  });
});

describe("pedidos", () => {
  it("upload exige action=upload e um uuid", () => {
    expect(uploadFieldsSchema.safeParse({ action: "upload", catalog_item_id: ITEM }).success).toBe(true);
    expect(uploadFieldsSchema.safeParse({ action: "upload", catalog_item_id: "x" }).success).toBe(false);
  });
  it("remove/reorder só aceitam caminhos com a forma do bucket", () => {
    const path = buildStoragePath(ACC, ITEM, LEAF, "webp");
    expect(path).toBe(`${ACC}/${ITEM}/${LEAF}.webp`);
    expect(jsonActionSchema.safeParse({ action: "remove", catalog_item_id: ITEM, path }).success).toBe(true);
    expect(jsonActionSchema.safeParse({ action: "remove", catalog_item_id: ITEM, path: `../${path}` }).success).toBe(false);
    expect(jsonActionSchema.safeParse({ action: "remove", catalog_item_id: ITEM, path: `${ACC}/${ITEM}/${LEAF}.svg` }).success).toBe(false);
    expect(jsonActionSchema.safeParse({ action: "reorder", catalog_item_id: ITEM, paths: [path] }).success).toBe(true);
    expect(jsonActionSchema.safeParse({ action: "reorder", catalog_item_id: ITEM, paths: [path, path, path, path, path] }).success).toBe(false);
    expect(jsonActionSchema.safeParse({ action: "apagar_tudo", catalog_item_id: ITEM }).success).toBe(false);
  });
});

describe("isServiceCredential", () => {
  const jwt = (payload: object) =>
    `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
  it("recusa chaves de serviço (legada e nova)", () => {
    expect(isServiceCredential(jwt({ role: "service_role" }))).toBe(true);
    expect(isServiceCredential("sb_secret_abc")).toBe(true);
  });
  it("deixa passar pessoas e lixo (o Auth decide)", () => {
    expect(isServiceCredential(jwt({ role: "authenticated", sub: "u" }))).toBe(false);
    expect(isServiceCredential(jwt({ role: "anon" }))).toBe(false);
    expect(isServiceCredential("nada")).toBe(false);
    expect(isServiceCredential("")).toBe(false);
  });
});

describe("rpcErrorBody", () => {
  it("mapeia os HINT conhecidos", () => {
    expect(rpcErrorBody({ hint: "not_owner", message: "m" })).toEqual({ status: 403, body: { error: "not_owner", message: "m" } });
    expect(rpcErrorBody({ hint: "limit", message: "m" }).status).toBe(409);
    expect(rpcErrorBody({ hint: "not_found", message: "m" }).status).toBe(404);
    expect(rpcErrorBody({ hint: "validation", message: "m" }).status).toBe(400);
    expect(rpcErrorBody({ hint: "no_supplier_access", message: "m" }).status).toBe(403);
  });
  it("esconde erros sem HINT", () => {
    expect(rpcErrorBody({ message: "relation x does not exist" })).toEqual({
      status: 500,
      body: { error: "rpc_error", message: "Erro interno. Tente novamente." },
    });
  });
});
