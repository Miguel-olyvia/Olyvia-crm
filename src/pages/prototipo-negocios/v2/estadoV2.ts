// O que a V2 guarda por cima do motor, em memória (não vai para o localStorage nem mexe na VERSAO):
// por obra, as validações, as rejeições, os atrasos e a aprovação; por negócio, as faturas registadas (tranches).
// Fica preso ao objeto Estado (WeakMap): "Repor a demonstração" cria um Estado novo e isto recomeça sozinho.
// Muda-se sempre dentro de ctx.run/ctx.go, para o ecrã se redesenhar.
import type { Estado, Negocio } from "../motor";
import { tranchesDoPlano, daFaturaUnica, type FaturaReg } from "./financeiro";
import { OPCOES_INICIO, regVazio, type RegObra } from "./operacoes";
import { totais } from "../DocsCliente";

interface Loja { obras: Map<number, RegObra>; fin: Map<number, FaturaReg[]> }
const LOJA = new WeakMap<Estado, Loja>();

function loja(S: Estado): Loja {
  let l = LOJA.get(S);
  if (!l) { l = { obras: new Map(), fin: new Map() }; LOJA.set(S, l); }
  return l;
}

export const hojeISO = (): string => new Date().toISOString().slice(0, 10);

/** O registo da obra. Na primeira vez: uma obra concluída vem toda validada; o supervisor e a data vêm do negócio (sugestão). */
export function regObra(S: Estado, d: Negocio): RegObra {
  const l = loja(S);
  let r = l.obras.get(d.id);
  if (!r) {
    const p = d.obra.plano;
    r = regVazio();
    if (p?.estado === "concluída") r.validadas = p.tasks.map((_, i) => i);
    r.aprovacao = { supervisor: d.f.responsavel || "", inicio: d.f.inicio || OPCOES_INICIO[0].iso };
    // um atraso de exemplo na obra em curso da demonstração, para o Hoje do supervisor não vir vazio
    if (d.id === 1022 && p?.estado === "em curso") {
      const i = p.tasks.findIndex((t) => t.nome.startsWith("Revestimento"));
      if (i >= 0) r.atrasos = [{ id: "a1", tarefa: i, dias: 1, motivo: "Material em falta", clienteAvisado: false, exemplo: true }];
    }
    l.obras.set(d.id, r);
  }
  return r;
}
export function guardarObra(S: Estado, id: number, r: RegObra): void { loja(S).obras.set(id, r); }

export const totalComIva = (S: Estado, d: Negocio): number => totais(d, S).total;
/** 19/10: as mesmas prestações da proposta e do portal ("Por fases" com as guardadas no orçamento). */
export const tranchesDe = (d: Negocio) => tranchesDoPlano(d.f.pagamento, d.orc?.pagFases);

/**
 * As faturas registadas do negócio. Se o motor já tem a fatura única (a demonstração, ou o botão do passo "Emitir fatura"),
 * ela entra como a 1.ª tranche; se o motor já validou o pagamento (o botão do passo), a fatura fica paga com o recibo dele.
 */
export function faturasDe(S: Estado, d: Negocio): FaturaReg[] {
  const l = loja(S);
  let fs = l.fin.get(d.id);
  if (!fs || (!fs.length && d.fin.fatura)) {
    fs = daFaturaUnica(d.fin, tranchesDe(d), totalComIva(S, d), hojeISO(), d.f.data_pag, d.f.conta, d.f.comprovativo);
    l.fin.set(d.id, fs);
  } else if (d.fin.recibo && !fs.some((f) => f.recibo === d.fin.recibo!.n)) {
    // o motor validou por fora (o botão do passo): a fatura do motor, ou a primeira por pagar, fica paga
    const alvo = fs.find((f) => f.numero === d.fin.fatura?.n && !f.pagamento) ?? fs.find((f) => !f.pagamento);
    if (alvo) {
      fs = fs.map((f) => (f === alvo ? { ...f, pagamento: { data: d.f.data_pag || hojeISO(), conta: d.f.conta || "", ref: d.f.comprovativo || "" }, recibo: d.fin.recibo!.n } : f));
      l.fin.set(d.id, fs);
    }
  }
  return fs;
}
export function guardarFaturas(S: Estado, id: number, fs: FaturaReg[]): void { loja(S).fin.set(id, fs); }
