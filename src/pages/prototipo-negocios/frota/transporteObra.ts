// A viatura ligada a uma obra e o transporte dos materiais por fases (16/10/2026). Sem React.
// · A ligação viatura ↔ obra vive na Frota (Frota.ligObras, guardada no localStorage como o resto da Frota).
// · O transporte é do Inventário novo e usa SÓ as regras que lá existem: "Carregar" uma fase é uma transferência (transferir, stock.ts) do armazém
//   da encomenda de cliente para o armazém móvel da viatura; "Entregar na obra" é a saída da linha da EC a partir da carrinha (sairLinha, ec.ts).
// · O estado de cada fase lê-se dos movimentos do Inventário (nunca se guarda à parte): por carregar → na carrinha → entregue.
// · Decisões: liga-se sempre (mesmo com a obra por preparar), mas só se carrega com a obra pronta (encomenda de cliente toda em armazém, ou já saída,
//   e plano aprovado); não se desliga com material dessa obra na carrinha (entrega-se primeiro), para não ficar stock perdido.
import { FASES_OBRA } from "../fasesObra";
import { faseDoMaterial } from "../obraOps";
import { nomeProd, produto } from "../inventario/base";
import { ecLinhaInfo, sairLinha } from "../inventario/ec";
import { docFase, ecDoNegocio, resumoEcNegocio } from "../inventario/ponteNegocios";
import { transferir } from "../inventario/stock";
import { falhar as falharInv } from "../inventario/base";
import type { Ec, EcLinha, Inventario } from "../inventario/tipos";
import { HOJE, falhar } from "./base";
import type { Frota, ObraRef, Viatura } from "./tipos";

export type EstadoFase = "por carregar" | "na carrinha" | "entregue";
export interface LinhaFase { lineId: string; sku: string; n: string; qty: number; un: string; falta: number }
export interface FaseTransporte { fase: number; nome: string; linhas: LinhaFase[]; estado: EstadoFase; carrinha: string | null }

/** A etiqueta dos movimentos de uma fase (doc dos movimentos no Inventário): "EC-1027 · fase 3". Mora na ponte (a ponte lê-a, sem ciclo). */
export { docFase };

/** As ligações de uma viatura ou de uma obra. */
export const ligacoesViatura = (F: Frota, vid: string) => (F.ligObras ?? []).filter((x) => x.vid === vid);
export const ligacoesObra = (F: Frota, obra: number) => (F.ligObras ?? []).filter((x) => x.obra === obra);

const ecDaObra = (inv: Inventario, o: Pick<ObraRef, "ec">): Ec | undefined => (o.ec ? ecDoNegocio(inv, o.ec) : undefined);

/** As fases do plano com os materiais da encomenda de cliente (cada linha na fase em que entra) e o estado de cada uma, lido dos movimentos. */
export function fasesTransporte(inv: Inventario, o: Pick<ObraRef, "ec">): FaseTransporte[] {
  const e = ecDaObra(inv, o);
  if (!e || e.deleted) return [];
  const porFase = new Map<number, EcLinha[]>();
  for (const l of e.lines) {
    if (!l.sku || l.voided) continue;
    const f = faseDoMaterial(nomeProd(inv, l.sku));
    porFase.set(f, [...(porFase.get(f) ?? []), l]);
  }
  return [...porFase.keys()].sort().map((f) => {
    const L = porFase.get(f)!;
    const doc = docFase(e.id, f);
    const carregado = inv.moves.filter((m) => m.type === "tin" && m.doc === doc);
    const entregue = L.every((l) => l.served >= l.qty);
    return {
      fase: f, nome: FASES_OBRA[f - 1]?.curto ?? `Fase ${f}`,
      linhas: L.map((l) => ({ lineId: l.id, sku: l.sku!, n: nomeProd(inv, l.sku!), qty: l.qty, un: produto(inv, l.sku!)?.unit ?? "un", falta: Math.max(0, l.qty - l.served) })),
      estado: entregue ? "entregue" : carregado.length ? "na carrinha" : "por carregar",
      carrinha: carregado[0]?.wh ?? null,
    };
  });
}

