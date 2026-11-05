// 5/11 (Rúben: «sim, liga-os»): as necessidades do Estúdio, prontas a levar para o negócio. Cada linha diz o que é (a «chave»: uma
// sanita, um revestimento, retirar, canalização, um serviço…), as cores do produto e a peça a que pertence; o negócio procura o par no
// Catálogo verdadeiro (emylia/ligarEstudio.ts).
import type { LinhaLevada } from "@/emylia/ligarEstudio";
import { produto } from "./catalogoFake";
import { necessidades, type Projeto } from "./necessidadesEstudio";

/** A chave dos trabalhos pelo começo do id da linha (necessidadesEstudio.ts). */
const TRABALHO: [RegExp, string][] = [
  [/^ret-/, "retirar"], [/^dem$/, "demolicao"], [/^agua-/, "agua"], [/^canal$/, "canalizacao"], [/^ele-/, "eletrico"],
  [/^rev-inst$/, "revestimento"], [/^pav-inst$/, "pavimento"], [/^teto$/, "teto"], [/^prot$/, "protecoes"],
];
/** Os serviços do Estúdio (catalogoFake.SERVICOS) pela chave do Catálogo verdadeiro. */
const SERVICO: Record<string, string> = {
  "sv-imperm": "imperm", "sv-nicho": "nicho", "sv-pintura-teto": "pintura", "sv-estores": "estores", "sv-tomada": "tomada", "sv-aplique": "aplique",
  "sv-ventilador": "ventilador", "sv-eletrica": "eletrica", "sv-reboco": "reboco", "sv-rodape": "rodape", "sv-limpeza": "limpeza",
};

export function linhasParaLevar(p: Projeto): LinhaLevada[] {
  const tipoDaPeca = (id: string) => p.depois.pecas.find((x) => x.id === id)?.tipo ?? (p.porColocar ?? []).find((x) => x.id === id)?.tipo;
  const produtoDaPeca = (id: string) => produto(p.escolhas[id] ?? (p.porColocar ?? []).find((x) => x.id === id)?.produto);
  const out: LinhaLevada[] = [];
  for (const l of necessidades(p)) {
    if (l.fora) continue;
    const base = { id: l.id, n: l.n, q: l.q, un: l.un };
    let m: RegExpMatchArray | null;
    if ((m = l.id.match(/^prod-(.+)$/))) {
      const prod = produtoDaPeca(m[1]), tipo = tipoDaPeca(m[1]);
      if (tipo) out.push({ ...base, tipo: "produto", chave: prod?.cat ?? tipo, cores: prod?.cores, par: m[1] });
    } else if ((m = l.id.match(/^acomp-(.+)-(coluna_duche|resguardo|torneira)$/))) {
      const pecaId = m[1], cat = m[2];
      const id = p.acompanha[pecaId]?.[cat as "coluna_duche"] ?? (p.porColocar ?? []).find((x) => x.id === pecaId)?.acompanha?.[cat as "coluna_duche"];
      out.push({ ...base, tipo: "produto", chave: cat, cores: produto(id)?.cores, par: pecaId });
    } else if (l.id === "rev" || l.id === "pav") {
      const prod = produto(l.id === "rev" ? p.revestimento : p.pavimento);
      out.push({ ...base, tipo: "produto", chave: l.id === "rev" ? "revestimento" : "pavimento", cores: prod?.cores });
    } else if ((m = l.id.match(/^inst-(.+)$/))) {
      const tipo = tipoDaPeca(m[1]);
      if (tipo) out.push({ ...base, tipo: "servico", chave: `instalar:${tipo}`, par: m[1] });
    } else if ((m = l.id.match(/^ret-(.+)$/))) {
      const tipo = tipoDaPeca(m[1]) ?? p.antes.pecas.find((x) => x.id === m![1])?.tipo;
      out.push({ ...base, tipo: "servico", chave: tipo ? `retirar:${tipo}` : "retirar", par: m[1] });
    } else if ((m = l.id.match(/^serv-(.+)$/))) {
      out.push({ ...base, tipo: "servico", chave: SERVICO[m[1]] ?? m[1] });
    } else {
      const t = TRABALHO.find(([rx]) => rx.test(l.id));
      if (t) out.push({ ...base, tipo: "servico", chave: t[1] });
    }
  }
  return out;
}
