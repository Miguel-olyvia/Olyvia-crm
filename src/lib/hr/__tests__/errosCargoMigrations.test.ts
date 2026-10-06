/**
 * Cruza os tokens e os codigos de `errosCargo.ts` com os RAISE REAIS das cinco
 * migrations do fluxo 2 (20261210100000..140000). Mesma excepcao deliberada de
 * `fluxo2CargoMigrations.test.ts` a regra "nao testar SQL por texto": nenhum
 * compilador ve que um token mudou de nome de um lado so.
 *
 * Para cada `RAISE EXCEPTION 'token: frase' ... USING ERRCODE = 'X'` com X em
 * HRC.., 23514 ou 23P01:
 *   - o token existe em CODIGO_POR_TOKEN;
 *   - `codigoDeErroCargo` devolve o codigo esperado a partir do que o PostgREST
 *     entregaria (code + message) e tambem so a partir da message.
 * E o inverso: todo o token do cliente e lancado por alguma migration.
 */
import { describe, expect, it } from "vitest";
import { CODIGO_POR_TOKEN, CHAVE_POR_CODIGO, codigoDeErroCargo } from "@/lib/hr/errosCargo";
import { migrationPorVersao, semComentarios } from "./migrationSql";

const VERSOES = [
  "20261210100000",
  "20261210110000",
  "20261210120000",
  "20261210130000",
  "20261210140000",
  "20261210160000",
] as const;

interface Raise {
  token: string;
  errcode: string;
}

/** O texto do comando a partir de `RAISE EXCEPTION` ate ao `;` fora de aspas. */
function comandosRaise(sql: string): string[] {
  const comandos: string[] = [];
  const inicio = /RAISE\s+EXCEPTION\b/g;
  let m: RegExpExecArray | null;
  while ((m = inicio.exec(sql)) !== null) {
    let i = m.index;
    let dentro = false;
    for (; i < sql.length; i++) {
      const c = sql[i];
      if (c === "'") dentro = !dentro; // '' escapado alterna duas vezes: fica igual
      else if (c === ";" && !dentro) break;
    }
    comandos.push(sql.slice(m.index, i));
  }
  return comandos;
}

function raisesDoCliente(): Raise[] {
  const achados: Raise[] = [];
  for (const versao of VERSOES) {
    for (const comando of comandosRaise(semComentarios(migrationPorVersao(versao)))) {
      const token = /RAISE\s+EXCEPTION\s+'([a-z_]+):/.exec(comando)?.[1];
      const errcode = /ERRCODE\s*=\s*'([^']+)'/.exec(comando)?.[1];
      if (!token || !errcode) continue;
      if (/^HRC\d\d$/.test(errcode) || errcode === "23514" || errcode === "23P01") {
        achados.push({ token, errcode });
      }
    }
  }
  return achados;
}

describe("errosCargo.ts contra os RAISE reais das migrations do fluxo 2", () => {
  const raises = raisesDoCliente();

  it("o leitor de SQL encontra os RAISE do fluxo 2 (guarda contra um regex que nao apanha nada)", () => {
    expect(raises.length).toBeGreaterThan(40);
    const codigos = new Set(raises.map((r) => r.errcode));
    for (let n = 1; n <= 14; n++) expect(codigos.has(`HRC${String(n).padStart(2, "0")}`), `HRC${n}`).toBe(true);
    expect(codigos.has("23514")).toBe(true);
    expect(codigos.has("23P01")).toBe(true);
  });

  it("todo o token que a base lanca com um codigo nosso esta em CODIGO_POR_TOKEN", () => {
    const emFalta = [...new Set(raises.map((r) => r.token))].filter(
      (t) => !Object.keys(CODIGO_POR_TOKEN).includes(t),
    );
    expect(emFalta).toEqual([]);
  });

  it("cada RAISE e reconhecido, com e sem code, e tem texto no ecra", () => {
    const erros: string[] = [];
    for (const { token, errcode } of raises) {
      const message = `${token}: uma frase qualquer`;
      const esperado = Object.keys(CHAVE_POR_CODIGO).includes(errcode) ? errcode : CODIGO_POR_TOKEN[token];
      const comCode = codigoDeErroCargo({ code: errcode, message });
      const semCode = codigoDeErroCargo({ message });
      if (comCode !== esperado) erros.push(`${errcode}/${token}: com code deu ${comCode}, esperado ${esperado}`);
      if (semCode !== CODIGO_POR_TOKEN[token]) erros.push(`${token}: sem code deu ${semCode}`);
      if (!CHAVE_POR_CODIGO[esperado as string]) erros.push(`${token}: sem chave de traducao`);
    }
    expect(erros).toEqual([]);
  });

  it("um HRC lancado com um token e o MESMO HRC que o cliente atribui a esse token", () => {
    const divergentes = raises
      .filter((r) => /^HRC\d\d$/.test(r.errcode))
      .filter((r) => CODIGO_POR_TOKEN[r.token] !== r.errcode)
      .map((r) => `${r.token} lancado com ${r.errcode}, cliente diz ${CODIGO_POR_TOKEN[r.token]}`);
    expect(divergentes).toEqual([]);
  });

  it("todo o token do cliente e lancado por alguma das cinco migrations", () => {
    const lancados = new Set(raises.map((r) => r.token));
    const semOrigem = Object.keys(CODIGO_POR_TOKEN).filter((t) => !lancados.has(t));
    expect(semOrigem).toEqual([]);
  });

  it("as sobreposicoes (23P01) tem texto proprio no ecra, e um 23P01 sem token nosso nao e reclamado", () => {
    expect(codigoDeErroCargo({ code: "23P01", message: "cargo_periodo_sobreposto: x" })).not.toBeNull();
    expect(codigoDeErroCargo({ code: "23P01", message: "pessoa_cargo_sobreposto: x" })).not.toBeNull();
    expect(codigoDeErroCargo({ code: "23P01", message: "conflicting key value violates exclusion constraint" })).toBeNull();
  });
});
