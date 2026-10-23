// Os 13 diálogos da Frota (objeto DLG do protótipo HTML), com os mesmos campos, textos e validações. A moldura é a do Inventário (shadcn Dialog
// com as classes .dlg/.dh/.db/.df), mas com o contexto da Frota. Gravar valida (erros por campo, foco no primeiro) e corre a ação numa cópia da base.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, CircleAlert, CircleCheck, FileSpreadsheet, History, Info, Paperclip, TriangleAlert, UserRoundSearch, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SEM_ATALHOS } from "../useAtalhos";
import { Lista, Notas, Selo, Texto } from "../inventario/pecasInv";
import { HOJE, fData, fEur, fKm, fNum } from "./base";
import {
  LINHAS_EXTRATO, FICHEIRO_EXTRATO, validarImportar, gravarAbastecer, gravarAtribuir, gravarConcluir, gravarDespesa, gravarDevolver, gravarEstado, gravarIdentificar, gravarImportar, gravarKm, gravarManut,
  gravarNova, gravarOcorrencia, gravarRenovar, iniAbastecer, iniAtribuir, iniConcluir, iniDespesa, iniDevolver, iniEstado, iniIdentificar, iniKm, iniManut, iniNova,
  iniOcorrencia, iniRenovar, validarAbastecer, validarAtribuir, validarConcluir, validarDespesa, validarDevolver, validarEstado, validarIdentificar, validarKm, validarManut,
  validarNova, validarOcorrencia, validarRenovar, verificarLinha, type Erros, type Vals,
} from "./acoes";
import { useCtxFrota, type DadosDlg, type TipoDlg } from "./ctxFrota";
import { pode, porqueNao } from "./perfil";
import { Placa, SeloEstado, Src } from "./pecasFrota";
import { nomeObra } from "./pontes";
import { criarArmazemCarrinha } from "./pontesInv";
import { ESTADOS, VENC, atribEm, cartaOk, pessoa, prazoMulta, quemConduzia, viatura } from "./regras";
import { CENTROS, OFICINAS, POSTOS, TIPOS_CUSTO, centroObra } from "./seed";
import type { ChaveVenc, Frota } from "./tipos";

/** O aviso da Frota (região aria-live), com ícone: nunca só cor. Fica sempre no DOM. */
export function AvisoFrota() {
  const { aviso } = useCtxFrota();
  const I = aviso?.erro ? TriangleAlert : Info;
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className={cn(aviso ? "flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-[15px]" : "sr-only")}>
      {aviso && <I className={cn("mt-0.5 h-4 w-4 shrink-0", aviso.erro ? "text-destructive" : "text-sky-700")} aria-hidden="true" />}
      {aviso?.texto}
    </p>
  );
}

interface DlgProps { aberto: boolean; aoFechar: () => void; titulo: string; largo?: boolean; children: ReactNode; rodape: ReactNode; aoSubmeter?: () => void }
/** Um diálogo: título (recebe o foco), corpo que rola e rodapé (Cancelar à esquerda, o primário no fim). */
export function DlgF({ aberto, aoFechar, titulo, largo, children, rodape, aoSubmeter }: DlgProps) {
  const { fontes } = useCtxFrota();
  const corpo = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent hideClose {...{ [SEM_ATALHOS]: "" }} className={cn("inv-root dlg !flex !max-w-none !flex-col !gap-0 !border-0 !p-0", largo && "wide", fontes && "show-src")}
        onOpenAutoFocus={(e) => { e.preventDefault(); corpo.current?.closest("[role=dialog]")?.querySelector<HTMLElement>("h2")?.focus(); }}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); aoSubmeter?.(); }} style={{ display: "contents" }}>
          <div className="dh">
            <div><DialogTitle tabIndex={-1} style={{ outline: "none" }}>{titulo}</DialogTitle><DialogDescription className="sr">{titulo}</DialogDescription></div>
            <button type="button" className="btn btn-ghost btn-icon" onClick={aoFechar} aria-label="Fechar"><X className="ic" aria-hidden="true" /></button>
          </div>
          <div className="db" ref={corpo}>{children}</div>
          <div className="df">{rodape}</div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmar uma ação sem campos (por exemplo "Repor a demonstração"). */
