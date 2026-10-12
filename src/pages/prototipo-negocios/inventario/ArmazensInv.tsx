// Armazém › Armazéns: onde está o stock e as definições do inventário. Só armazéns ativos e que servem clientes entram na reserva FIFO das Encomendas Clientes;
// um armazém desligado continua a receber e guardar stock. Um só botão primário: "Novo armazém".
import { useState } from "react";
import { Plus } from "lucide-react";
import { Interruptor } from "../FiltrosPopover";
import { alternarArmazem, cpGeo, definirArmazemPorDefeito, eliminarArmazem, erosArmazem, guardarArmazem, restaurarArmazem, type DadosArmazem } from "./cadastros";
import { eur, produto } from "./base";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Dlg } from "./DialogosInv";
import { MovimentoDialogo } from "./MovimentoDialogo";
import { Lista, Nota, Pri, Sec, Selo, Texto } from "./pecasInv";
import type { Armazem, Inventario } from "./tipos";

const VAZIO: DadosArmazem = { name: "", code: "", addr: "", cp: "", city: "", manager: "", phone: "", email: "", cap: "", active: true, serves: true };

function Formulario({ id, aoFechar }: { id?: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const w = id ? db.warehouses.find((x) => x.id === id) : undefined;
  const [f, setF] = useState<DadosArmazem>(() => (w ? { name: w.name, code: w.code, addr: w.addr, cp: w.cp, city: w.city, manager: w.manager, phone: w.phone, email: w.email, cap: w.cap, active: w.active, serves: w.serves } : { ...VAZIO, code: "ARM-" + String(db.warehouses.length + 1).padStart(2, "0") }));
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState("");
  const e = erosArmazem(db, f, id ?? null), geo = cpGeo(f.cp);
  const m = (p: Partial<DadosArmazem>): void => { setF((x) => ({ ...x, ...p })); setErro(""); };
  const ver = (k: keyof typeof e): string | undefined => (tentou || (f[k] as string)?.trim() ? e[k] : undefined);
  const gravar = (): void => {
    setTentou(true);
    if (Object.keys(e).length) return;
    const r = agir((d) => guardarArmazem(d, f, id ?? null), "Armazém gravado.");
    if (r.ok) aoFechar(); else setErro(r.erro);
  };
  return (
    <Dlg aberto aoFechar={aoFechar} largo titulo={w ? `Editar ${w.name}` : "Novo armazém"} rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={gravar}>Gravar</Pri></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Texto rotulo="Nome" valor={f.name} aoMudar={(v) => m({ name: v })} erro={ver("name")} obrigatorio />
        <Texto rotulo="Código" valor={f.code} aoMudar={(v) => m({ code: v })} erro={ver("code")} obrigatorio />
        <Texto rotulo="Morada" valor={f.addr} aoMudar={(v) => m({ addr: v })} className="sm:col-span-2" />
        <Texto rotulo="Código postal" valor={f.cp} aoMudar={(v) => m({ cp: v })} erro={ver("cp")} atributos={{ placeholder: "0000-000", maxLength: 8 }} />
        <Texto rotulo="Cidade" valor={f.city} aoMudar={(v) => m({ city: v })} />
        <Texto rotulo="Gestor" valor={f.manager} aoMudar={(v) => m({ manager: v })} />
        <Texto rotulo="Telefone" tipo="tel" valor={f.phone} aoMudar={(v) => m({ phone: v })} />
        <Texto rotulo="Email" tipo="email" valor={f.email} aoMudar={(v) => m({ email: v })} erro={ver("email")} />
        <Texto rotulo="Capacidade" valor={f.cap} aoMudar={(v) => m({ cap: v })} />
      </div>
      <Nota tom="info">{geo ? <>Coordenadas obtidas pelo código postal: <b>{geo[0]}, {geo[1]}</b>. Servem para escolher o armazém mais próximo da morada do cliente.</> : "Indique o código postal (0000-000) para obter as coordenadas."}</Nota>
      <div className="flex flex-wrap gap-2">
        <Interruptor nome={f.active ? "Ativo" : "Inativo"} ativo={f.active} aoMudar={() => m({ active: !f.active })} />
        <Interruptor nome={f.serves ? "Serve clientes" : "Não serve clientes"} ativo={f.serves} aoMudar={() => m({ serves: !f.serves })} />
      </div>
      {erro && <Nota tom="bad" alerta>{erro}</Nota>}
    </Dlg>
  );
}

function Estatisticas(db: Inventario, w: Armazem): { prods: number; valor: number; alertas: number } {
  const rows = db.stocks.filter((s) => s.wh === w.id && !s.deleted);
  return { prods: rows.filter((r) => r.qty > 0).length, valor: rows.reduce((a, r) => a + r.qty * (produto(db, r.sku)?.avg || produto(db, r.sku)?.cost || 0), 0), alertas: rows.filter((r) => r.min && r.qty < r.min).length };
}

function Definicoes() {
  const { db, agir } = useCtxInv();
  const ded = db.settings.deduction;
  return (
      <section aria-labelledby="ar-def" className="grid gap-3">
        <h2 id="ar-def" className="text-lg font-semibold">Definições de inventário</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Lista rotulo="Armazém por defeito" valor={db.settings.defaultWh} aoMudar={(v) => agir((d) => definirArmazemPorDefeito(d, v), "Armazém por defeito atualizado.")} opcoes={db.warehouses.filter((w) => !w.deleted && w.active).map((w) => [w.id, w.name] as const)} ajuda="Usado na baixa por venda e em novas encomendas." />
          <fieldset className="grid gap-1"><legend className="text-[15px] text-muted-foreground">Momento da baixa de stock por venda</legend>
            {([["contract", "Contrato assinado"], ["proposal", "Proposta aceite"]] as const).map(([v, nome]) => (
              <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]"><input type="radio" name="ded" checked={ded === v} onChange={() => agir((d) => { d.settings.deduction = v; }, v === "contract" ? "Baixa no contrato assinado." : "Baixa na proposta aceite.")} className="h-5 w-5 accent-foreground" />{nome}</label>
            ))}
            <p className="text-[15px] text-muted-foreground">Nunca os dois. Uma linha que falha não bloqueia as outras; anular o contrato reverte as saídas.</p>
          </fieldset>
        </div>
      </section>
  );
}

