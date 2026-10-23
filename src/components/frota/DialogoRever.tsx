// "Rever linhas do extrato": as linhas importadas com needs_review (km abaixo da última leitura) de uma importação, de
// uma viatura ou todas. Cada linha corrige-se (viatura, km, valor) e aceita-se ou rejeita-se pela RPC
// rpc_fleet_review_expense; ao gravar invalidam-se os custos e a importação, e o contador "Para rever" desce.
// NOTA: a RPC ainda não existe na BD (ver fleetTypes.ts). Enquanto não existir, a ação diz que não está disponível.
import { useState } from "react";
import { CircleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { FleetExpense } from "@/integrations/supabase/fleetTypes";
import { useFrotaCtx } from "./contexto";
import { Alerta, Campo, Nota } from "./campos";
import { Placa, Selo } from "./pecas";
import { CATEGORIAS_CUSTO, fData, fEur, fKm, numero, rpcFrota, viatura } from "./dados";

interface Edicao { vid: string; km: string; valor: string }
type ErrosLinha = Partial<Record<keyof Edicao | "geral", string>>;

const inteiro = (s: string): number | null => { const v = numero(s); return v == null ? null : Math.trunc(v); };

/** As linhas por rever: de uma importação (`imp`), de uma viatura (`vid`) ou todas. */
export function linhasPorRever(custos: readonly FleetExpense[], filtro: { imp?: string; vid?: string }): FleetExpense[] {
  return custos.filter((c) => c.needs_review && (!filtro.imp || c.import_id === filtro.imp) && (!filtro.vid || c.vehicle_id === filtro.vid))
    .sort((a, b) => a.spent_on.localeCompare(b.spent_on));
}

export function DialogoRever({ imp, vid, aoFechar }: { imp?: string; vid?: string; aoFechar: () => void }) {
  const { F, agir, pode } = useFrotaCtx();
  const perm = pode("custos");
  const linhas = linhasPorRever(F.custos, { imp, vid });
  const importacao = imp ? F.importacoes.find((i) => i.id === imp) : undefined;
  const [ed, setEd] = useState<Record<string, Edicao>>({});
  const [erros, setErros] = useState<Record<string, ErrosLinha>>({});
  const [aRejeitar, setARejeitar] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState<string | null>(null);

  const edicao = (c: FleetExpense): Edicao => ed[c.id] ?? { vid: c.vehicle_id, km: c.odometer_km != null ? String(c.odometer_km) : "", valor: String(c.amount) };
  const mudar = (c: FleetExpense, k: keyof Edicao, v: string): void => {
    setEd((o) => ({ ...o, [c.id]: { ...edicao(c), [k]: v } }));
    setErros((o) => ({ ...o, [c.id]: {} }));
  };
  const validar = (x: Edicao): ErrosLinha => {
    const e: ErrosLinha = {};
    if (!viatura(F, x.vid)) e.vid = "Escolhe a viatura.";
    const km = inteiro(x.km);
    if (x.km.trim() && (km == null || km < 0)) e.km = "Os km têm de ser um número igual ou maior do que 0 (ou ficar vazios).";
    if (!((numero(x.valor) ?? 0) > 0)) e.valor = "Indica o valor (maior do que 0).";
    return e;
  };

  const resolver = async (c: FleetExpense, aceitar: boolean): Promise<void> => {
    if (aGravar) return;
    if (!perm.ok) { setErros((o) => ({ ...o, [c.id]: { geral: perm.porque } })); return; }
    const x = edicao(c), v = viatura(F, x.vid), etiqueta = `${fData(c.spent_on)} (${fEur(c.amount)})`;
    if (aceitar) {
      const e = validar(x);
      if (Object.keys(e).length) { setErros((o) => ({ ...o, [c.id]: { ...e, geral: `Não foi gravado: ${Object.values(e)[0]}` } })); return; }
    }
    setAGravar(c.id);
    const r = await agir("rever", () => rpcFrota("rpc_fleet_review_expense", aceitar
      ? { p_expense_id: c.id, p_accept: true, p_vehicle_id: x.vid, p_km: inteiro(x.km), p_amount: numero(x.valor) }
      : { p_expense_id: c.id, p_accept: false, p_vehicle_id: null, p_km: null, p_amount: null }), {
      ok: aceitar ? `Linha de ${etiqueta} aceite na ${v?.plate ?? "viatura"}.` : `Linha de ${etiqueta} rejeitada: saiu dos custos.`,
    });
    setAGravar(null);
    setARejeitar(null);
    if (!r.ok) setErros((o) => ({ ...o, [c.id]: { geral: r.erro } }));
  };

  return (
    <Dialog open onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Rever linhas do extrato</DialogTitle>
          <DialogDescription>
            {importacao ? `${importacao.file_name}: ` : ""}linhas com km abaixo da última leitura. Corrige a viatura, os km ou o valor e aceita; ou rejeita a linha (sai dos custos).
          </DialogDescription>
        </DialogHeader>
        {linhas.length ? (
          <ul className="space-y-3" aria-label="Linhas por rever">
            {linhas.map((c) => {
              const x = edicao(c), e = erros[c.id] ?? {}, v = viatura(F, x.vid), km = inteiro(x.km);
              const plate = viatura(F, c.vehicle_id)?.plate ?? "";
              const rotulo = `${fData(c.spent_on)} da ${plate}`;
              return (
                <li key={c.id} className="space-y-3 rounded-lg border bg-card p-3" aria-label={`Linha de ${rotulo}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex flex-wrap items-center gap-1.5"><b>{fData(c.spent_on)}</b><Placa mat={plate} />{CATEGORIAS_CUSTO[c.category]}{c.supplier_label ? ` · ${c.supplier_label}` : ""}</span>
                    <Selo tom="warn">{c.review_reason ?? "Rever km"}</Selo>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo rotulo="Viatura" erro={e.vid}>
                      {(p) => <NativeSelect {...p} value={x.vid} onValueChange={(val) => mudar(c, "vid", val)} options={F.viaturas.map((w) => ({ value: w.id, label: `${w.plate} · ${w.make} ${w.model}` }))} />}
                    </Campo>
                    <Campo rotulo="Km" erro={e.km} ajuda={v ? `Última leitura: ${fKm(v.odometer_km)}` : undefined}>
                      {(p) => <Input {...p} type="number" min={0} inputMode="numeric" value={x.km} onChange={(ev) => mudar(c, "km", ev.target.value)} />}
                    </Campo>
                    <Campo rotulo="Valor (€)" erro={e.valor}>
                      {(p) => <Input {...p} type="number" min={0} step="0.01" inputMode="decimal" value={x.valor} onChange={(ev) => mudar(c, "valor", ev.target.value)} />}
                    </Campo>
                  </div>
                  {v && km != null && km < v.odometer_km ? (
                    <Nota icone={Info}>Os km continuam abaixo da última leitura da {v.plate}: ao aceitar, o custo conta mas o conta-quilómetros não muda.</Nota>
                  ) : null}
                  {e.geral ? <div role="alert"><Alerta tom="bad" icone={CircleAlert}>{e.geral}</Alerta></div> : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    {aRejeitar === c.id ? (
                      <>
                        <Button type="button" size="sm" variant="outline" onClick={() => setARejeitar(null)}>Voltar</Button>
                        <Button type="button" size="sm" variant="destructive" disabled={!!aGravar} onClick={() => void resolver(c, false)} aria-label={`Confirmar rejeição da linha de ${rotulo}`}>
                          Confirmar rejeição
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" size="sm" variant="outline" disabled={!!aGravar} aria-disabled={!perm.ok || undefined} title={perm.ok ? undefined : perm.porque}
                          onClick={() => setARejeitar(c.id)} aria-label={`Rejeitar a linha de ${rotulo}`}>Rejeitar</Button>
                        <Button type="button" size="sm" disabled={!!aGravar} aria-disabled={!perm.ok || undefined} title={perm.ok ? undefined : perm.porque}
                          onClick={() => void resolver(c, true)} aria-label={`Aceitar a linha de ${rotulo}`}>{aGravar === c.id ? "A gravar…" : "Aceitar"}</Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border bg-muted/40 p-4 text-sm" role="status">Não há linhas para rever{importacao ? " nesta importação" : ""}.</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