export function ConfirmarF({ aberto, aoFechar, titulo, texto, ok, perigo, aoConfirmar }: { aberto: boolean; aoFechar: () => void; titulo: string; texto: ReactNode; ok: string; perigo?: boolean; aoConfirmar: () => void }) {
  return (
    <DlgF aberto={aberto} aoFechar={aoFechar} titulo={titulo} aoSubmeter={() => { aoConfirmar(); aoFechar(); }}
      rodape={<><button type="button" className="btn left" onClick={aoFechar}>Cancelar</button><button type="submit" className={cn("btn", perigo ? "btn-danger" : "btn-p")}>{ok}</button></>}>
      {texto}
    </DlgF>
  );
}

const AlertaF = ({ tom, icone: I, children }: { tom: "ok" | "bad" | "warn" | "info"; icone: typeof Info; children: ReactNode }) => (
  <div className={cn("alert", tom)}><I className="ic" aria-hidden="true" /><span>{children}</span></div>
);
const NotaMuted = ({ icone: I = Info, children }: { icone?: typeof Info; children: ReactNode }) => (
  <p className="muted"><I className="ic sm" aria-hidden="true" /> {children}</p>
);

interface Def {
  titulo: string; ok: string; largo?: boolean;
  ini: (F: Frota, d: DadosDlg) => Vals;
  validar: (F: Frota, x: Vals) => Erros;
  gravar: (F: Frota, x: Vals) => string;
}
const DEFS: Record<Exclude<TipoDlg, "nova">, Def> = {
  atribuir: { titulo: "Atribuir viatura", ok: "Atribuir", ini: (F, d) => iniAtribuir(F, d), validar: validarAtribuir, gravar: gravarAtribuir },
  devolver: { titulo: "Devolver viatura", ok: "Registar devolução", ini: (F, d) => iniDevolver(F, d.a ?? ""), validar: validarDevolver, gravar: gravarDevolver },
  km: { titulo: "Registar km", ok: "Registar", ini: (_F, d) => iniKm(d.v ?? ""), validar: validarKm, gravar: gravarKm },
  abastecer: { titulo: "Registar abastecimento", ok: "Registar", ini: (F, d) => iniAbastecer(F, d.v), validar: validarAbastecer, gravar: gravarAbastecer },
  despesa: { titulo: "Registar despesa", ok: "Registar", ini: (_F, d) => iniDespesa(d.v), validar: validarDespesa, gravar: gravarDespesa },
  importar: { titulo: "Importar extrato do cartão frota", ok: `Importar ${LINHAS_EXTRATO.length} linhas`, largo: true, ini: () => ({}), validar: (F) => validarImportar(F), gravar: (F) => gravarImportar(F) },
  manut: { titulo: "Agendar manutenção", ok: "Agendar", ini: (_F, d) => iniManut(d.v), validar: validarManut, gravar: gravarManut },
  concluir: { titulo: "Concluir intervenção", ok: "Concluir", ini: (F, d) => iniConcluir(F, d.m ?? ""), validar: validarConcluir, gravar: gravarConcluir },
  estado: { titulo: "Mudar estado da viatura", ok: "Mudar estado", ini: (F, d) => iniEstado(F, d.v ?? ""), validar: validarEstado, gravar: gravarEstado },
  ocorrencia: { titulo: "Registar ocorrência", ok: "Registar", ini: (_F, d) => iniOcorrencia(d.v), validar: validarOcorrencia, gravar: gravarOcorrencia },
  identificar: { titulo: "Identificar condutor", ok: "Identificar e notificar", ini: (F, d) => iniIdentificar(F, d.o ?? ""), validar: validarIdentificar, gravar: gravarIdentificar },
  renovar: { titulo: "Renovar documento", ok: "Guardar", ini: (F, d) => iniRenovar(F, d.v ?? "", (d.k ?? "seguro") as ChaveVenc), validar: validarRenovar, gravar: gravarRenovar },
};

