// O portal do cliente (14/10/2026; percurso guiado a 15/10): o que o cliente vê no link pessoal, no telemóvel ou no computador.
// Um percurso com o próximo passo sempre à vista: Rever a proposta → Aceitar → Assinar o contrato → Acompanhar a obra.
// · Proposta por aceitar: a proposta inteira (o mesmo documento), com "Aceitar a proposta" sempre à mão em baixo.
// · Aceite: é o comercial que gera o contrato (decisão do Ruben, 15/10); até lá, "O contrato está a ser preparado", sem botão.
// · Contrato gerado: aparece no mesmo link, por assinar, com o contrato à vista.
// · Assinado: o mesmo link mostra o plano da obra (fases e datas, sem custos nem margens).
// As ações são as do motor, por isso o negócio no protótipo passa de fase como hoje (e o outro separador vê-o pelo storage).
import { useState, type ReactNode } from "react";
import { Armchair, Check, ChevronRight, ClipboardCheck, Clock, Copy, FileText, Grid3x3, Hammer, MessageSquareText, PenLine, Plug, Scale, X, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTIVOS_RECUSA, MOTIVOS_VERSAO, eur, versaoAtual, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { AdendaDoc, ContratoDoc, FaturaDoc, NotaEncomendaDoc, PropostaDoc, TITULOS_CLAUSULAS, totais, tranches } from "./DocsCliente";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA, type FaseObra } from "./fasesObra";
import { rotuloDia } from "./preparacaoObra";
import { useInventario } from "./inventario/loja";
import { resumoEcNegocio } from "./inventario/ponteNegocios";
import { diasAdenda, totalComIva } from "./adendas";
import { AssinaturaContrato } from "./AssinaturaContrato";
import { AutoRececaoDoc } from "./AutoRececao";
import { RelatorioObra } from "./RelatorioObra";
import { PAGAMENTO_EMPRESA, em3, referenciaMb, vencimento } from "./pagamentoCliente";
import { DiarioPortal, NovidadesPortal, TrabalhosDaFase } from "./PortalObra";
import { Conversa } from "./ConversaObra";

/** Os passos do percurso, pela ordem. */
export const PASSOS_PORTAL = ["Rever a proposta", "Aceitar", "Assinar o contrato", "Acompanhar a obra", "Receber a obra"] as const;
const CURTO = ["Proposta", "Aceitar", "Contrato", "Obra", "Receção"];

/** Em que passo está o cliente: 0 rever/aceitar, 2 contrato (a preparar ou por assinar), 3 obra (e as adendas por assinar),
 *  4 receção (o auto por assinar e, depois, o relatório da obra). */
export function passoPortal(d: Negocio): { i: number; estado: "rever" | "pedido" | "recusada" | "preparar" | "revisao" | "assinar" | "obra" | "adenda" | "auto" | "relatorio" | "sem" } {
  const o = d.orc;
  if (o?.recusada && d.perdido) return { i: 0, estado: "recusada" };
  if (!o?.enviada) return { i: 0, estado: "sem" };
  if (!o.aceite && o.pedidoCliente) return { i: 0, estado: "pedido" };
  if (!o.aceite) return { i: 0, estado: "rever" };
  if (o.vendaDireta || o.contrato === "assinado") {
    if ((d.adendas ?? []).some((a) => a.estado === "enviada")) return { i: 3, estado: "adenda" };
    const au = d.obra.auto;
    if (au?.estado === "assinado") return { i: 4, estado: "relatorio" };
    if (au) return { i: 4, estado: "auto" };
    return { i: 3, estado: "obra" };
  }
  if (o.contratoPedido) return { i: 2, estado: "revisao" };
  if (o.contrato === "enviado") return { i: 2, estado: "assinar" };
  return { i: 2, estado: "preparar" };
}

const ICONE_FASE: Record<number, LucideIcon> = { 1: Hammer, 2: Plug, 3: Grid3x3, 4: Armchair };
/** Os motivos de alteração, nas palavras do cliente (por dentro guardam-se os mesmos da "Nova versão" do comercial). */
const PARA_CLIENTE: Record<string, string> = {
  "Outros materiais": "Materiais ou acabamentos", "Juntar ou tirar trabalhos": "Juntar ou tirar trabalhos", "Baixar o preço": "O preço",
  "Outras datas": "As datas", "Outra forma de pagamento": "A forma de pagamento",
};
const doCliente = (m: string) => PARA_CLIENTE[m] ?? m;

