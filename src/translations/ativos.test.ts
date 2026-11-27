// Os textos do módulo «Ativos»: pt e en têm as mesmas chaves, e nenhuma chave escrita no código (literal) falta. As mortas (que nada usa) saíram.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ativosTranslations } from "./ativos";

const SRC = join(__dirname, "..");
const PASTAS = ["components/ativos", "pages/ativos", "hooks/ativos", "components/sidebar"];

function ficheiros(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return ficheiros(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("traduções de ativos", () => {
  it("pt e en têm exatamente as mesmas chaves", () => {
    expect(Object.keys(ativosTranslations.en).sort()).toEqual(Object.keys(ativosTranslations.pt).sort());
  });

  it("nenhum texto está vazio", () => {
    for (const lingua of ["pt", "en"] as const) for (const [k, v] of Object.entries(ativosTranslations[lingua])) expect(v.trim(), `${lingua} ${k}`).not.toBe("");
  });

  it("cada chave «ativos.*» escrita por extenso no código existe (um erro de escrita mostraria a chave crua no ecrã)", () => {
    const usadas = new Set<string>();
    for (const pasta of PASTAS) {
      for (const f of ficheiros(join(SRC, pasta))) {
        for (const m of readFileSync(f, "utf8").matchAll(/["'`](ativos\.[A-Za-z0-9_.]+|sidebar\.ativos)["'`]/g)) usadas.add(m[1]);
      }
    }
    const chaves = new Set(Object.keys(ativosTranslations.pt));
    // Prefixos com ${...} (tipos, estados, motivos, erros ATVnn) não se resolvem aqui: só as chaves completas.
    // `ativos.view` e `ativos.edit` são os códigos das permissões, não textos.
    const emFalta = [...usadas].filter((k) => !chaves.has(k) && !k.endsWith(".") && k !== "ativos.view" && k !== "ativos.edit");
    expect(emFalta).toEqual([]);
  });

  it("os textos dinâmicos existem para todos os valores possíveis (tipos, estados, motivos, erros)", () => {
    const pt = ativosTranslations.pt;
    const tem = (k: string) => expect(pt[k], k).toBeTruthy();
    for (const g of ["servico", "estrutura", "pessoa"]) { tem(`ativos.grupo.${g}`); tem(`ativos.grupo.${g}.curto`); tem(`ativos.vazio.titulo.${g}`); tem(`ativos.vazio.corpo.${g}`); }
    for (const x of ["telemovel", "portatil", "viatura", "fardamento", "ferramentas", "outro"]) tem(`ativos.tipo.pessoa.${x}`);
    for (const x of ["instalacoes", "mobiliario", "eletronica", "outro"]) tem(`ativos.tipo.estrutura.${x}`);
    for (const x of ["abatido", "vendido", "perdido", "outro"]) tem(`ativos.desativar.motivo.${x}`);
    for (const x of ["emUso", "desativado", "semEquipamento", "semPessoa"]) tem(`ativos.estado.${x}`);
    for (const x of ["ativos", "desativados", "todos"]) tem(`ativos.filtro.estado.${x}`);
    for (const x of ["comprado", "alugado"]) { tem(`ativos.forma.${x}`); tem(`ativos.forma.${x}.desc`); }
    for (const x of ["pagamento", "catalogo", "manual"]) { tem(`ativos.vida.origem.${x}`); tem(`ativos.vida.origem.${x}.desc`); }
    for (const x of ["alugadoSemFimDevolvido", "aluguerTerminadoEntregue"]) tem(`ativos.aviso.${x}`);
    for (let n = 2; n <= 37; n += 1) tem(`ativos.erro.ATV${String(n).padStart(2, "0")}`);
    for (const x of ["porUso", "semVida", "semPerda", "perdePouco", "perdePorMes", "aindaNaoComeca", "completa", "desativada"]) tem(`ativos.frase.${x}`);
  });
});