type Dlg4 = { t: "form"; id?: string } | { t: "eliminar"; id: string } | { t: "mov"; wh: string };

export function ArmazensInv() {
  const { db, agir, ir } = useCtxInv();
  const [dlg, setDlg] = useState<Dlg4 | null>(null);
  const [eliminados, setEliminados] = useState(false);
  const lista = db.warehouses.filter((w) => eliminados || !w.deleted);
  const alvo = dlg?.t === "eliminar" ? db.warehouses.find((w) => w.id === dlg.id) : undefined;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <div className="flex flex-wrap items-center gap-2"><Interruptor nome="Ver eliminados" ativo={eliminados} aoMudar={() => setEliminados(!eliminados)} /><Pri onClick={() => setDlg({ t: "form" })}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Novo armazém</Pri></div>
      </div>
      <Definicoes />
      <ul className="divide-y divide-border rounded-xl border border-border">
        {lista.map((w) => {
          const st = Estatisticas(db, w);
          return (
            <li key={w.id} className={"grid gap-3 p-4" + (w.deleted ? " opacity-70" : "")}>
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold">{w.name}</h3><Selo>{w.code}</Selo>{db.settings.defaultWh === w.id && <Selo tom="info">Por defeito</Selo>}{w.deleted && <Selo>Eliminado</Selo>}</div>
              {!w.deleted && (
                <div className="flex flex-wrap gap-2">
                  <Interruptor nome={w.active ? "Ativo" : "Inativo"} ativo={w.active} aoMudar={() => agir((d) => alternarArmazem(d, w.id, "active", !w.active), w.active ? "Armazém desativado." : "Armazém ativado.")} />
                  <Interruptor nome={w.serves ? "Serve clientes" : "Não serve clientes"} ativo={w.serves} aoMudar={() => agir((d) => alternarArmazem(d, w.id, "serves", !w.serves), w.serves ? "Deixa de servir clientes." : "Passa a servir clientes.")} />
                </div>
              )}
              <dl className="grid gap-x-4 gap-y-1 text-[15px] sm:grid-cols-2 lg:grid-cols-3">
                {([["Morada", w.addr], ["Código postal", w.cp], ["Cidade", w.city], ["Gestor", w.manager], ["Telefone", w.phone], ["Email", w.email], ["Capacidade", w.cap], ["Coordenadas", w.lat ? `${w.lat}, ${w.lng}` : "sem código postal válido"]] as const).map(([r, v]) => <div key={r}><dt className="text-muted-foreground">{r}</dt><dd>{v || "—"}</dd></div>)}
              </dl>
              <p className="text-[15px]"><b className="tabular-nums">{st.prods}</b> produtos · <b className="tabular-nums">{eur(st.valor)}</b> de valor · <b className="tabular-nums">{st.alertas}</b> abaixo do mínimo</p>
              <div className="flex flex-wrap gap-2">
                <Sec onClick={() => ir({ aba: "stock", f: { wh: w.id, vista: "wh" } })}>Ver existências</Sec><Sec onClick={() => ir({ aba: "mov", f: { wh: w.id } })}>Movimentos</Sec>
                {w.deleted ? <Sec onClick={() => agir((d) => restaurarArmazem(d, w.id), "Armazém restaurado.")}>Restaurar</Sec> : <><Sec onClick={() => setDlg({ t: "mov", wh: w.id })}>Registar movimento</Sec><Sec onClick={() => setDlg({ t: "form", id: w.id })}>Editar</Sec><Sec onClick={() => setDlg({ t: "eliminar", id: w.id })}>Eliminar</Sec></>}
              </div>
            </li>
          );
        })}
      </ul>
      {dlg?.t === "form" && <Formulario id={dlg.id} aoFechar={() => setDlg(null)} />}
      {dlg?.t === "mov" && <MovimentoDialogo aberto aoFechar={() => setDlg(null)} pre={{ wh: dlg.wh }} />}
      {dlg?.t === "eliminar" && alvo && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Eliminar ${alvo.name}`} ok="Eliminar" perigo texto={<p>Só é possível sem stock, sem ser o armazém por defeito e sem encomendas clientes a expedir daqui.</p>} aoConfirmar={() => agir((d) => eliminarArmazem(d, alvo.id), "Armazém eliminado.")} />}
    </div>
  );
}