/** Uma linha "rótulo · valor" com o botão de copiar (diz "Copiado" por um momento). */
function Copiar({ rotulo, valor, mostrar }: { rotulo: string; valor: string; mostrar?: string }) {
  const [ok, setOk] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(valor); } catch { /* sem acesso à área de transferência */ }
    setOk(true); setTimeout(() => setOk(false), 1600);
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-sm text-slate-500">{rotulo}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 break-all text-right text-[15px] font-semibold tabular-nums">{mostrar ?? valor}</span>
        <button type="button" onClick={copiar} aria-label={`Copiar ${rotulo.toLowerCase()}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-900">
          {ok ? <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
        <span className="sr-only" aria-live="polite">{ok ? "Copiado" : ""}</span>
      </dd>
    </div>
  );
}

/** Chips de escolha múltipla, no estilo do portal. */
function Chips({ opcoes, on, mudar, rotulo, nome = (x: string) => x }: { opcoes: readonly string[]; on: string[]; mudar: (v: string[]) => void; rotulo: string; nome?: (x: string) => string }) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((m) => {
        const ligado = on.includes(m);
        return (
          <button key={m} type="button" aria-pressed={ligado} onClick={() => mudar(ligado ? on.filter((x) => x !== m) : [...on, m])}
            className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2",
              ligado ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:border-slate-500")}>
            {ligado && <Check className="h-4 w-4" aria-hidden="true" />}{nome(m)}
          </button>
        );
      })}
    </div>
  );
}

function Botao({ children, onClick, ghost, perigo, disabled }: { children: ReactNode; onClick: () => void; ghost?: boolean; perigo?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("min-h-12 w-full rounded-xl px-4 text-[15px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
        ghost ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50" : perigo ? "bg-red-700 text-white hover:bg-red-800" : "bg-slate-900 text-white hover:bg-slate-800")}>
      {children}
    </button>
  );
}

export function PortalCliente({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const { S, A, run } = ctx;
  const [doc, setDoc] = useState<string | null>(null);
  // a resposta à proposta (15/10): escolher entre pedir alterações e recusar; depois, os motivos e o texto
  const [resposta, setResposta] = useState<null | "escolher" | "alterar" | "recusar">(null);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState<"aceitar" | "assinar" | "adenda" | "auto" | null>(null);
  // ao receber a obra (15/10): "está tudo bem" ou uma observação, antes de assinar o auto
  const [receber, setReceber] = useState<null | "ok" | "obs">(null);
  const [obs, setObs] = useState("");
  // pedir alterações ao contrato (15/10): as cláusulas escolhidas e o que não agrada em cada uma
  const [pedirContrato, setPedirContrato] = useState(false);
  const [cls, setCls] = useState<Record<string, string>>({});
  const [texto, setTexto] = useState("");
  const [ref, setRef] = useState("");
  const [verProposta, setVerProposta] = useState(false);
  const o = d.orc, p = d.obra.plano, nome = d.nome.split(" ")[0];
  const T = o ? totais(d, S) : null;
  const P = passoPortal(d);
  const topo = () => { try { document.querySelector('[aria-label^="Portal do cliente"]')?.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* sem scroll */ } };
  const fazer = (fn: () => void) => { setConfirmar(null); run(fn); topo(); };

  // o que mais espera pelo cliente, depois do contrato: adendas e o pagamento
  const outros: { id: string; t: string; sub: string; corpo: ReactNode }[] = [];
  if (d.fin.fatura && !d.fin.pago && T) {
    // 15/10: a fatura à vista e os dados para pagar (Multibanco ou transferência), cada um com o botão de copiar
    const ft = d.fin.fatura, t0 = tranches(d, T.total)[0];
    const ddmm = ft.q.match(/^(\d{2})\/(\d{2})/);
    const emitida = ddmm ? new Date(new Date().getFullYear(), Number(ddmm[2]) - 1, Number(ddmm[1])) : new Date();
    const montante = eur(t0.v), refMb = referenciaMb(d.id, ft.n);
    outros.push({
      id: "pag", t: `Pagar a fatura ${ft.n}`, sub: `${t0.l} · vence a ${vencimento(emitida, d.f.vencimento || "15 dias")}`,
      corpo: d.f.comprovativo
        ? <p className="flex items-center gap-2 text-[15px] text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" />Comprovativo enviado ({d.f.comprovativo}). Estamos a confirmar.</p>
        : <div className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <p><span className="block text-xs uppercase tracking-[0.12em] text-slate-500">A pagar</span><span className="text-2xl font-semibold tabular-nums">{montante} €</span></p>
              <button type="button" onClick={() => setDoc("fatura")} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-slate-900 underline-offset-4 hover:underline">
                <FileText className="h-4 w-4" aria-hidden="true" />Ver a fatura
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-1">
              <p className="pt-2 text-sm font-semibold">Multibanco ou homebanking</p>
              <dl className="divide-y divide-slate-100">
                <Copiar rotulo="Entidade" valor={PAGAMENTO_EMPRESA.entidade} />
                <Copiar rotulo="Referência" valor={refMb} mostrar={em3(refMb)} />
                <Copiar rotulo="Montante" valor={montante} mostrar={`${montante} €`} />
              </dl>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-1">
              <p className="pt-2 text-sm font-semibold">Transferência bancária</p>
              <dl className="divide-y divide-slate-100">
                <Copiar rotulo="IBAN" valor={PAGAMENTO_EMPRESA.iban.replace(/\s/g, "")} mostrar={PAGAMENTO_EMPRESA.iban} />
                <Copiar rotulo="Descritivo" valor={ft.n} />
              </dl>
              <p className="pb-2 text-sm text-slate-500">Titular: {PAGAMENTO_EMPRESA.titular}. Dados de exemplo neste protótipo.</p>
            </div>
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <p className="text-[15px] font-medium">Já pagou? Avise-nos</p>
              <input value={ref} onChange={(ev) => setRef(ev.target.value)} placeholder="Referência ou n.º da transferência (opcional)" aria-label="Referência do pagamento" className="h-12 w-full rounded-xl border border-slate-300 px-3 text-[15px] outline-none focus:border-slate-900" />
              <Botao onClick={() => fazer(() => A.avisarPagamento(d.id, ref))}>Já paguei</Botao>
            </div>
          </div>,
    });
  }

  const adendasAssinadas = (d.adendas ?? []).filter((a) => a.estado === "assinada").length, au = d.obra.auto;
  const docs: [string, string, boolean][] = [
    ["proposta", `Proposta PR 2026/${d.id}`, !!o?.enviada],
    // 15/10: as adendas assinadas juntam-se ao contrato (o documento do contrato mostra-as)
    ["contrato", `Contrato CT 2026/${d.id}${adendasAssinadas ? ` + ${adendasAssinadas} ${adendasAssinadas === 1 ? "adenda" : "adendas"}` : ""}`, !!o?.contrato],
    ["encomenda", d.obra.ec ? `Nota de encomenda ${d.obra.ec.n}` : "", !!d.obra.ec],
    ["fatura", d.fin.fatura ? `Fatura ${d.fin.fatura.n}` : "", !!d.fin.fatura],
    ["auto", au ? `Auto de receção ${au.n}` : "", !!au],
    ["relatorio", "Relatório da obra", au?.estado === "assinado"],
  ];
  const corpoDoc = (k: string) => k === "proposta" ? <PropostaDoc S={S} d={d} /> : k === "contrato" ? <ContratoDoc S={S} d={d} /> : k === "encomenda" ? <NotaEncomendaDoc d={d} /> : k === "fatura" ? <FaturaDoc S={S} d={d} />
    : k === "auto" ? <AutoRececaoDoc d={d} /> : k === "relatorio" ? <div className="mx-auto max-w-3xl"><RelatorioObra S={S} d={d} /></div>
    : (() => { const a = d.adendas?.find((x) => x.n === k); return a ? <AdendaDoc d={d} a={a} /> : null; })();
  const adendaAgora = (d.adendas ?? []).find((a) => a.estado === "enviada");

  /* ---------------------------------------------- o plano da obra, como o cliente o vê (sem custos) */
  const fasesObra = p && p.tasks.some((t) => t.fase)
    ? ([...new Set(p.tasks.map((t) => t.fase ?? 0))].filter(Boolean).sort() as FaseObra[]).map((f) => {
        const ts = p.tasks.filter((t) => t.fase === f), i0 = Math.min(...ts.map((t) => t.dia)), i1 = Math.max(...ts.map((t) => t.dia + t.dur - 1));
        // 21/10: feita só quando o responsável de obra validou todos os trabalhos da fase (não basta os dias passarem)
        const validada = ts.every((t) => t.exec?.estado === "validada");
        const estado = p.estado === "concluída" || (p.estado === "em curso" && validada) ? "feita" : p.estado === "em curso" && (p.dia >= i0 || ts.some((t) => t.exec)) ? "agora" : "depois";
        return { f, ts, i0, i1, estado };
      })
    : [];

  /* ---------------------------------------------- o cartão do passo de agora (um só primário, na barra de baixo) */
  let agora: ReactNode = null;
  const responder = (r: typeof resposta) => { setResposta(r); setMotivos([]); setTexto(""); topo(); };
  if (P.estado === "rever" && o && T) {
    agora = resposta === "escolher" ? (
      <>
        <h2 className="text-xl font-semibold">O que prefere?</h2>
        <p className="mt-1 text-[15px] text-slate-600">Diga-nos o que não está bem. Respondemos neste mesmo link.</p>
        <ul className="mt-4 grid gap-3">
          {([
            ["alterar", MessageSquareText, "Pedir alterações", "Diga o que mudaria. Preparamos uma nova proposta e recebe-a aqui."],
            ["recusar", XCircle, "Recusar a proposta", "Não quer avançar com a obra."],
          ] as const).map(([k, Ic, t, sub]) => (
            <li key={k}><button type="button" onClick={() => responder(k)}
              className="flex min-h-20 w-full items-start gap-3 rounded-xl border border-slate-300 bg-white p-4 text-left outline-none transition-colors hover:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-900">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", k === "recusar" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700")} aria-hidden="true"><Ic className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-base font-semibold">{t}</span><span className="block text-[15px] text-slate-600">{sub}</span></span>
              <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </button></li>
          ))}
        </ul>
        <div className="mt-3"><Botao ghost onClick={() => responder(null)}>Voltar à proposta</Botao></div>
      </>
    ) : resposta === "alterar" ? (
      <>
        <h2 className="text-xl font-semibold">O que gostava de mudar?</h2>
        <p className="mt-1 text-[15px] text-slate-600">Escolha o que se aplica. Pode escolher mais do que um.</p>
        <div className="mt-4"><Chips rotulo="O que gostava de mudar" opcoes={MOTIVOS_VERSAO} on={motivos} mudar={setMotivos} nome={doCliente} /></div>
        <label className="mt-4 block">
          <span className="text-[15px] font-medium">Conte-nos o que mudaria</span>
          <textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={3} placeholder="Ex.: azulejo mais claro, começar em novembro…"
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-slate-900" />
        </label>
        <div className="mt-4 grid gap-2">
          <Botao disabled={!motivos.length && !texto.trim()} onClick={() => { fazer(() => A.pedirAlteracoes(d.id, texto, motivos)); responder(null); }}>Enviar o pedido</Botao>
          <Botao ghost onClick={() => responder("escolher")}>Voltar</Botao>
        </div>
      </>
    ) : resposta === "recusar" ? (
      <>
        <h2 className="text-xl font-semibold">Porque não quer avançar?</h2>
        <p className="mt-1 text-[15px] text-slate-600">Ajuda-nos a melhorar. Se for só uma parte, <button type="button" onClick={() => responder("alterar")} className="font-medium text-slate-900 underline underline-offset-4">peça antes alterações</button>.</p>
        <div className="mt-4"><Chips rotulo="Porque não quer avançar" opcoes={MOTIVOS_RECUSA} on={motivos} mudar={setMotivos} /></div>
        <label className="mt-4 block">
          <span className="text-[15px] font-medium">Quer acrescentar alguma coisa? <span className="font-normal text-slate-500">(opcional)</span></span>
          <textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={2}
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-slate-900" />
        </label>
        <div className="mt-4 grid gap-2">
          <Botao perigo disabled={!motivos.length} onClick={() => { fazer(() => A.recusarProposta(d.id, motivos, texto)); responder(null); }}>Recusar a proposta</Botao>
          <Botao ghost onClick={() => responder("escolher")}>Voltar</Botao>
        </div>
      </>
    ) : (
      <>
        <p className="text-sm font-medium text-slate-500">Passo 1 de 5{o.versoes?.length ? ` · versão ${versaoAtual(o)}, com o que pediu` : ""}</p>
        <h2 className="mt-0.5 text-xl font-semibold">Reveja a sua proposta</h2>
        <p className="mt-1 text-[15px] text-slate-600">Está toda aqui em baixo: o que vamos fazer, fase a fase, os materiais, o preço e as condições.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Total, com IVA</dt><dd className="text-lg font-semibold tabular-nums">{eur(T.total)} €</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Prazo</dt><dd className="text-lg font-semibold tabular-nums">{d.f.prazo_exec ? `${d.f.prazo_exec} dias úteis` : "a combinar"}</dd></div>
        </dl>
      </>
    );
  } else if (P.estado === "pedido" && o?.pedidoCliente) {
    const pc = o.pedidoCliente;
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />Pedido enviado</p>
        <h2 className="mt-2 text-xl font-semibold">Estamos a preparar uma nova proposta</h2>
        <p className="mt-1 text-[15px] text-slate-600">Recebe-a aqui, neste mesmo link. Não precisa de fazer nada agora.</p>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-500">O que pediu</p>
          {pc.motivos.length > 0 && <p className="mt-1 text-[15px]">{pc.motivos.map(doCliente).join(" · ")}</p>}
          {pc.nota && <p className="mt-1 text-[15px] text-slate-600">«{pc.nota}»</p>}
        </div>
      </>
    );
  } else if (P.estado === "recusada") {
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-slate-600"><XCircle className="h-5 w-5" aria-hidden="true" />Proposta recusada</p>
        <h2 className="mt-2 text-xl font-semibold">Obrigado por nos dizer</h2>
        <p className="mt-1 text-[15px] text-slate-600">Ficamos à disposição. Se mudar de ideias, fale connosco: preparamos uma nova proposta.</p>
      </>
    );
  } else if (P.estado === "preparar") {
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />Proposta aceite</p>
        <h2 className="mt-2 text-xl font-semibold">{o?.contratoVersoes?.length ? "A nova versão do contrato está quase pronta" : "O contrato está a ser preparado"}</h2>
        <p className="mt-1 text-[15px] text-slate-600">Segue a proposta que aceitou. Quando estiver pronto, aparece aqui, neste mesmo link, para assinar. Não precisa de fazer nada agora.</p>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Clock className="h-4 w-4" aria-hidden="true" />Normalmente fica pronto no mesmo dia.</p>
      </>
    );
  } else if (P.estado === "assinar") {
    // 15/10: assinar abre aqui, no cartão do passo: desenhar no ecrã ou Chave Móvel Digital (AssinaturaContrato.tsx)
    agora = confirmar === "assinar" ? (
      <AssinaturaContrato nome={d.f.nome_fiscal || d.nome} contrato={`CT 2026/${d.id}`}
        onAssinar={(a) => fazer(() => A.assinarCom(d.id, a))} onCancelar={() => setConfirmar(null)} />
    ) : (
      pedirContrato ? (
      <>
        <h2 className="text-xl font-semibold">O que quer mudar no contrato?</h2>
        <p className="mt-1 text-[15px] text-slate-600">Escolha as cláusulas e diga o que não lhe agrada em cada uma. A nossa equipa jurídica revê e a nova versão aparece aqui.</p>
        <div className="mt-4"><Chips rotulo="Cláusulas a mudar" opcoes={TITULOS_CLAUSULAS} on={Object.keys(cls)} mudar={(v) => setCls((a) => Object.fromEntries(v.map((c) => [c, a[c] ?? ""])))} /></div>
        {Object.keys(cls).map((c) => (
          <label key={c} className="mt-4 block animate-in fade-in-0">
            <span className="text-[15px] font-medium">{c}: o que não lhe agrada</span>
            <textarea value={cls[c]} rows={2} onChange={(ev) => setCls((a) => ({ ...a, [c]: ev.target.value }))}
              className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-slate-900" />
          </label>
        ))}
        <div className="mt-4 grid gap-2">
          <Botao disabled={!Object.keys(cls).length || Object.values(cls).some((x) => !x.trim())}
            onClick={() => { fazer(() => A.pedirAlteracoesContrato(d.id, Object.entries(cls).map(([c, nota]) => ({ c, nota })))); setPedirContrato(false); setCls({}); }}>Enviar o pedido</Botao>
          <Botao ghost onClick={() => { setPedirContrato(false); setCls({}); }}>Voltar ao contrato</Botao>
        </div>
      </>
    ) : (
      <>
        <p className="text-sm font-medium text-slate-500">Passo 3 de 5{o?.contratoRevisto ? ` · versão ${(o.contratoVersoes?.length ?? 0) + 1}, revista a seu pedido` : ""}</p>
        <h2 className="mt-0.5 text-xl font-semibold">Assinar o contrato</h2>
        <p className="mt-1 text-[15px] text-slate-600">O contrato CT 2026/{d.id} segue a proposta que aceitou. Leia-o aqui em baixo e assine quando estiver pronto.</p>
      </>
    ));
  } else if (P.estado === "revisao" && o?.contratoPedido) {
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />Pedido enviado</p>
        <h2 className="mt-2 flex items-start gap-2 text-xl font-semibold"><Scale className="mt-1 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />O contrato está a ser revisto pela nossa equipa jurídica</h2>
        <p className="mt-1 text-[15px] text-slate-600">Quando estiver revisto, a nova versão aparece aqui, neste mesmo link, para assinar. Não precisa de fazer nada agora.</p>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-500">O que pediu</p>
          <ul className="mt-1 space-y-1">{o.contratoPedido.clausulas.map((x) => <li key={x.c} className="text-[15px]"><b className="font-medium">{x.c}:</b> <span className="text-slate-600">«{x.nota}»</span></li>)}</ul>
        </div>
      </>
    );
  } else if (P.estado === "adenda" && adendaAgora) {
    const a = adendaAgora, dd = diasAdenda(a.linhas);
    agora = confirmar === "adenda" ? (
      <AssinaturaContrato nome={d.f.nome_fiscal || d.nome} contrato={a.n} aceito={`Li e aceito a adenda ${a.n} ao contrato CT 2026/${d.id}.`} acao="Assinar a adenda" voltar="Voltar à adenda"
        onAssinar={(as) => fazer(() => A.assinarAdendaCom(d.id, a.n, as))} onCancelar={() => setConfirmar(null)} />
    ) : (
      <>
        <p className="text-sm font-medium text-slate-500">Trabalhos a mais</p>
        <h2 className="mt-0.5 text-xl font-semibold">Assinar a adenda {a.n}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{a.linhas.map((x) => x.n).join(", ")}. Assinada, junta-se ao contrato e os trabalhos entram no plano da obra.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">A mais, com IVA</dt><dd className="text-lg font-semibold tabular-nums">{eur(totalComIva(a.linhas))} €</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Prazo</dt><dd className="text-lg font-semibold tabular-nums">+{dd} {dd === 1 ? "dia útil" : "dias úteis"}</dd></div>
        </dl>
      </>
    );
  } else if (P.estado === "auto" && au) {
    agora = confirmar === "auto" ? (
      <AssinaturaContrato nome={d.f.nome_fiscal || d.nome} contrato={au.n} aceito={`Recebi a obra e li o auto de receção ${au.n}.`} acao="Assinar o auto" voltar="Voltar ao auto"
        onAssinar={(as) => fazer(() => A.assinarAuto(d.id, as, receber === "obs" ? obs : undefined))} onCancelar={() => setConfirmar(null)} />
    ) : (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />Obra concluída</p>
        <h2 className="mt-2 text-xl font-semibold">Receber a obra</h2>
        <p className="mt-1 text-[15px] text-slate-600">Veja a obra com calma. Depois assine o auto de receção: a garantia começa nesse dia e recebe aqui o relatório da obra, com tudo o que fizemos.</p>
        <fieldset className="mt-4 border-t border-slate-200 pt-4">
          <legend className="text-[15px] font-medium">Como encontrou a obra?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {([["ok", "Está tudo bem"], ["obs", "Tenho uma observação"]] as const).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={receber === k} onClick={() => setReceber(k)}
                className={cn("flex min-h-12 items-center gap-2 rounded-xl border px-4 text-left text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900",
                  receber === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:border-slate-500")}>
                {receber === k && <Check className="h-4 w-4" aria-hidden="true" />}{t}
              </button>
            ))}
          </div>
          {receber === "obs" && (
            <label className="mt-3 block animate-in fade-in-0">
              <span className="text-[15px] font-medium">A sua observação</span>
              <textarea value={obs} onChange={(ev) => setObs(ev.target.value)} rows={3} placeholder="Ex.: falta rejuntar um azulejo atrás da porta"
                className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-slate-900" />
              <span className="text-sm text-slate-500">Fica escrita no auto; o responsável de obra resolve-a ao abrigo da garantia.</span>
            </label>
          )}
        </fieldset>
      </>
    );
  } else if (P.estado === "relatorio" && au) {
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><ClipboardCheck className="h-5 w-5" aria-hidden="true" />Obra recebida · auto {au.n} assinado</p>
        <h2 className="mt-2 text-xl font-semibold">O relatório da sua obra</h2>
        <p className="mt-1 text-[15px] text-slate-600">Tudo o que fizemos, com as fotografias, os materiais e a garantia. Fica sempre aqui, neste link. Obrigado pela confiança.</p>
      </>
    );
  } else if (P.estado === "obra") {
    const ultimo = fasesObra.length ? Math.max(...fasesObra.map((x) => x.i1)) : 0;
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />{o?.vendaDireta ? "Proposta aceite" : "Contrato assinado"}</p>
        <h2 className="mt-2 text-xl font-semibold">A sua obra</h2>
        <p className="mt-1 text-[15px] text-slate-600">
          {p?.estado === "concluída" ? "Concluída. Obrigado pela confiança."
            : p?.estado === "em curso" ? (() => {
                // o que a equipa está a fazer hoje e quando acaba, numa frase
                const hoje = [...new Set(p.tasks.filter((t) => t.dia <= p.dia && p.dia < t.dia + t.dur && t.exec?.estado !== "validada").map((t) => t.nome.toLowerCase()))];
                const fim = rotuloDia(p, Math.max(...p.tasks.map((t) => t.dia + t.dur)) - 1);
                return `Em curso. ${hoje.length ? `Hoje a equipa está em ${hoje.join(" e ")}. ` : ""}A obra acaba a ${fim}. Em baixo vê as fotografias de cada trabalho.`;
              })()
            : p && p.origem === "orcamento" && fasesObra.length ? `Começa a ${rotuloDia(p, 0)} e acaba a ${rotuloDia(p, ultimo)}.`
            : "As datas confirmam-se em breve; avisamos aqui."}
        </p>
      </>
    );
  }

  /* ---------------------------------------------- a barra fixa em baixo: o próximo passo sempre à mão */
  const barra = P.estado === "rever" && !resposta ? (
    confirmar === "aceitar" ? (
      <div className="space-y-2">
        <p className="text-[15px]">Aceitar a proposta PR 2026/{d.id}, de <b className="tabular-nums">{T ? eur(T.total) : ""} €</b> com IVA?</p>
        <div className="grid grid-cols-2 gap-2"><Botao ghost onClick={() => setConfirmar(null)}>Voltar</Botao><Botao onClick={() => fazer(() => A.aceitar(d.id))}>Aceitar</Botao></div>
      </div>
    ) : (
      <div className="flex flex-col gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <div className="sm:w-64"><Botao onClick={() => setConfirmar("aceitar")}>Aceitar a proposta</Botao></div>
        <button type="button" onClick={() => responder("escolher")} className="min-h-11 text-[15px] font-medium text-slate-600 underline-offset-4 hover:underline sm:mr-auto">Pedir alterações ou recusar</button>
      </div>
    )
  ) : P.estado === "adenda" ? (
    confirmar === "adenda" ? null : (
      <div className="sm:ml-auto sm:w-64"><Botao onClick={() => { setConfirmar("adenda"); topo(); }}><span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4" aria-hidden="true" />Assinar a adenda</span></Botao></div>
    )
  ) : P.estado === "auto" ? (
    confirmar === "auto" ? null : (
      <div className="flex flex-col gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <div className="sm:w-72"><Botao disabled={!receber || (receber === "obs" && !obs.trim())} onClick={() => { setConfirmar("auto"); topo(); }}><span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4" aria-hidden="true" />Assinar o auto de receção</span></Botao></div>
        {!receber && <p className="text-center text-sm text-slate-500 sm:mr-auto sm:text-left">Diga primeiro como encontrou a obra.</p>}
      </div>
    )
  ) : P.estado === "assinar" ? (
    confirmar === "assinar" || pedirContrato ? null : (
      <div className="flex flex-col gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <div className="sm:w-64"><Botao onClick={() => { setConfirmar("assinar"); topo(); }}><span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4" aria-hidden="true" />Assinar o contrato</span></Botao></div>
        <button type="button" onClick={() => { setPedirContrato(true); topo(); }} className="min-h-11 text-[15px] font-medium text-slate-600 underline-offset-4 hover:underline sm:mr-auto">Pedir alterações ao contrato</button>
      </div>
    )
  ) : null;

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-100 text-slate-900 animate-in fade-in-0 duration-200" role="dialog" aria-modal="true" aria-label={`Portal do cliente: ${d.nome}`}>
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
        <p className="text-sm font-semibold tracking-[0.18em] text-slate-900">MUDELAR</p>
        <button type="button" onClick={doc ? () => setDoc(null) : fechar} aria-label={doc ? "Voltar ao portal" : "Fechar o portal"} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-slate-200"><X className="h-5 w-5" /></button>
      </div>
      {doc ? (
        <div className="px-3 py-6 sm:py-10 animate-in fade-in-0 slide-in-from-right-3 duration-200">{corpoDoc(doc)}</div>
      ) : (
        <div className={cn("mx-auto w-full max-w-3xl space-y-5 px-4 pt-6", barra ? "pb-44" : "pb-10")}>
          <header>
            <h1 className="text-2xl font-semibold">Olá, {nome}</h1>
            <p className="text-[15px] text-slate-600">{d.servico} · {d.f.morada || d.local}</p>
          </header>

          {/* o percurso: onde está e o que vem a seguir */}
          <ol className="grid grid-cols-5 gap-1.5" aria-label="O seu percurso">
            {PASSOS_PORTAL.map((t, i) => {
              const feito = i < P.i || (P.estado === "relatorio" && i === 4);
              const aqui = i === P.i && !feito;
              return (
                <li key={t} aria-current={aqui ? "step" : undefined}>
                  <span className={cn("block h-1.5 rounded-full transition-colors duration-500", feito ? "bg-slate-900" : aqui ? "bg-[#5a36bf]" : "bg-slate-300")} aria-hidden="true" />
                  <span className={cn("mt-1.5 flex items-center gap-1 text-xs sm:text-sm", aqui ? "font-semibold text-slate-900" : feito ? "text-slate-700" : "text-slate-500")}>
                    {feito && <Check className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden="true" />}
                    <span className="sm:hidden" aria-hidden="true">{CURTO[i]}</span><span className="sr-only sm:not-sr-only">{t}</span>
                    {feito && <span className="sr-only"> (feito)</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          {agora && <section aria-label="Agora" className="rounded-2xl bg-white p-5 shadow-sm animate-in fade-in-0 slide-in-from-bottom-1 duration-300">{agora}</section>}

          {/* o plano da obra (depois de assinar) */}
          {P.estado === "obra" && fasesObra.length > 0 && p && (
            <section aria-label="O plano da obra" className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold">O plano, fase a fase</h2>
              {/* 21/10: o progresso, os avisos de ajustes e, em cada trabalho, as fotografias e as notas dos técnicos */}
              <div className="mt-3"><NovidadesPortal d={d} p={p} /></div>
              <ol className="mt-4">
                {fasesObra.map(({ f, ts, i0, i1, estado }, k) => {
                  const Ic = ICONE_FASE[f] ?? Hammer, ultima = k === fasesObra.length - 1;
                  return (
                    <li key={f} className="relative flex gap-3 pb-5 last:pb-0">
                      {!ultima && <span aria-hidden="true" className="absolute bottom-0 left-[17px] top-10 w-px bg-slate-200" />}
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", estado === "feita" && "bg-emerald-50 text-emerald-700")} style={estado === "feita" ? undefined : { background: `${COR_FASE[f]}1f`, color: COR_FASE[f] }} aria-hidden="true">
                        {estado === "feita" ? <Check className="h-[18px] w-[18px]" /> : <Ic className="h-[18px] w-[18px]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold">{FASES_OBRA[f - 1].curto}</p>
                        <p className="text-sm tabular-nums text-slate-500">{rotuloDia(p, i0)}{i1 > i0 ? ` a ${rotuloDia(p, i1)}` : ""}</p>
                        {estado === "agora" && <p className="text-sm font-medium text-[#5a36bf]">A decorrer</p>}
                        {estado === "feita" && <p className="text-sm font-medium text-emerald-700">Feita</p>}
                        {p.estado === "em curso" || p.estado === "concluída"
                          ? <TrabalhosDaFase p={p} ts={ts} />
                          : <p className="text-sm text-slate-600">{[...new Set(ts.map((t) => t.nome))].join(" · ")}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {d.obra.ec && <MateriaisPortal d={d} />}
            </section>
          )}
          {P.estado === "obra" && p && (p.estado === "em curso" || p.estado === "concluída") && <DiarioPortal p={p} />}
          {/* 21/10: a conversa com a equipa da obra (o gestor responde na página da obra) */}
          {(P.estado === "obra" || P.estado === "adenda" || P.estado === "auto") && (
            <section aria-labelledby="conversa-portal-t" className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 id="conversa-portal-t" className="text-base font-semibold">Fale com a equipa</h2>
              <p className="mb-3 text-sm text-slate-500">O responsável de obra responde aqui. Também pode ligar: 917 300 210.</p>
              <Conversa msgs={d.obra.chat ?? []} eu="cliente" enviar={(t) => run(() => A.mensagemObra(d.id, "cliente", t))} vazio="Escreva-nos: dúvidas, pedidos ou o que precisar."
                rapidas={["Obrigada!", "A que horas chegam amanhã?", "Podem ligar-me?"]} />
            </section>
          )}

          {outros.length > 0 && (
            <section aria-label="O que precisa de si" className="space-y-3">
              <h2 className="text-base font-semibold">Também precisa de si</h2>
              {outros.map((x) => (
                <div key={x.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-[15px] font-semibold">{x.t}</p>
                  <p className="mb-3 text-sm text-slate-600">{x.sub}</p>
                  {x.corpo}
                </div>
              ))}
            </section>
          )}

          {/* o documento do passo de agora, inteiro: a proposta para aceitar, o contrato para assinar */}
          {P.estado === "rever" && <div className="-mx-4 sm:mx-0" aria-label="A proposta" role="region"><PropostaDoc S={S} d={d} /></div>}
          {P.estado === "assinar" && <div className="-mx-4 sm:mx-0" aria-label="O contrato" role="region"><ContratoDoc S={S} d={d} /></div>}
          {P.estado === "adenda" && adendaAgora && <div className="-mx-4 sm:mx-0" aria-label="A adenda" role="region"><AdendaDoc d={d} a={adendaAgora} /></div>}
          {P.estado === "auto" && <div className="-mx-4 sm:mx-0" aria-label="O auto de receção" role="region"><AutoRececaoDoc d={d} /></div>}
          {P.estado === "relatorio" && <RelatorioObra S={S} d={d} docs={docs.filter(([k, t, ok]) => t && ok && k !== "relatorio").map(([k, t]) => [k, t])} abrirDoc={setDoc} />}
          {(P.estado === "preparar" || P.estado === "pedido") && (
            verProposta
              ? <div className="-mx-4 sm:mx-0" aria-label="A proposta" role="region"><PropostaDoc S={S} d={d} /></div>
              : <Botao ghost onClick={() => setVerProposta(true)}>{P.estado === "pedido" ? "Ver a proposta atual" : "Ver a proposta que aceitou"}</Botao>
          )}
          {P.estado === "sem" && <p className="rounded-2xl bg-white p-4 text-[15px] shadow-sm">{o?.versoes?.length ? `A nova versão da proposta (v${versaoAtual(o)}) está a ser preparada, com o que pediu.` : "A sua proposta está a ser preparada."} Avisamos aqui quando estiver pronta.</p>}

          {/* os documentos */}
          {P.estado !== "relatorio" && docs.some(([, t, ok]) => t && ok) && (
            <section aria-label="Documentos" className="rounded-2xl bg-white p-2 shadow-sm">
              <h2 className="px-2 pt-2 text-base font-semibold">Documentos</h2>
              <ul>
                {docs.filter(([, t, ok]) => t && ok).map(([k, t]) => (
                  <li key={k}>
                    <button type="button" onClick={() => setDoc(k)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-[15px] hover:bg-slate-50">
                      <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" /><span className="flex-1">{t}</span><ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {!doc && barra && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3 backdrop-blur" role="region" aria-label="Próximo passo">
          <div className="mx-auto w-full max-w-3xl">{barra}</div>
        </div>
      )}
    </div>
  );
}

/** 16/10: o que o cliente vê dos materiais, lido da encomenda no Inventário novo. */
function MateriaisPortal({ d }: { d: Negocio }) {
  const inv = resumoEcNegocio(useInventario(), d.obra.ec?.ref);
  const texto = !d.obra.ec?.ref ? "todos prontos para a obra." : !inv ? "encomendados." : inv.pronta ? "todos prontos para a obra." : inv.tot.aFornecedor ? (inv.pos.every((x) => x.fase === "por aprovar") ? "uma parte já está reservada; o resto está a ser encomendado." : "uma parte já está reservada; o resto foi encomendado ao fornecedor.") : "a preparar.";
  return <p className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600">Materiais: {texto}</p>;
}