/** O diálogo aberto. `aoCriar` recebe o id de uma viatura nova (para abrir a ficha dela). */
export function DialogoFrota({ tipo, dados, aoFechar, aoCriar }: { tipo: TipoDlg; dados: DadosDlg; aoFechar: () => void; aoCriar?: (vid: string) => void }) {
  const ctx = useCtxFrota();
  const { F, agir, agirInv } = ctx;
  const def: Def = tipo === "nova"
    ? { titulo: "Nova viatura", ok: "Criar viatura", largo: true, ini: () => iniNova(), validar: validarNova, gravar: () => "" }
    : DEFS[tipo];
  const [x, setX] = useState<Vals>(() => def.ini(F, dados));
  const [e, setE] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState("");
  const [focar, setFocar] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focar) return;
    const p = caixa.current?.closest("[role=dialog]")?.querySelector(".ferr");
    p?.parentElement?.querySelector<HTMLElement>("input,select,textarea")?.focus();
  }, [focar]);
  const muda = (k: string) => (v: string): void => {
    setX((o) => {
      const n = { ...o, [k]: v };
      // ao escolher a viatura na atribuição, os km da entrega passam a ser os dela
      if (tipo === "atribuir" && k === "vid") { const w = viatura(F, v); if (w) n.km = String(w.km); }
      return n;
    });
    setErroGeral("");
  };
  const submeter = (): void => {
    const erros = def.validar(F, x);
    setE(erros);
    // os erros que não são de um campo (a atribuição já devolvida, o extrato já importado…) vão para o aviso do diálogo
    const geral = Object.keys(erros).find((k) => GERAIS.includes(k));
    if (geral) setErroGeral(erros[geral]);
    if (Object.keys(erros).length) { setFocar((n) => n + 1); return; }
    if (tipo === "nova") {
      // primeiro a permissão e as validações (já feitas acima); só depois o armazém móvel no Inventário (se pedido) e a viatura na Frota, ligada a ele
      if (!pode(ctx.perfil, "nova")) { setErroGeral(porqueNao(ctx.perfil)); return; }
      let armazemId: string | null = null;
      if (x.armazem) {
        const r = agirInv((inv) => criarArmazemCarrinha(inv, x.mat.trim().toUpperCase(), x.cidade?.trim() ?? ""));
        if (!r.ok) { setErroGeral(r.erro); return; }
        armazemId = r.valor;
      }
      const r = agir((G) => gravarNova(G, x, armazemId), `Viatura ${x.mat.toUpperCase()} criada${x.armazem ? " com armazém móvel" : ""}${x.agenda ? " e recurso de agenda" : ""}.`);
      if (!r.ok) { setErroGeral(r.erro); return; }
      aoFechar();
      aoCriar?.(r.valor);
      return;
    }
    const r = agir((G) => def.gravar(G, x), (msg) => msg);
    if (r.ok) aoFechar(); else setErroGeral(r.erro);
  };
  return (
    <DlgF aberto aoFechar={aoFechar} titulo={def.titulo} largo={def.largo} aoSubmeter={submeter}
      rodape={<><button type="button" className="btn left" onClick={aoFechar}>Cancelar</button><button type="submit" className="btn btn-p">{def.ok}</button></>}>
      <div ref={caixa} className="stack" style={{ gap: 12 }}>
        <Corpo tipo={tipo} x={x} e={e} muda={muda} />
        {erroGeral ? <div role="alert" className="alert bad"><CircleAlert className="ic" aria-hidden="true" /><span>{erroGeral}</span></div> : null}
      </div>
    </DlgF>
  );
}

const opcoes = (l: readonly string[]): [string, string][] => l.map((t) => [t, t]);
/** As chaves de erro que não são campos do formulário. */
const GERAIS = ["a", "m", "o", "extrato"];

