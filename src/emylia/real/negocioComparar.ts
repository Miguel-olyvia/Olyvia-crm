// O Negocio como fica depois de ir à base e voltar (para comparar nos testes e no script da ida e volta pela base): datas no formato do
// motor, sem o que ainda não vai para a base (a obra, a demolição, o acesso ao portal) nem o que é só do ecrã.
import type { Negocio } from "../motor";
import { faturasAdenda } from "../adendas";
import { normalQ } from "./negocioReal";

/** O Negocio como fica depois da ida e volta: datas no formato do motor, sem o que ainda não vai para a base nem o que é só do ecrã. */
export function normalParaComparar(d0: Negocio, HOJE: Date): unknown {
  const d = structuredClone(d0) as Negocio & Record<string, unknown>;
  const q = (s: string | null | undefined) => normalQ(s, HOJE);
  delete d.fresh; delete d.valida; delete d.atraso; delete d.acesso;
  d.obra = { plano: null, mats: null, real: null, aprendido: false };
  d.quando = q(d.quando);
  d.hist = d.hist.map((e) => ({ ...e, q: q(e.q) }));
  if (d.anulado) d.anulado.q = q(d.anulado.q);
  delete (d.fin as Record<string, unknown>).erp;
  if (d.fin.fatura) d.fin.fatura.q = q(d.fin.fatura.q);
  if (d.fin.recibo) d.fin.recibo.q = q(d.fin.recibo.q);
  for (const t of d.fin.tranches ?? []) { t.data = t.data.slice(0, 10); if (t.pagamento) t.pagamento.data = t.pagamento.data.slice(0, 10); delete t.daDemo; }
  const o = d.orc;
  if (o) {
    delete o.demolicao;
    o.enviada = o.enviada ? q(o.enviada) : null;
    o.aceite = o.aceite ? q(o.aceite) : null;
    o.avisosVistos = Object.fromEntries(Object.entries(o.avisosVistos ?? {}).filter(([, x]) => x));
    if (o.assinatura) { o.assinatura.q = o.assinatura.q.replace(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2})$/, "$1/$2/$3 $4"); delete o.assinatura.imagem; }
    if (o.pedidoCliente) o.pedidoCliente.q = q(o.pedidoCliente.q);
    if (o.recusada) o.recusada.q = q(o.recusada.q);
    if (o.contratoPedido) o.contratoPedido.q = q(o.contratoPedido.q);
    if (o.contratoRevisto) o.contratoRevisto.q = q(o.contratoRevisto.q);
    for (const cv of o.contratoVersoes ?? []) { cv.substituido = q(cv.substituido); if (cv.revisto) cv.revisto.q = q(cv.revisto.q); }
    for (const v of o.versoes ?? []) {
      v.enviada = q(v.enviada); v.substituida = q(v.substituida); if (v.aceite) v.aceite = q(v.aceite);
      v.desconto ??= 0;
      // listas vazias numa versão são o mesmo que não existirem
      if (v.semParte && !v.semParte.length) delete v.semParte;
      if (v.prod && !v.prod.length) delete v.prod;
      // os totais das versões ficam na base ao cêntimo (a Emylia guarda-os sem arredondar)
      v.total = Math.round(v.total * 100) / 100; if (v.totalIva != null) v.totalIva = Math.round(v.totalIva * 100) / 100;
      for (const l of v.linhas ?? []) if (l.t === "svc" && l.det) l.det.q = q(l.det.q);
    }
    for (const l of o.linhas) if (l.t === "svc" && l.det) l.det.q = q(l.det.q);
    if (o.prazo && !Object.keys(o.prazo).length) delete o.prazo;
    // os opcionais a null são o mesmo que não existirem (o motor põe-nos a null depois de os usar)
    for (const k of ["pedidoCliente", "recusada", "contratoPedido", "contratoRevisto", "assinatura"] as const) if (o[k] === null) delete o[k];
  }
  // as adendas: as datas no formato do motor; os opcionais a null e as listas vazias são o mesmo que não existirem
  for (const a of d.adendas ?? []) {
    const fs = faturasAdenda(a); delete a.fatura; delete a.recibo; delete a.pag;
    if (fs.length) a.faturas = fs.map((f) => ({ ...f, q: q(f.q), ...(f.recibo ? { recibo: { ...f.recibo, q: q(f.recibo.q) } } : {}) })); else delete a.faturas;
    a.criada = q(a.criada);
    if (a.estado === "assinada") a.assinada = q(a.assinada ?? a.criada); else delete a.assinada;
    if (a.estado === "recusada") a.recusada = q(a.recusada ?? a.criada); else delete a.recusada;
    a.enviada = a.enviada ? q(a.enviada) : null; a.aceite = a.aceite ? q(a.aceite) : null;
    a.verif = !!a.verif; a.aprov ??= null;
    if (a.pedidoCliente) a.pedidoCliente.q = q(a.pedidoCliente.q);
    if (a.contratoPedido) a.contratoPedido.q = q(a.contratoPedido.q);
    if (a.contratoRevisto) a.contratoRevisto.q = q(a.contratoRevisto.q);
    if (a.assinatura) delete a.assinatura.imagem;
    for (const cv of a.contratoVersoes ?? []) { cv.substituido = q(cv.substituido); if (cv.revisto) cv.revisto.q = q(cv.revisto.q); }
    for (const v of a.versoes ?? []) { v.enviada = q(v.enviada); v.substituida = q(v.substituida); v.total = Math.round(v.total * 100) / 100; if (!v.desconto) delete v.desconto; }
    if (!a.desconto) delete a.desconto;
    if (!a.vista) delete a.vista;
    if (a.contrato !== "enviado") delete a.contrato;
    for (const k of ["pedidoCliente", "contratoPedido", "contratoRevisto", "assinatura", "clausulas", "recusa"] as const) if (a[k] == null) delete a[k];
    if (a.versoes && !a.versoes.length) delete a.versoes;
    if (a.contratoVersoes && !a.contratoVersoes.length) delete a.contratoVersoes;
    if (a.clausulas && !Object.keys(a.clausulas).length) delete a.clausulas;
  }
  if (d.adendas && !d.adendas.length) delete d.adendas;
  // o que não tem valor não volta (undefined / objetos vazios)
  const v = d.visita as Record<string, unknown>;
  for (const k of ["manter", "clienteCompra"]) if (v[k] && !Object.keys(v[k] as object).length) delete v[k];
  if (d.sug && !Object.keys(d.sug).length) delete d.sug;
  if (d.vis && !d.vis.length) delete d.vis;
  return JSON.parse(JSON.stringify(d));
}
