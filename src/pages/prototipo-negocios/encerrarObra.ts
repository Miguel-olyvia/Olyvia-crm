// Encerrar a obra só com tudo completo (21/10/2026). A lista de verificação do fim da obra, em funções puras:
// · as tarefas todas feitas, validadas e sem correções abertas (a validação pede as horas e a fotografia, por isso
//   os registos ficam garantidos);
// · as mensagens do cliente respondidas;
// · os materiais todos chegados (nada em falta, por encomendar, encomendado ou a caminho no Inventário);
// · as adendas respondidas pelo cliente (nenhuma por assinar);
// · a segurança e as licenças tratadas;
// · os dados do fecho (vistoria, satisfação…), os campos do grupo "Fecho".
// O motor (A.fimObra) recusa com a mesma lista; a página da obra mostra-a, cada ponto a levar ao sítio onde se resolve.
import { type Estado, type Negocio } from "./motor";
import { OBRA, efetivo, emFalta } from "./campos";
import { estadoDe, materiaisPorFase, seguranca } from "./obraOps";
import { resumoEcNegocio } from "./inventario/ponteNegocios";
import { lerInventario } from "./inventario/loja";
import type { Inventario } from "./inventario/tipos";

/** Onde se resolve: uma secção da página da obra, ou os campos do fecho (no negócio). */
export type OndeEncerrar = "plano" | "validar" | "chat" | "mat" | "seg" | "fecho";
export interface PontoEncerrar { k: string; t: string; sub: string; ok: boolean; onde: OndeEncerrar }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const MAT_POR_CHEGAR = new Set(["em falta", "por encomendar", "encomendado", "a chegar"]);

/** Todos os pontos (feitos e por fazer), pela ordem em que se mostram. */
export function pontosEncerrar(d: Negocio, S?: Pick<Estado, "campos"> | null, db?: Inventario | null): PontoEncerrar[] {
  const p = d.obra.plano, T = p?.tasks ?? [];
  const porFazer = T.filter((t) => { const e = estadoDe(t); return e === "por fazer" || e === "em curso"; });
  const corrigir = T.filter((t) => estadoDe(t) === "corrigir");
  const validar = T.filter((t) => estadoDe(t) === "feita");
  const msgs = (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).length;
  const inv = d.obra.ec?.ref ? resumoEcNegocio(db ?? lerInventario(), d.obra.ec.ref) : null;
  const mats = materiaisPorFase(d, inv).flatMap((g) => g.itens).filter((m) => MAT_POR_CHEGAR.has(m.estado));
  const adendas = (d.adendas ?? []).filter((a) => a.estado === "enviada");
  const seg = seguranca(d).filter((x) => !x.ok);
  const fecho = emFalta([S ? efetivo(S.campos, OBRA[1]) : OBRA[1]], d.f);
  const nomes = (L: { nome: string }[]) => L.slice(0, 3).map((t) => t.nome).join(", ") + (L.length > 3 ? "…" : "");
  return [
    { k: "tarefas", onde: "plano", ok: !porFazer.length, t: "Todas as tarefas feitas",
      sub: porFazer.length ? `${porFazer.length === 1 ? "Falta" : "Faltam"} ${plural(porFazer.length, "tarefa", "tarefas")}: ${nomes(porFazer)}` : `${plural(T.length, "tarefa feita", "tarefas feitas")}` },
    { k: "correcoes", onde: "plano", ok: !corrigir.length, t: "Sem correções por fazer",
      sub: corrigir.length ? `${plural(corrigir.length, "tarefa a corrigir", "tarefas a corrigir")}: ${nomes(corrigir)}` : "Nenhuma correção aberta" },
    { k: "validar", onde: "validar", ok: !validar.length, t: "Tudo validado pelo responsável",
      sub: validar.length ? `${plural(validar.length, "tarefa espera", "tarefas esperam")} pela validação` : "As horas e as fotografias de cada tarefa conferidas" },
    { k: "mensagens", onde: "chat", ok: !msgs, t: "Mensagens do cliente respondidas",
      sub: msgs ? `${plural(msgs, "mensagem por responder", "mensagens por responder")}` : "Nada por responder" },
    { k: "materiais", onde: "mat", ok: !mats.length, t: "Materiais todos na obra",
      sub: mats.length ? `Por chegar: ${mats.slice(0, 3).map((m) => m.n).join(", ")}${mats.length > 3 ? "…" : ""}` : "Nada em falta nem a caminho" },
    ...(d.adendas?.length ? [{ k: "adendas", onde: "chat" as const, ok: !adendas.length, t: "Adendas respondidas pelo cliente",
      sub: adendas.length ? `${adendas.map((a) => a.n).join(", ")} por assinar no portal` : "Nenhuma adenda por assinar" }] : []),
    { k: "seguranca", onde: "seg", ok: !seg.length, t: "Segurança e licenças tratadas",
      sub: seg.length ? `Falta: ${seg.map((x) => x.t.toLowerCase()).join(", ")}` : "Tudo tratado" },
    { k: "fecho", onde: "fecho", ok: !fecho.length, t: "Dados do fecho",
      sub: fecho.length ? `Falta: ${fecho.map((c) => c.l.toLowerCase()).join(", ")}` : "Vistoria, satisfação e notas preenchidas" },
  ];
}

/** O que falta para encerrar (vazio = pode), em palavras curtas, sem os dados do fecho (o motor pede-os à parte, no portão). */
export function faltaParaEncerrar(d: Negocio, S?: Pick<Estado, "campos"> | null, db?: Inventario | null): string[] {
  return pontosEncerrar(d, S, db).filter((x) => !x.ok && x.onde !== "fecho").map((x) => x.t.toLowerCase());
}

/** Para simular o fim (o botão "simular" do protótipo antigo e os testes): as tarefas feitas e validadas, com horas e fotografia,
 *  as mensagens lidas e a segurança tratada. Não mexe nos materiais do Inventário nem nas adendas. */
export function completarParaEncerrar(d: Negocio, q = "hoje") {
  for (const t of d.obra.plano?.tasks ?? []) {
    const e = t.exec;
    t.exec = { ...(e ?? { horas: 0, fotos: [] }), estado: "validada", horas: e?.horas || t.h, fotos: e?.fotos.length ? e.fotos : ["exemplo"], validada: q };
  }
  for (const m of d.obra.chat ?? []) m.lida = true;
  d.obra.seg ??= {};
  for (const x of seguranca(d)) if (!x.ok) d.obra.seg[x.k] = q;
}