/** A obra está pronta para carregar? A encomenda de cliente toda em armazém (ou já saída) e o plano aprovado. Devolve o que falta. */
export function faltaParaCarregar(inv: Inventario, o: Pick<ObraRef, "ec" | "estado">): string[] {
  const F: string[] = [];
  const r = o.ec ? resumoEcNegocio(inv, o.ec) : null, e = ecDaObra(inv, o);
  if (!r || r.eliminada || !e) F.push("a encomenda de cliente no Inventário (emite-se ao validar o pagamento)");
  // cada linha: já saiu, está pronta a sair no armazém, ou vai numa fase já carregada (o mesmo critério do arranque da obra: ponteNegocios.ts)
  else if (!r.pronta) F.push("receber no armazém todos os materiais da encomenda de cliente");
  if (o.estado === "por aprovar") F.push("aprovar o plano da obra");
  return F;
}
export const obraPronta = (inv: Inventario, o: Pick<ObraRef, "ec" | "estado">): boolean => !faltaParaCarregar(inv, o).length;

/** Há material desta obra a bordo de alguma carrinha (carregado e ainda não entregue)? */
export const materialNaCarrinha = (inv: Inventario, o: Pick<ObraRef, "ec">): boolean => fasesTransporte(inv, o).some((f) => f.estado === "na carrinha");

/* ------------------------------------------------------------------ na Frota */
/** Liga a viatura à obra (sempre: carregar é que espera pela obra pronta). */
export function ligarObra(F: Frota, vid: string, obra: number): void {
  if (!F.viaturas.some((v) => v.id === vid)) falhar("Viatura inexistente.");
  if ((F.ligObras ?? []).some((x) => x.vid === vid && x.obra === obra)) falhar(`A viatura já está ligada à obra #${obra}.`);
  (F.ligObras ??= []).push({ vid, obra, at: HOJE });
}
/** Desliga a viatura da obra; recusa com material dessa obra na carrinha (entrega-se primeiro: não fica stock perdido). */
export function desligarObra(F: Frota, inv: Inventario, vid: string, o: Pick<ObraRef, "id" | "ec">): void {
  if (materialNaCarrinha(inv, o)) falhar(`Há material da obra #${o.id} na carrinha: entregue-o na obra antes de desligar.`);
  F.ligObras = (F.ligObras ?? []).filter((x) => !(x.vid === vid && x.obra === o.id));
}

/* ------------------------------------------------------------------ no Inventário (corre dentro de executar do Inventário) */
const faseDe = (inv: Inventario, o: Pick<ObraRef, "ec">, fase: number): { e: Ec; f: FaseTransporte } => {
  const e = ecDaObra(inv, o);
  const f = fasesTransporte(inv, o).find((x) => x.fase === fase);
  if (!e || !f) return falharInv("Fase sem materiais nesta obra.");
  return { e, f };
};

/** "Carregar": transfere os materiais da fase do armazém da encomenda para a carrinha da viatura (transferir, as regras do Inventário). */
export function carregarFase(inv: Inventario, o: Pick<ObraRef, "id" | "ec" | "estado">, v: Viatura, fase: number): void {
  const falta = faltaParaCarregar(inv, o);
  if (falta.length) falharInv("A obra ainda não está pronta: falta " + falta.join(" e ") + ".");
  if (!v.armazem || !v.armazemId || !inv.warehouses.some((w) => w.id === v.armazemId && !w.deleted)) falharInv(`A viatura ${v.mat} não é armazém móvel: não leva material.`);
  const { e, f } = faseDe(inv, o, fase);
  if (f.estado !== "por carregar") falharInv(`A fase ${fase} já está ${f.estado}.`);
  for (const l of f.linhas) if (l.falta > 0) {
    const el = e.lines.find((x) => x.id === l.lineId)!;
    // só o que está pronto a sair para esta linha (a reserva da encomenda), nunca o stock livre de outros
    if (ecLinhaInfo(inv, e, el).ready < l.falta) falharInv(`${l.n}: não há ${l.falta} ${l.un} prontos a sair no armazém.`);
    transferir(inv, l.sku, e.wh, v.armazemId, l.falta, { doc: docFase(e.id, fase), note: `Carregar na carrinha ${v.mat} · obra #${o.id}` });
  }
}

/** "Entregar na obra": a saída das linhas da fase a partir da carrinha (sairLinha, a saída para o cliente da encomenda). */
export function entregarFase(inv: Inventario, o: Pick<ObraRef, "id" | "ec">, fase: number): void {
  const { e, f } = faseDe(inv, o, fase);
  if (f.estado !== "na carrinha" || !f.carrinha) falharInv(`A fase ${fase} não está na carrinha.`);
  for (const l of f.linhas) if (l.falta > 0) sairLinha(inv, e, e.lines.find((x) => x.id === l.lineId)!, l.falta, f.carrinha);
}