function Corpo({ tipo, x, e, muda }: { tipo: TipoDlg; x: Vals; e: Erros; muda: (k: string) => (v: string) => void }) {
  const { F, visiveis, obras } = useCtxFrota();
  const optsViaturas = (soAtivas = true): [string, string][] => visiveis.filter((v) => !soAtivas || v.estado === "ativa").map((v) => [v.id, `${v.mat} · ${v.marca} ${v.modelo}`]);
  const optsAtivas = (): [string, string][] => visiveis.filter((v) => v.estado !== "vendida" && v.estado !== "inativa").map((v) => [v.id, `${v.mat} · ${v.modelo}`]);
  const num = (k: string, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, ajuda?: string) =>
    <Texto rotulo={rotulo} valor={x[k] ?? ""} aoMudar={muda(k)} tipo="number" erro={e[k]} ajuda={ajuda} atributos={{ min: 0, ...extra }} />;
  const data = (k: string, rotulo: string, ajuda?: string, tipoInput = "date") => <Texto rotulo={rotulo} valor={x[k] ?? ""} aoMudar={muda(k)} tipo={tipoInput} erro={e[k]} ajuda={ajuda} />;
  const sel = (k: string, rotulo: string, ops: readonly (readonly [string, string])[], ajuda?: string, className?: string) =>
    <Lista rotulo={rotulo} valor={x[k] ?? ""} aoMudar={muda(k)} opcoes={ops} erro={e[k]} ajuda={ajuda} className={className} />;
  const v = viatura(F, x.vid ?? "");

  switch (tipo) {
    case "atribuir": {
      const p = pessoa(F, x.pid), aviso = v && p ? cartaOk(p, v, x.ini || HOJE) : null;
      const motivos: [string, string][] = [["", "Sem motivo"]];
      for (const o of obras) {
        motivos.push([nomeObra(o), nomeObra(o)]);
        if (o.estado !== "concluída") for (const t of o.tarefas) motivos.push([`Obra #${o.id} · ${t.nome}`, `Obra #${o.id} · ${t.nome}`]);
      }
      motivos.push(["Substituição temporária", "Substituição temporária"]);
      return (
        <>
          <div className="fg">
            {sel("vid", "Viatura", [["", "Escolher viatura"], ...optsViaturas()])}
            {sel("pid", "Condutor", [["", "Escolher pessoa"], ...F.pessoas.map((q): [string, string] => [q.id, `${q.nome} · ${q.carta.length ? "carta " + q.carta.join("+") : "sem carta"}`])], "Lista de Pessoas (RH)")}
            {sel("tipo", "Tipo", [["permanente", "Permanente (viatura de serviço)"], ["pontual", "Pontual (obra, ordem, reserva)"]])}
            {num("km", "Km na entrega", { inputMode: "numeric" }, v ? `Última leitura: ${fKm(v.km)}` : undefined)}
            {data("ini", "Início")}
            {data("fim", "Fim", "Obrigatório nas pontuais")}
            {sel("nota", "Motivo, obra ou ordem", motivos, "As obras e as tarefas do plano vêm de Operações", "span2")}
          </div>
          {aviso ? <AlertaF tom="bad" icone={CircleAlert}>{aviso}</AlertaF>
            : p && v ? <AlertaF tom="ok" icone={CircleCheck}>Carta de {p.nome} válida para a categoria {v.cat} até {fData(p.cartaVal)}.</AlertaF> : null}
          <NotaMuted>A viatura fica também reservada na Agenda, para não ser marcada noutro serviço.</NotaMuted>
          <Src nova t="rpc_fleet_assign (nova) → fleet_assignments + schedule_item_assignees" />
        </>
      );
    }
    case "devolver": {
      const a = F.atrib.find((z) => z.id === x.a), w = a ? viatura(F, a.vid) : undefined;
      if (!a || !w) return <p>Atribuição desconhecida.</p>;
      return (
        <>
          <p><Placa mat={w.mat} /> entregue a <b>{pessoa(F, a.pid)?.nome}</b> desde {fData(a.ini)}.</p>
          <div className="fg">{num("km", "Km na devolução", {}, `Última leitura: ${fKm(w.km)}`)}{data("data", "Data")}</div>
          <label className="check"><input type="checkbox" checked={!!x.danos} onChange={(ev) => muda("danos")(ev.target.checked ? "on" : "")} /> Tem danos novos (abre uma ocorrência de sinistro)</label>
        </>
      );
    }
    case "km":
      if (!v) return <p>Viatura desconhecida.</p>;
      return (
        <>
          <p><Placa mat={v.mat} /> · última leitura <b>{fKm(v.km)}</b></p>
          <div className="fg">{num("km", "Km no conta-quilómetros", { inputMode: "numeric", autoFocus: true })}{data("data", "Data")}</div>
          <Src nova t="fleet_odometer_readings" />
        </>
      );
    case "abastecer": {
      const el = v?.comb === "Elétrico";
      return (
        <>
          <div className="fg">
            {sel("vid", "Viatura", optsViaturas())}
            {data("data", "Data")}
            {num("qtd", el ? "Energia (kWh)" : "Litros", { step: "0.1" })}
            {num("valor", "Valor com IVA (€)", { step: "0.01" })}
            {num("km", "Km no momento", {}, v ? `Última leitura: ${fKm(v.km)}` : undefined)}
            {sel("fonte", "Pago com", opcoes(POSTOS))}
          </div>
          <Src nova t="fleet_expenses + fleet_odometer_readings" />
        </>
      );
    }
    case "despesa":
      return (
        <div className="fg">
          {sel("vid", "Viatura", [["", "Escolher viatura"], ...optsAtivas()])}
          {sel("tipo", "Tipo", opcoes(TIPOS_CUSTO))}
          {data("data", "Data")}
          {num("valor", "Valor com IVA (€)", { step: "0.01" })}
          {sel("fonte", "Fornecedor", [["", "Escolher fornecedor"], ...opcoes([...OFICINAS, "Via Verde", "Pagamento direto"])], "Fornecedores do Inventário")}
          {sel("centro", "Centro de custo ou obra", [["", "O da viatura"], ...opcoes(CENTROS), ...obras.map((o): [string, string] => [centroObra(o.id), nomeObra(o)])])}
          <div className="span2"><Notas rotulo="Nota" valor={x.nota ?? ""} aoMudar={muda("nota")} /></div>
        </div>
      );
    case "importar":
      return (
        <>
          <div className="preview">
            <div className="row between" style={{ marginBottom: 8 }}><b><FileSpreadsheet className="ic" aria-hidden="true" /> extrato_galp_frota_2026-10-14.csv</b><span className="muted">{LINHAS_EXTRATO.length} linhas</span></div>
            <div className="tw" style={{ boxShadow: "none" }}>
              <table className="min-560">
                <thead><tr><th>Data</th><th>Matrícula</th><th>Posto</th><th className="num">Litros</th><th className="num">Valor</th><th className="num">Km</th><th>Verificação</th></tr></thead>
                <tbody>{LINHAS_EXTRATO.map((l) => { const prob = verificarLinha(F, l); return (
                  <tr key={l[1] + l[0]}><td>{fData(l[0])}</td><td className="mono">{l[1]}</td><td>{l[2]}</td><td className="num">{fNum(l[3], 1)}</td><td className="num">{fEur(l[4])}</td><td className="num">{fNum(l[5])}</td>
                    <td>{prob ? <Selo tom="warn">{prob}</Selo> : <Selo tom="ok">OK</Selo>}</td></tr>); })}</tbody>
              </table>
            </div>
          </div>
          <p className="muted">As linhas com aviso entram marcadas “Rever km” e não mexem nos km da viatura.</p>
          {validarImportar(F).extrato ? <AlertaF tom="warn" icone={TriangleAlert}>Já importado: o {FICHEIRO_EXTRATO} já entrou nos custos.</AlertaF> : null}
          <Src nova t="edge function fleet-import-statement (nova) · CSV do cartão frota / Via Verde" />
        </>
      );
    case "manut":
      return (
        <>
          <div className="fg">
            {sel("vid", "Viatura", [["", "Escolher viatura"], ...optsAtivas()])}
            {sel("tipo", "Intervenção", opcoes(["Revisão", "Inspeção periódica (IPO)", "Pneus", "Travões", "Reparação", "Ar condicionado"]))}
            {data("data", "Data")}
            {sel("oficina", "Oficina", opcoes(OFICINAS), "Fornecedores do Inventário")}
            {num("valor", "Valor estimado (€)", { step: "0.01" })}
          </div>
          <NotaMuted>A viatura fica bloqueada na Agenda no dia marcado.</NotaMuted>
        </>
      );
    case "concluir": {
      const m = F.manut.find((z) => z.id === x.m), w = m ? viatura(F, m.vid) : undefined;
      if (!m || !w) return <p>Intervenção desconhecida.</p>;
      return (
        <>
          <p><Placa mat={w.mat} /> · {m.tipo} · {m.oficina}</p>
          <div className="fg">{num("km", "Km à saída")}{num("valor", "Valor final (€)", { step: "0.01" })}{data("data", "Data")}</div>
          <p className="muted">O valor entra nos custos da viatura. {/Revis/.test(m.tipo) ? "A contagem da próxima revisão recomeça daqui." : /IPO/.test(m.tipo) ? "A validade da inspeção passa para daqui a um ano." : ""}</p>
        </>
      );
    }
    case "estado": {
      if (!v) return <p>Viatura desconhecida.</p>;
      const a = atribEm(F, v.id);
      return (
        <>
          <p><Placa mat={v.mat} /> · agora <SeloEstado v={v} /></p>
          <div className="fg">
            {sel("estado", "Novo estado", (Object.keys(ESTADOS) as (keyof typeof ESTADOS)[]).map((k): [string, string] => [k, ESTADOS[k][1]]))}
            <div className="span2">
              <label className="fl" htmlFor="frota-motivo">
                <span>Motivo</span>
                <textarea id="frota-motivo" placeholder="Ex.: avaria no motor, entregue na oficina" value={x.motivo ?? ""} onChange={(ev) => muda("motivo")(ev.target.value)} />
                {e.motivo ? <span className="ferr" role="alert">{e.motivo}</span> : <small className="help">Fica no histórico da viatura.</small>}
              </label>
            </div>
          </div>
          {a ? <AlertaF tom="warn" icone={TriangleAlert}>Se a viatura sair de “Ativa”, a atribuição a {pessoa(F, a.pid)?.nome} termina hoje e as reservas futuras ficam por reatribuir.</AlertaF> : null}
        </>
      );
    }
    case "ocorrencia": {
      const sug = x.vid && x.quando ? quemConduzia(F, x.vid, x.quando) : undefined;
      return (
        <>
          <div className="fg">
            {sel("vid", "Viatura", [["", "Escolher viatura"], ...optsAtivas()])}
            {sel("tipo", "Tipo", opcoes(["Avaria", "Sinistro", "Multa"]))}
            {data("quando", "Data e hora", undefined, "datetime-local")}
            <Texto rotulo="Local" valor={x.local ?? ""} aoMudar={muda("local")} erro={e.local} />
            {num("valor", "Valor (€)", { step: "0.01" }, "Multas e franquias")}
            <div className="span2">
              <label className="fl" htmlFor="frota-desc">
                <span>O que aconteceu</span>
                <textarea id="frota-desc" value={x.desc ?? ""} onChange={(ev) => muda("desc")(ev.target.value)} />
                {e.desc ? <span className="ferr" role="alert">{e.desc}</span> : null}
              </label>
            </div>
          </div>
          {sug ? <AlertaF tom="info" icone={UserRoundSearch}>Nessa data a viatura estava com <b>{sug.nome}</b>.</AlertaF> : null}
          <NotaMuted icone={Camera}>No telemóvel, o técnico junta fotos dos danos.</NotaMuted>
        </>
      );
    }
    case "identificar": {
      const o = F.ocorr.find((z) => z.id === x.o), w = o ? viatura(F, o.vid) : undefined;
      if (!o || !w) return <p>Ocorrência desconhecida.</p>;
      const s = quemConduzia(F, o.vid, o.quando), a = atribEm(F, o.vid, o.quando.slice(0, 10));
      return (
        <>
          <div className="card pad"><div className="dl">
            <div><span className="lbl">Viatura</span><Placa mat={w.mat} /></div>
            <div><span className="lbl">Quando</span>{fData(o.quando.slice(0, 10))} às {o.quando.slice(11)}</div>
            <div><span className="lbl">Infração</span>{o.desc}</div>
            <div><span className="lbl">Prazo</span>{fData(prazoMulta(o))}</div>
          </div></div>
          {s && a ? <AlertaF tom="info" icone={History}>Segundo as atribuições, a viatura estava com <b>{s.nome}</b> ({a.tipo === "pontual" ? "reserva " + (a.nota ?? "") : "atribuição permanente desde " + fData(a.ini)}).</AlertaF>
            : <AlertaF tom="warn" icone={TriangleAlert}>Não há atribuição nessa data. Escolhe o condutor à mão.</AlertaF>}
          <div className="fg">{sel("pid", "Condutor", [["", "Escolher pessoa"], ...F.pessoas.filter((p) => p.carta.length).map((p): [string, string] => [p.id, p.nome])])}</div>
          <p className="muted">O condutor recebe uma notificação com os dados da multa para assinar a identificação.</p>
          <Src nova t="fleet_incidents.driver_id · notifications" />
        </>
      );
    }
    case "renovar": {
      if (!v) return <p>Viatura desconhecida.</p>;
      const k = x.k as ChaveVenc;
      return (
        <>
          <p><Placa mat={v.mat} /> · {VENC[k]} válido até {fData(v.venc[k])}</p>
          <div className="fg">{data("data", "Nova validade")}{num("valor", "Valor pago (€)", { step: "0.01" }, "Opcional. Entra nos custos.")}</div>
          <NotaMuted icone={Paperclip}>Junta o comprovativo em PDF ou foto.</NotaMuted>
        </>
      );
    }
    case "nova":
      return (
        <>
          <div className="fg">
            <Texto rotulo="Matrícula" valor={x.mat} aoMudar={muda("mat")} erro={e.mat} atributos={{ placeholder: "AA-00-AA", autoComplete: "off" }} />
            <Texto rotulo="Marca" valor={x.marca} aoMudar={muda("marca")} erro={e.marca} />
            <Texto rotulo="Modelo" valor={x.modelo} aoMudar={muda("modelo")} erro={e.modelo} />
            {sel("tipo", "Tipo", opcoes(["Furgão compacto", "Furgão", "Furgão grande", "Ligeiro de passageiros", "Pesado de mercadorias"]))}
            {sel("comb", "Combustível", opcoes(["Gasóleo", "Gasolina", "Híbrido", "Elétrico"]))}
            {sel("posse", "Posse", opcoes(["Própria", "Renting", "Leasing"]))}
            {num("ano", "Ano")}
            {num("km", "Km atuais")}
            {sel("cat", "Carta exigida", [["B", "Categoria B"], ["C", "Categoria C"]])}
            {sel("centro", "Centro de custo", opcoes(CENTROS))}
            {data("seguro", "Seguro válido até")}
            {data("ipo", "Inspeção (IPO) até")}
            {data("iuc", "IUC até")}
            <Texto rotulo="Cidade da carrinha" valor={x.cidade ?? ""} aoMudar={muda("cidade")} ajuda="Opcional. Onde fica o armazém móvel no Inventário." />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <label className="check"><input type="checkbox" checked={!!x.armazem} onChange={(ev) => muda("armazem")(ev.target.checked ? "on" : "")} /> Criar armazém móvel no Inventário (stock na carrinha)</label>
            <label className="check"><input type="checkbox" checked={!!x.agenda} onChange={(ev) => muda("agenda")(ev.target.checked ? "on" : "")} /> Criar recurso na Agenda (para reservas e conflitos)</label>
          </div>
          <Src nova t="rpc_fleet_create_vehicle (nova) → fleet_vehicles + warehouses + schedule_resources" />
        </>
      );
  }
}
