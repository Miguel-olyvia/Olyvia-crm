// O portal do cliente (14/10/2026; percurso guiado a 15/10): o que o cliente vê no link pessoal, no telemóvel ou no computador.
// Um percurso com o próximo passo sempre à vista: Rever a proposta → Aceitar → Assinar o contrato → Acompanhar o serviço.
// · Proposta por aceitar: a proposta inteira (o mesmo documento), com "Aceitar a proposta" sempre à mão em baixo.
// · Aceite: é o comercial que gera o contrato (decisão do Ruben, 15/10); até lá, "O contrato está a ser preparado", sem botão.
// · Contrato gerado: aparece no mesmo link, por assinar, com o contrato à vista.
// · Assinado: o mesmo link mostra o plano da obra (fases e datas, sem custos nem margens).
// As ações são as do motor, por isso o negócio no protótipo passa de fase como hoje (e o outro separador vê-o pelo storage).
import { useMemo, useRef, useState, type ReactNode } from "react";
import { traduzirEm, type PortalIdioma, type PortalTraducao } from "@/portal-i18n";
import { ArrowLeft, Armchair, Check, ChevronRight, ClipboardCheck, Clock, Copy, Eye, FileText, Grid3x3, Hammer, MessageSquareText, PenLine, Plug, Scale, X, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NaFrente } from "./NaFrente";
import { MOTIVOS_RECUSA, MOTIVOS_VERSAO, eur, versaoAtual, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { ContratoDoc, FaturaDoc, NotaEncomendaDoc, PropostaDoc, TITULOS_CLAUSULAS, totais, tranches } from "./DocsCliente";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA, type FaseObra } from "./fasesObra";
import { useInventario } from "./inventario/loja";
import { resumoEcNegocio } from "./inventario/ponteNegocios";
import { MOTIVOS_RECUSA_ADENDA, adendaComoEnviada, assinadas, diasAdenda, faturasAdenda, porPagar, primeiraPaga, totaisAdenda, valorContrato, versaoAdenda } from "./adendas";
import { AssinaturaContrato } from "./AssinaturaContrato";
import { AutoRececaoDoc } from "./AutoRececao";
import { RelatorioObra } from "./RelatorioObra";
import { em3, ibanAVista, ibanCurto, ibanValido, metodoDe, metodosDe, referenciaMb, useDadosPagamento, vencimento } from "./pagamentoCliente";
import { TrabalhosDaFase } from "./PortalObra";
import { HistoricoObraPortal, ProgressoObraPortal } from "./ObraNoPortal";
import { diaDeHoje, tarefasDoCliente } from "./obraCliente";
import { negocioParaCliente } from "./real/vistaCliente";
import { Conversa } from "./ConversaObra";
import type { FaturaReg } from "./v2/financeiro";
import { nomeEmpresa } from "./acessosPortal";
import { RESPONSAVEL_OBRA } from "./obraOps";
import { CHAVE_CLAUSULA, CHAVE_FASE_CURTA, CHAVE_METODO, CHAVE_MOTIVO, rotuloDiaEm } from "./portalClienteIdioma";

/** 2/11: o portal real (/client-portal/negocios/:id). A proposta aceita-se e o contrato assina-se nas páginas reais do portal (com o
 *  código por SMS e a client-portal-action); a conversa é a da base (negocio_mensagens); o auto de receção assina-se com o código por
 *  SMS (portal_neg_receber_obra). As adendas e o aviso de pagamento vão por portal_neg_responder (aceitar e assinar a adenda com o
 *  código por SMS); as outras respostas (pedir alterações, não aceitar) vão pelas mesmas ações da V1, que a página liga à base. */
export interface PortalReal {
  abrirProposta: () => void;
  abrirContrato: (() => void) | null;
  /** 19/11: a proposta e o contrato (os do negócio, não os das adendas) abrem SEMPRE o documento do template, nas páginas reais
   *  (abrirProposta/abrirContrato), em vez do desenho da V1. Só o portal real o liga; o CRM e o protótipo ficam como estavam. */
  documentosNoTemplate?: boolean;
  conversa: ReactNode;
  /** A assinatura do auto de receção (o código por SMS), com as observações do cliente; `voltar` fecha-a. */
  receberObra: (reservas: string | undefined, voltar: () => void) => ReactNode;
  /** Aceitar ou assinar a adenda com o código por SMS; `voltar` fecha-a. */
  assinarComSms: (o: { titulo: string; texto: string; acao: string; fim: "adenda_aceitar" | "adenda_assinar"; ref: string; voltar: () => void }) => ReactNode;
  /** Avisar que pagou a fatura (o número), com a referência do pagamento e (19/11) a forma que escolheu. Rejeita com a mensagem do erro. */
  avisarPagamento: (numero: string, referencia: string, metodo?: string) => Promise<void>;
  /** As faturas de que o cliente já avisou o pagamento (à espera do Financeiro). */
  avisados: readonly string[];
  /** a resposta a uma ação que ainda não tem caminho no portal real */
  aviso?: string | null;
}

/** Os passos do percurso, pela ordem (em português; o ecrã traduz pelas chaves de CHAVES_PASSOS, em pc.negocioPag.*). */
export const PASSOS_PORTAL = ["Rever a proposta", "Aceitar", "Assinar o contrato", "Acompanhar o serviço", "Receber o serviço"] as const;
const CHAVES_PASSOS = ["pc.negocioPag.passos.1", "pc.negocioPag.passos.2", "pc.negocioPag.passos.3", "pc.negocioPag.passos.4", "pc.negocioPag.passos.5"] as const;
const CHAVES_CURTO = ["pc.negocioPag.curto.1", "pc.negocioPag.curto.2", "pc.negocioPag.curto.3", "pc.negocioPag.curto.4", "pc.negocioPag.curto.5"] as const;
/** 21/10: os passos da adenda (o mesmo percurso do orçamento): a proposta, aceitar, o contrato da adenda, assinar e pagar. */
export const PASSOS_ADENDA = ["Proposta da adenda", "Aceitar", "Contrato da adenda", "Assinar", "Pagar"] as const;
const CHAVES_PASSOS_ADENDA = ["pc.negocioPag.passosAdenda.1", "pc.negocioPag.passosAdenda.2", "pc.negocioPag.passosAdenda.3", "pc.negocioPag.passosAdenda.4", "pc.negocioPag.passosAdenda.5"] as const;
const CHAVES_CURTO_ADENDA = ["pc.negocioPag.curtoAdenda.1", "pc.negocioPag.curtoAdenda.2", "pc.negocioPag.curtoAdenda.3", "pc.negocioPag.curtoAdenda.4", "pc.negocioPag.curtoAdenda.5"] as const;

type EstadoPortal = "rever" | "pedido" | "recusada" | "preparar" | "revisao" | "assinar" | "obra" | "pagar" | "auto" | "relatorio" | "sem";
/** 21/10: a adenda a meio do percurso (a proposta por responder, a nova versão a preparar, o contrato dela, a 1.ª parcela por pagar). */
function passoAdenda(d: Negocio): { i: number; estado: EstadoPortal; adenda: string } | null {
  for (const a of d.adendas ?? []) {
    if (a.estado === "enviada") return { i: 0, estado: a.pedidoCliente ? "pedido" : "rever", adenda: a.n };
    if (a.estado === "rascunho" && a.versoes?.length) return { i: 0, estado: "sem", adenda: a.n };
    if (a.estado === "aceite") return { i: a.contrato === "enviado" ? 3 : 2, estado: a.contratoPedido ? "revisao" : a.contrato === "enviado" ? "assinar" : "preparar", adenda: a.n };
  }
  const a = d.obra.plano?.estado === "concluída" ? undefined : assinadas(d).find((x) => !primeiraPaga(x));
  return a ? { i: 4, estado: "pagar", adenda: a.n } : null;
}

/** Em que passo está o cliente: 0 rever/aceitar, 2 contrato (a preparar ou por assinar), 3 obra,
 *  4 receção (o auto por assinar e, depois, o relatório da obra). 21/10: com uma adenda a meio, o percurso dela (`adenda`). */
export function passoPortal(d: Negocio): { i: number; estado: EstadoPortal; adenda?: string } {
  const o = d.orc;
  if (o?.recusada && d.perdido) return { i: 0, estado: "recusada" };
  if (!o?.enviada) return { i: 0, estado: "sem" };
  if (!o.aceite && o.pedidoCliente) return { i: 0, estado: "pedido" };
  if (!o.aceite) return { i: 0, estado: "rever" };
  if (o.vendaDireta || o.contrato === "assinado") {
    const pa = passoAdenda(d);
    if (pa) return pa;
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
/** Os motivos de alteração e de recusa, nas palavras do cliente: as do dicionário (por dentro guardam-se os mesmos da "Nova versão" do comercial). */
const motivoDe = (L: PortalTraducao, m: string) => (CHAVE_MOTIVO[m] ? L.t(CHAVE_MOTIVO[m]) : m);
const clausulaDe = (L: PortalTraducao, c: string) => (CHAVE_CLAUSULA[c] ? L.t(CHAVE_CLAUSULA[c]) : c);

/** Uma linha "rótulo · valor" com o botão de copiar (diz "Copiado" por um momento). */
function Copiar({ rotulo, valor, mostrar, L }: { rotulo: string; valor: string; mostrar?: string; L: PortalTraducao }) {
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
        <button type="button" onClick={copiar} aria-label={L.t("pc.negocioPag.pagar.copiar", { rotulo: rotulo.toLowerCase() })}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-900">
          {ok ? <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
        <span className="sr-only" aria-live="polite">{ok ? L.t("pc.negocioPag.pagar.copiado") : ""}</span>
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

/** O cartão que leva ao documento do template (a página real da proposta ou do contrato), no lugar do desenho da V1. */
function CartaoDocumento({ tipo, abrir, L }: { tipo: "proposta" | "contrato"; abrir: () => void; L: PortalTraducao }) {
  const { t } = L;
  return (
    <section aria-label={t(`pc.docNegocio.${tipo}.titulo`)} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold">{t(`pc.docNegocio.${tipo}.titulo`)}</h2>
          <p className="text-[15px] text-slate-600">{t(`pc.docNegocio.${tipo}.texto`)}</p>
        </div>
      </div>
      <Botao onClick={abrir}>{t(`pc.docNegocio.${tipo}.abrir`)}</Botao>
    </section>
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

/** "dd/mm" (ou "hoje hh:mm") da emissão → a data, para contar o vencimento. */
function emitidaEm(q: string): Date {
  const m = q.match(/^(\d{2})\/(\d{2})/);
  return m ? new Date(new Date().getFullYear(), Number(m[2]) - 1, Number(m[1])) : new Date();
}

/** 21/10: pagar uma fatura no portal (a do contrato ou a de uma adenda): o valor, a escolha da forma de pagar e só os dados dessa.
 *  `alvo` é onde ficam o método e o comprovativo (os campos do negócio, ou os da adenda). */
function PagarFatura({ numero, montante, vence, refMb, refTeste = true, alvo, titular, verFatura, escolher, pago, autorizar, L }: {
  numero: string; montante: string; vence: string; refMb: string;
  /** 19/11: a referência é a gerada aqui (sem o prestador de pagamentos ligado): diz-se ao cliente que é de teste. */
  refTeste?: boolean;
  alvo: Record<string, string>; titular: string;
  verFatura: () => void; escolher: (m: string) => void; pago: (ref: string) => void; autorizar: (ibanCurto: string, titular: string) => void;
  /** o idioma do portal (a omissão, o português, vem do PortalCliente) */
  L: PortalTraducao;
}) {
  const { t } = L;
  const [ref, setRef] = useState("");
  // o débito direto: o IBAN e o titular da conta do cliente, e a autorização
  const [ibanCli, setIbanCli] = useState("");
  const [titularCli, setTitularCli] = useState<string | null>(null);
  const [autorizo, setAutorizo] = useState(false);
  const empresa = useDadosPagamento();
  if (alvo.comprovativo) return (
    <p className="flex items-center gap-2 text-[15px] text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" />
      {alvo.metodo === "Débito direto" && alvo.debito_iban ? t("pc.negocioPag.pagar.debitoAutorizado", { iban: alvo.debito_iban, vence }) : t("pc.negocioPag.pagar.comprovativo", { comprovativo: alvo.comprovativo })}</p>
  );
  // 4/11: só as formas que a empresa recebe (com os dados dela); uma escolha antiga que já não está volta à transferência
  const formas = metodosDe(empresa);
  const metodo = formas.includes(metodoDe(alvo.metodo)) ? metodoDe(alvo.metodo) : "Transferência", ibanOk = ibanValido(ibanCli), nomeConta = titularCli ?? titular;
  const jaPaguei = (
    <div className="space-y-2 border-t border-slate-200 pt-4">
      <p className="text-[15px] font-medium">{t("pc.negocioPag.pagar.jaPagou")}</p>
      <input value={ref} onChange={(ev) => setRef(ev.target.value)} placeholder={metodo === "Referência MB" ? t("pc.negocioPag.pagar.phTalao") : metodo === "MB Way" ? t("pc.negocioPag.pagar.phMbWay") : t("pc.negocioPag.pagar.phTransferencia")} aria-label={t("pc.negocioPag.pagar.refAria")} className="h-12 w-full rounded-xl border border-slate-300 px-3 text-[15px] outline-none focus:border-slate-900" />
      <Botao onClick={() => pago(ref)}>{t("pc.negocioPag.pagar.jaPaguei")}</Botao>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <p><span className="block text-xs uppercase tracking-[0.12em] text-slate-500">{t("pc.negocioPag.pagar.aPagar")}</span><span className="text-2xl font-semibold tabular-nums">{montante} €</span></p>
        <button type="button" onClick={verFatura} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-slate-900 underline-offset-4 hover:underline">
          <FileText className="h-4 w-4" aria-hidden="true" />{t("pc.negocioPag.pagar.verFatura")}
        </button>
      </div>
      <div className="space-y-2">
        <p className="text-[15px] font-medium">{t("pc.negocioPag.pagar.comoPagar")}</p>
        <div role="radiogroup" aria-label={t("pc.negocioPag.pagar.comoPagarAria")} className={cn("grid gap-2", formas.length > 3 ? "grid-cols-2 sm:grid-cols-4" : formas.length === 3 ? "grid-cols-3" : formas.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {formas.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={metodo === m} onClick={() => escolher(m)}
              className={cn("min-h-12 rounded-xl border px-2 text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2",
                metodo === m ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-slate-500")}>
              {CHAVE_METODO[m] ? t(CHAVE_METODO[m]) : m}
            </button>
          ))}
        </div>
      </div>
      {/* 19/11 (auditoria): só com o prestador de pagamentos configurado (metodosDe → mbDisponivel); sem ele, a opção nem aparece */}
      {metodo === "Referência MB" && <>
        <div className="rounded-xl border border-slate-200 px-4 py-1">
          <p className="pt-2 text-sm font-semibold">{t("pc.negocioPag.pagar.multibanco")}</p>
          <dl className="divide-y divide-slate-100">
            <Copiar L={L} rotulo={t("pc.negocioPag.pagar.rotEntidade")} valor={empresa?.mbEntidade ?? ""} />
            <Copiar L={L} rotulo={t("pc.negocioPag.pagar.rotReferencia")} valor={refMb} mostrar={em3(refMb)} />
            <Copiar L={L} rotulo={t("pc.negocioPag.pagar.rotMontante")} valor={montante} mostrar={`${montante} €`} />
          </dl>
          {refTeste && <p className="pb-2 text-sm text-amber-800">{t("pc.negocioPag.pagar.refTeste")}</p>}
        </div>
        {jaPaguei}
      </>}
      {metodo === "MB Way" && <>
        <div className="rounded-xl border border-slate-200 px-4 py-1">
          <p className="pt-2 text-sm font-semibold">{t("pc.negocioPag.pagar.mbWay")}</p>
          <p className="text-sm text-slate-600">{t("pc.negocioPag.pagar.mbWayAjuda")}</p>
          <dl className="divide-y divide-slate-100">
            <Copiar L={L} rotulo={t("pc.negocioPag.pagar.rotNumero")} valor={(empresa?.mbway ?? "").replace(/\s/g, "")} mostrar={empresa?.mbway ?? ""} />
            <Copiar L={L} rotulo={t("pc.negocioPag.pagar.rotMensagem")} valor={numero} />
            <Copiar L={L} rotulo={t("pc.negocioPag.pagar.rotMontante")} valor={montante} mostrar={`${montante} €`} />
          </dl>
          {empresa?.titular && <p className="pb-2 text-sm text-slate-500">{t("pc.negocioPag.pagar.emNomeDe", { titular: empresa.titular })}</p>}
        </div>
        {jaPaguei}
      </>}
      {metodo === "Transferência" && (empresa?.iban ? <>
        <div className="rounded-xl border border-slate-200 px-4 py-1">
          <p className="pt-2 text-sm font-semibold">{t("pc.negocioPag.pagar.transferencia")}</p>
          <dl className="divide-y divide-slate-100">
            <Copiar L={L} rotulo={t("pc.negocioPag.pagar.rotIban")} valor={empresa.iban.replace(/\s/g, "")} mostrar={ibanAVista(empresa.iban)} />
            <Copiar L={L} rotulo={t("pc.negocioPag.pagar.rotDescritivo")} valor={numero} />
            <Copiar L={L} rotulo={t("pc.negocioPag.pagar.rotMontante")} valor={montante} mostrar={`${montante} €`} />
          </dl>
          {empresa.titular && <p className="pb-2 text-sm text-slate-500">{t("pc.negocioPag.pagar.titular", { titular: empresa.titular })}</p>}
        </div>
        {jaPaguei}
      </> : (
        <>
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-900">{t("pc.negocioPag.pagar.semIban")}</p>
          {/* 19/11: já pagou por outro caminho (com os dados que lhe enviámos): continua a poder avisar */}
          {jaPaguei}
        </>
      ))}
      {metodo === "Débito direto" && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold">{t("pc.negocioPag.pagar.debito")}</p>
          <p className="text-sm text-slate-600">{t("pc.negocioPag.pagar.debitoTexto", { montante, vence })}</p>
          <label className="block space-y-1">
            <span className="text-sm text-slate-600">{t("pc.negocioPag.pagar.ibanConta")}</span>
            <input value={ibanCli} onChange={(ev) => setIbanCli(ev.target.value)} placeholder="PT50 0000 0000 0000 0000 0000 0" inputMode="text" autoComplete="off"
              aria-invalid={ibanCli.trim() !== "" && !ibanOk} aria-describedby={ibanCli.trim() !== "" && !ibanOk ? `iban-erro-${numero}` : undefined} className="h-12 w-full rounded-xl border border-slate-300 px-3 text-[15px] tabular-nums outline-none focus:border-slate-900" />
          </label>
          {ibanCli.trim() !== "" && !ibanOk && <p id={`iban-erro-${numero}`} className="-mt-2 text-sm text-red-700">{t("pc.negocioPag.pagar.ibanInvalido")}</p>}
          <label className="block space-y-1">
            <span className="text-sm text-slate-600">{t("pc.negocioPag.pagar.titularConta")}</span>
            <input value={nomeConta} onChange={(ev) => setTitularCli(ev.target.value)} className="h-12 w-full rounded-xl border border-slate-300 px-3 text-[15px] outline-none focus:border-slate-900" />
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={autorizo} onChange={(ev) => setAutorizo(ev.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-slate-900" />
            {t("pc.negocioPag.pagar.autorizo", {
              quem: empresa?.titular ? t("pc.negocioPag.pagar.quemTitular", { titular: empresa.titular }) : t("pc.negocioPag.pagar.quemEmpresa"),
              credor: empresa?.sepaCredor ? t("pc.negocioPag.pagar.credor", { credor: empresa.sepaCredor }) : "",
            })}
          </label>
          <Botao disabled={!ibanOk || !autorizo || !nomeConta.trim()} onClick={() => autorizar(ibanCurto(ibanCli), nomeConta)}>{t("pc.negocioPag.pagar.autorizar")}</Botao>
        </div>
      )}
    </div>
  );
}

/** `previa` (23/10): "Ver como o cliente", aberto pela equipa: tudo à vista, nada se grava (as ações não correm e diz-se porquê).
 *  `outrosPedidos` (23/10): o cliente com vários negócios volta à lista deles (PortalClienteConta.tsx). */
/** `idioma` (2/11, portal real): o idioma do portal; só o ClientPortalNegocio o passa (do usePortalIdioma). Sem a prop o ecrã sai em português,
 *  como sempre (o CRM, a pré-visualização e o protótipo não leem o idioma do portal). O documento inline das adendas (DocsCliente) fica em português. */
export function PortalCliente({ ctx, d: d0, fechar, previa, outrosPedidos, real, idioma = "pt" }: { ctx: Ctx; d: Negocio; fechar: () => void; previa?: boolean; outrosPedidos?: () => void; real?: PortalReal; idioma?: PortalIdioma }) {
  const { S, A } = ctx;
  const L = traduzirEm(idioma);
  const raiz = useRef<HTMLDivElement>(null);
  const parcela = (i: number) => L.t("pc.negocioPag.parcela", { n: i + 1 });
  const motivo = (m: string) => motivoDe(L, m), clausula = (c: string) => clausulaDe(L, c);
  // 12/11: na pré-visualização, o negócio como vai para o cliente (real/vistaCliente.ts): sem custos, notas e histórico internos
  const dLimpo = useMemo(() => (previa ? negocioParaCliente(d0) : null), [previa, d0]);
  const d = dLimpo ?? d0;
  const [bloqueou, setBloqueou] = useState(false);
  // na pré-visualização nenhuma ação do cliente chega ao motor (antes a equipa aceitava e assinava por ele, sem rasto de quem foi)
  const run: Ctx["run"] = previa ? () => setBloqueou(true) : ctx.run;
  const [doc, setDoc] = useState<string | null>(null);
  // a resposta à proposta (15/10): escolher entre pedir alterações e recusar; depois, os motivos e o texto
  const [resposta, setResposta] = useState<null | "escolher" | "alterar" | "recusar">(null);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState<"aceitar" | "assinar" | "auto" | null>(null);
  // ao receber a obra (15/10): "está tudo bem" ou uma observação, antes de assinar o auto
  const [receber, setReceber] = useState<null | "ok" | "obs">(null);
  const [obs, setObs] = useState("");
  // pedir alterações ao contrato (15/10): as cláusulas escolhidas e o que não agrada em cada uma
  const [pedirContrato, setPedirContrato] = useState(false);
  const [cls, setCls] = useState<Record<string, string>>({});
  const [texto, setTexto] = useState("");
  const [verProposta, setVerProposta] = useState(false);
  const o = d.orc, p = d.obra.plano, nome = d.nome.split(" ")[0];
  const T = o ? totais(d, S) : null;
  const P = passoPortal(d);
  const topo = () => { try { raiz.current?.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* sem scroll */ } };
  const fazer = (fn: () => void) => { setConfirmar(null); run(fn); topo(); };

  // o que mais espera pelo cliente, depois do contrato: adendas e o pagamento
  const outros: { id: string; t: string; sub: string; corpo: ReactNode }[] = [];
  // 2/11, portal real: as faturas das prestações que o Financeiro registou (d.fin.tranches); cada uma por pagar tem o seu cartão
  const faturasReais = real ? (d.fin.tranches ?? []).filter((f) => !f.daDemo) : [];
  const nomeTranche = (f: FaturaReg) => {
    const tr = T ? tranches(d, T.total) : [];
    const i = f.tranche === "unica" ? 0 : Number(f.tranche.replace(/\D/g, "")) - 1;
    return tr[i]?.l ?? L.t("pc.negocioPag.outros.prestacao");
  };
  for (const f of faturasReais.filter((x) => !x.pagamento)) {
    outros.push({
      id: "tr-" + f.id, t: L.t("pc.negocioPag.outros.pagarFatura", { n: f.numero }), sub: L.t("pc.negocioPag.outros.emitida", { prestacao: nomeTranche(f), data: f.data.split("-").reverse().join("/") }),
      corpo: <PagarReal L={L} numero={f.numero} real={real!} montante={eur(f.valor)} vence={vencimento(new Date(f.data + "T12:00:00"), d.f.vencimento || "15 dias")} refMb={referenciaMb(d.id, f.numero)} titular={d.nome} verFatura={() => setDoc("tr:" + f.id)} />,
    });
  }
  if (d.fin.fatura && !d.fin.pago && T && !faturasReais.some((f) => f.numero === d.fin.fatura?.n)) {
    // 15/10: a fatura à vista e os dados para pagar, cada um com o botão de copiar; 21/10: o cliente escolhe a forma de pagar
    const ft = d.fin.fatura, t0 = tranches(d, T.total)[0];
    const vence = vencimento(emitidaEm(ft.q), d.f.vencimento || "15 dias");
    outros.push({
      id: "pag", t: L.t("pc.negocioPag.outros.pagarFatura", { n: ft.n }), sub: L.t("pc.negocioPag.outros.vence", { prestacao: t0.l, vence }),
      corpo: real ? <PagarReal L={L} numero={ft.n} real={real} montante={eur(t0.v)} vence={vence} refMb={referenciaMb(d.id, ft.n)} titular={d.nome} verFatura={() => setDoc("fatura")} /> : <PagarFatura L={L} numero={ft.n} montante={eur(t0.v)} vence={vence} refMb={referenciaMb(d.id, ft.n)} alvo={d.f} titular={d.nome} verFatura={() => setDoc("fatura")}
        escolher={(m) => run(() => A.escolherMetodo(d.id, m))} pago={(r) => fazer(() => A.avisarPagamento(d.id, r))} autorizar={(i, t) => fazer(() => A.autorizarDebito(d.id, i, t))} />,
    });
  }
  // 21/10 (decisão C): cada parcela de cada adenda assinada tem a sua fatura (o Financeiro emite-a); paga-se aqui como a do contrato
  // 21/10: só as faturas já emitidas (as parcelas seguintes só se emitem depois de paga a 1.ª), pela ordem das parcelas
  for (const { a, f: ft } of [...porPagar(d)].sort((x, y) => x.f.i - y.f.i)) {
    const vence = vencimento(emitidaEm(ft.q), "15 dias");
    outros.push({
      id: "pag-" + ft.n, t: L.t("pc.negocioPag.outros.pagarFatura", { n: ft.n }), sub: L.t("pc.negocioPag.outros.adenda", { n: a.n, parcela: parcela(ft.i), fatura: ft.l.toLowerCase(), vence }) + (ft.i > 0 && !primeiraPaga(a) ? L.t("pc.negocioPag.outros.primeiro", { parcela: parcela(0) }) : ""),
      corpo: real ? <PagarReal L={L} numero={ft.n} real={real} montante={eur(ft.v)} vence={vence} refMb={referenciaMb(d.id, ft.n)} titular={d.nome} verFatura={() => setDoc("ft:" + ft.n)} /> : <PagarFatura L={L} numero={ft.n} montante={eur(ft.v)} vence={vence} refMb={referenciaMb(d.id, ft.n)} alvo={ft.pag ?? {}} titular={d.nome} verFatura={() => setDoc("ft:" + ft.n)}
        escolher={(m) => run(() => A.escolherMetodo(d.id, m, ft.n))} pago={(r) => fazer(() => A.avisarPagamento(d.id, r, ft.n))} autorizar={(i, t) => fazer(() => A.autorizarDebito(d.id, i, t, ft.n))} />,
    });
  }

  const adendasAssinadas = assinadas(d).length, au = d.obra.auto;
  // 21/10: o que é de cada adenda, a partir da proposta enviada (também as que não aceitou ou foram retiradas, com o estado)
  const docsAdenda = (d.adendas ?? []).filter((a) => a.enviada || a.versoes?.length).flatMap((a): [string, string, boolean][] => {
    const chaveEst = a.estado === "recusada" ? "pc.negocioPag.doc.naoAceite" : a.estado === "anulada" ? "pc.negocioPag.doc.retirada" : a.estado === "rascunho" ? "pc.negocioPag.doc.novaVersao" : a.estado === "enviada" ? "pc.negocioPag.doc.porResponder" : null;
    const est = chaveEst ? ` · ${L.t(chaveEst)}` : "";
    const v = versaoAdenda(adendaComoEnviada(a));
    return [
      ["prop:" + a.n, L.t("pc.negocioPag.doc.tPropostaAdenda", { n: a.n }) + (v > 1 ? ` (v${v})` : "") + est, true],
      ["ct:" + a.n, L.t("pc.negocioPag.doc.tAdendaContrato", { n: a.n }) + ` · ${L.t(a.estado === "assinada" ? "pc.negocioPag.doc.adendaAssinada" : "pc.negocioPag.doc.adendaPorAssinar")}`, a.estado === "assinada" || (a.estado === "aceite" && a.contrato === "enviado")],
      ...faturasAdenda(a).map((f): [string, string, boolean] => ["ft:" + f.n, L.t("pc.negocioPag.doc.tFaturaAdenda", { n: f.n, adenda: a.n, parcela: parcela(f.i) }) + (f.recibo ? ` · ${L.t("pc.negocioPag.doc.pagaRecibo", { n: f.recibo.n })}` : ""), true]),
    ];
  });
  // 19/11, portal real: a proposta e o contrato do negócio abrem o documento do template (páginas reais), nunca o desenho da V1;
  // sem o contrato real (abrirContrato nulo) não há como o abrir no template, e por isso não se lista.
  const noTemplate = !!real?.documentosNoTemplate;
  const abrirDocumento = (k: string) => {
    if (noTemplate && k === "proposta") return real!.abrirProposta();
    if (noTemplate && k === "contrato" && real!.abrirContrato) return real!.abrirContrato();
    setDoc(k);
  };
  const docs: [string, string, boolean][] = [
    ["proposta", L.t("pc.negocioPag.doc.tPropostaPr", { id: d.id }), !!o?.enviada],
    // 15/10: as adendas assinadas juntam-se ao contrato (o documento do contrato mostra-as)
    ["contrato", L.t("pc.negocioPag.doc.tContratoCt", { id: d.id }) + (adendasAssinadas ? ` + ${L.tn("pc.negocioPag.doc.maisUmaAdenda", "pc.negocioPag.doc.maisAdendas", adendasAssinadas)}` : ""), !!o?.contrato && !(noTemplate && !real?.abrirContrato)],
    ...docsAdenda,
    ["encomenda", d.obra.ec ? L.t("pc.negocioPag.doc.tEncomenda", { n: d.obra.ec.n }) : "", !!d.obra.ec],
    // 3/11: paga no Eticadata ou validada à mão no CRM, o cliente vê-a como paga
    ["fatura", d.fin.fatura ? L.t("pc.negocioPag.doc.tFatura", { n: d.fin.fatura.n }) + (d.fin.pago ? ` · ${d.fin.recibo ? L.t("pc.negocioPag.doc.pagaRecibo", { n: d.fin.recibo.n }) : L.t("pc.negocioPag.doc.paga")}` : ` · ${L.t("pc.negocioPag.doc.porPagar")}`) : "", !!d.fin.fatura && !faturasReais.some((f) => f.numero === d.fin.fatura?.n)],
    ...faturasReais.map((f): [string, string, boolean] => ["tr:" + f.id,
      L.t("pc.negocioPag.doc.tFaturaPrestacao", { n: f.numero, prestacao: nomeTranche(f) }) + (f.pagamento ? ` · ${f.recibo ? L.t("pc.negocioPag.doc.pagaRecibo", { n: f.recibo }) : L.t("pc.negocioPag.doc.paga")}` : ` · ${L.t("pc.negocioPag.doc.porPagar")}`), true]),
    ["auto", au ? L.t("pc.negocioPag.doc.tAuto", { n: au.n }) : "", !!au],
    ["relatorio", L.t("pc.negocioPag.doc.tRelatorio"), au?.estado === "assinado"],
  ];
  const daAdenda = (n: string) => d.adendas?.find((x) => x.n === n);
  const corpoDoc = (k: string) => k === "proposta" ? <PropostaDoc S={S} d={d} /> : k === "contrato" ? <ContratoDoc S={S} d={d} /> : k === "encomenda" ? <NotaEncomendaDoc d={d} /> : k === "fatura" ? <FaturaDoc S={S} d={d} />
    : k.startsWith("tr:") ? (() => { const f = faturasReais.find((x) => x.id === k.slice(3)); return f ? <FaturaDoc S={S} d={d} reg={f} regParcela={nomeTranche(f)} /> : null; })()
    : k === "auto" ? <AutoRececaoDoc d={d} /> : k === "relatorio" ? <div className="mx-auto max-w-3xl"><RelatorioObra S={S} d={d} /></div>
    : k.startsWith("prop:") ? (() => { const a = daAdenda(k.slice(5)); return a ? <PropostaDoc S={S} d={d} a={a} /> : null; })()
    : k.startsWith("ct:") ? (() => { const a = daAdenda(k.slice(3)); return a ? <ContratoDoc S={S} d={d} a={a} /> : null; })()
    : k.startsWith("ft:") ? (() => { for (const a of d.adendas ?? []) { const f = faturasAdenda(a).find((x) => x.n === k.slice(3)); if (f) return <FaturaDoc S={S} d={d} a={a} ft={f} />; } return null; })()
    : null;
  // 21/10: a adenda a meio do percurso (a proposta, o contrato dela, a 1.ª parcela por pagar) e os totais dela (com o IVA por taxa)
  const ad = P.adenda ? daAdenda(P.adenda) ?? null : null;
  const TA = ad ? totaisAdenda(adendaComoEnviada(ad)) : null;

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
  if (P.estado === "rever" && (ad ? !!TA : o && T)) {
    agora = resposta === "escolher" ? (
      <>
        <h2 className="text-xl font-semibold">{L.t("pc.negocioPag.escolher.titulo")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.escolher.sub")}</p>
        <ul className="mt-4 grid gap-3">
          {([
            ["alterar", MessageSquareText, L.t("pc.negocioPag.escolher.alterar"), ad ? L.t("pc.negocioPag.escolher.alterarAdenda") : L.t("pc.negocioPag.escolher.alterarProposta")],
            ["recusar", XCircle, ad ? L.t("pc.negocioPag.escolher.recusarAdenda") : L.t("pc.negocioPag.escolher.recusarProposta"), ad ? L.t("pc.negocioPag.escolher.recusarAdendaSub") : L.t("pc.negocioPag.escolher.recusarPropostaSub")],
          ] as const).map(([k, Ic, t, sub]) => (
            <li key={k}><button type="button" onClick={() => responder(k)}
              className="flex min-h-20 w-full items-start gap-3 rounded-xl border border-slate-300 bg-white p-4 text-left outline-none transition-colors hover:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-900">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", k === "recusar" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700")} aria-hidden="true"><Ic className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-base font-semibold">{t}</span><span className="block text-[15px] text-slate-600">{sub}</span></span>
              <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </button></li>
          ))}
        </ul>
        <div className="mt-3"><Botao ghost onClick={() => responder(null)}>{L.t("pc.negocioPag.escolher.voltarProposta")}</Botao></div>
      </>
    ) : resposta === "alterar" ? (
      <>
        <h2 className="text-xl font-semibold">{L.t("pc.negocioPag.alterar.titulo")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.alterar.sub")}</p>
        <div className="mt-4"><Chips rotulo={L.t("pc.negocioPag.alterar.aria")} opcoes={MOTIVOS_VERSAO} on={motivos} mudar={setMotivos} nome={motivo} /></div>
        <label className="mt-4 block">
          <span className="text-[15px] font-medium">{L.t("pc.negocioPag.alterar.label")}</span>
          <textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={3} placeholder={L.t("pc.negocioPag.alterar.placeholder")}
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-slate-900" />
        </label>
        <div className="mt-4 grid gap-2">
          <Botao disabled={!motivos.length && !texto.trim()} onClick={() => { fazer(() => (ad ? A.pedirAlteracoesAdenda(d.id, ad.n, texto, motivos) : A.pedirAlteracoes(d.id, texto, motivos))); responder(null); }}>{L.t("pc.negocioPag.alterar.enviar")}</Botao>
          <Botao ghost onClick={() => responder("escolher")}>{L.t("pc.negocioPag.voltar")}</Botao>
        </div>
      </>
    ) : resposta === "recusar" ? (
      <>
        <h2 className="text-xl font-semibold">{ad ? L.t("pc.negocioPag.recusar.tituloAdenda") : L.t("pc.negocioPag.recusar.tituloProposta")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{ad ? L.t("pc.negocioPag.recusar.introAdenda") : L.t("pc.negocioPag.recusar.introProposta")}{" "}{L.t("pc.negocioPag.recusar.parte")}{" "}<button type="button" onClick={() => responder("alterar")} className="font-medium text-slate-900 underline underline-offset-4">{L.t("pc.negocioPag.recusar.pecaAlteracoes")}</button>.</p>
        <div className="mt-4"><Chips rotulo={ad ? L.t("pc.negocioPag.recusar.ariaAdenda") : L.t("pc.negocioPag.recusar.ariaProposta")} opcoes={ad ? MOTIVOS_RECUSA_ADENDA : MOTIVOS_RECUSA} on={motivos} mudar={setMotivos} nome={motivo} /></div>
        <label className="mt-4 block">
          <span className="text-[15px] font-medium">{L.t("pc.negocioPag.recusar.acrescentar")} <span className="font-normal text-slate-500">{L.t("pc.negocioPag.recusar.opcional")}</span></span>
          <textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={2}
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-slate-900" />
        </label>
        <div className="mt-4 grid gap-2">
          {ad
            ? <Botao perigo disabled={!motivos.length && !texto.trim()} onClick={() => { const m = [...motivos, texto.trim()].filter(Boolean).join(" · "); fazer(() => A.recusarAdenda(d.id, ad.n, m)); responder(null); }}>{L.t("pc.negocioPag.escolher.recusarAdenda")}</Botao>
            : <Botao perigo disabled={!motivos.length} onClick={() => { fazer(() => A.recusarProposta(d.id, motivos, texto)); responder(null); }}>{L.t("pc.negocioPag.escolher.recusarProposta")}</Botao>}
          <Botao ghost onClick={() => responder("escolher")}>{L.t("pc.negocioPag.voltar")}</Botao>
        </div>
      </>
    ) : ad && TA ? (
      // 21/10: a proposta da adenda, como a do orçamento: o total com IVA, os dias a mais e o valor do contrato antes e depois
      <>
        <p className="text-sm font-medium text-slate-500">{L.t("pc.negocioPag.passoAdendaDe", { n: 1 })}{ad.versoes?.length ? ` · ${L.t("pc.negocioPag.versaoPedida", { v: versaoAdenda(ad) })}` : ""}</p>
        <h2 className="mt-0.5 text-xl font-semibold">{L.t("pc.negocioPag.rever.adendaTitulo", { n: ad.n })}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.rever.adendaTexto", { trabalhos: ad.linhas.map((x) => x.n).join(", ") })}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">{L.t("pc.negocioPag.rever.aMais")}</dt><dd className="text-lg font-semibold tabular-nums">{eur(TA.total)} €</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">{L.t("pc.negocioPag.rever.prazo")}</dt><dd className="text-lg font-semibold tabular-nums">+{L.tn("pc.docObra.diaUtil", "pc.docObra.diasUteis", diasAdenda(ad.linhas))}</dd></div>
        </dl>
        <p className="mt-3 text-sm tabular-nums text-slate-500">{L.t("pc.negocioPag.rever.contratoPassa", { de: eur(valorContrato(d, S).total), para: eur(valorContrato(d, S).total + TA.total) })}</p>
      </>
    ) : (
      <>
        <p className="text-sm font-medium text-slate-500">{L.t("pc.negocioPag.passoDe", { n: 1 })}{o.versoes?.length ? ` · ${L.t("pc.negocioPag.versaoPedida", { v: versaoAtual(o) })}` : ""}</p>
        <h2 className="mt-0.5 text-xl font-semibold">{L.t("pc.negocioPag.rever.titulo")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.rever.texto")}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">{L.t("pc.negocioPag.rever.totalIva")}</dt><dd className="text-lg font-semibold tabular-nums">{eur(T.total)} €</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">{L.t("pc.negocioPag.rever.prazo")}</dt><dd className="text-lg font-semibold tabular-nums">{d.f.prazo_exec ? L.t("pc.docObra.diasUteis", { n: d.f.prazo_exec }) : L.t("pc.negocioPag.rever.aCombinar")}</dd></div>
        </dl>
      </>
    );
  } else if (P.estado === "pedido" && (ad ? ad.pedidoCliente : o?.pedidoCliente)) {
    const pc = ad ? ad.pedidoCliente! : o!.pedidoCliente!;
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />{L.t("pc.negocioPag.pedido.enviado")}</p>
        <h2 className="mt-2 text-xl font-semibold">{ad ? L.t("pc.negocioPag.pedido.tituloAdenda", { n: ad.n }) : L.t("pc.negocioPag.pedido.tituloProposta")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.pedido.texto")}</p>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-500">{L.t("pc.negocioPag.pedido.oQuePediu")}</p>
          {pc.motivos.length > 0 && <p className="mt-1 text-[15px]">{pc.motivos.map(motivo).join(" · ")}</p>}
          {pc.nota && <p className="mt-1 text-[15px] text-slate-600">«{pc.nota}»</p>}
        </div>
      </>
    );
  } else if (P.estado === "recusada") {
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-slate-600"><XCircle className="h-5 w-5" aria-hidden="true" />{L.t("pc.negocioPag.recusada.etiqueta")}</p>
        <h2 className="mt-2 text-xl font-semibold">{L.t("pc.negocioPag.recusada.titulo")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.recusada.texto")}</p>
      </>
    );
  } else if (P.estado === "preparar" && !ad && !o?.contratoVersoes?.length && (outros.some((x) => x.id === "pag" || x.id.startsWith("tr-")) || d.fin.pago || faturasReais.some((f) => f.pagamento))) {
    // 16/11 (o fluxo em vigor): proposta aceite → contrato assinado → fatura e pagamento → medidas e plano da obra. Este cartão fica para
    // os negócios de antes (de 12/11 a 16/11 faturava-se antes do contrato): a fatura já está emitida e o contrato ainda por gerar.
    const porPagar = outros.some((x) => x.id === "pag" || x.id.startsWith("tr-"));
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />{porPagar ? L.t("pc.negocioPag.aceite.proposta") : L.t("pc.negocioPag.aceite.pagamentoRecebido")}</p>
        <h2 className="mt-2 text-xl font-semibold">{porPagar ? L.t("pc.negocioPag.aceite.primeiroPagamento") : L.t("pc.negocioPag.aceite.estamosAPreparar")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{porPagar
          ? L.t("pc.negocioPag.aceite.textoPorPagar")
          : L.t("pc.negocioPag.aceite.textoPago")}</p>
      </>
    );
  } else if (P.estado === "preparar") {
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />{ad ? L.t("pc.negocioPag.aceite.adenda", { n: ad.n }) : L.t("pc.negocioPag.aceite.proposta")}</p>
        <h2 className="mt-2 text-xl font-semibold">{(ad ?? o)?.contratoVersoes?.length ? (ad ? L.t("pc.negocioPag.preparar.versaoContratoAdenda") : L.t("pc.negocioPag.preparar.versaoContrato")) : ad ? L.t("pc.negocioPag.preparar.contratoAdenda") : L.t("pc.negocioPag.preparar.contrato")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.preparar.texto")}</p>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Clock className="h-4 w-4" aria-hidden="true" />{L.t("pc.negocioPag.preparar.mesmoDia")}</p>
      </>
    );
  } else if (P.estado === "assinar") {
    // 15/10: assinar abre aqui, no cartão do passo: Chave Móvel Digital ou código por SMS (AssinaturaContrato.tsx)
    agora = confirmar === "assinar" ? (
      ad && real
        ? real.assinarComSms({ titulo: L.t("pc.negocioPag.assinar.adendaTitulo", { n: ad.n }), texto: L.t("pc.negocioPag.assinar.adendaLi", { n: ad.n, id: d.id }), acao: L.t("pc.negocioPag.assinar.adenda"), fim: "adenda_assinar", ref: ad.n, voltar: () => setConfirmar(null) })
        : ad
        ? <AssinaturaContrato nome={d.f.nome_fiscal || d.nome} telemovel={d.tel} contrato={ad.n} aceito={`Li e aceito a adenda ${ad.n} ao contrato CT 2026/${d.id}.`} acao="Assinar a adenda" voltar="Voltar à adenda"
            onAssinar={(as) => fazer(() => A.assinarAdendaCom(d.id, ad.n, as))} onCancelar={() => setConfirmar(null)} />
        : <AssinaturaContrato nome={d.f.nome_fiscal || d.nome} telemovel={d.tel} contrato={`CT 2026/${d.id}`}
            onAssinar={(a) => fazer(() => A.assinarCom(d.id, a))} onCancelar={() => setConfirmar(null)} />
    ) : (
      pedirContrato ? (
      <>
        <h2 className="text-xl font-semibold">{ad ? L.t("pc.negocioPag.pedirContrato.tituloAdenda") : L.t("pc.negocioPag.pedirContrato.titulo")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.pedirContrato.texto")}</p>
        <div className="mt-4"><Chips rotulo={L.t("pc.negocioPag.pedirContrato.aria")} nome={clausula} opcoes={TITULOS_CLAUSULAS} on={Object.keys(cls)} mudar={(v) => setCls((a) => Object.fromEntries(v.map((c) => [c, a[c] ?? ""])))} /></div>
        {Object.keys(cls).map((c) => (
          <label key={c} className="mt-4 block animate-in fade-in-0">
            <span className="text-[15px] font-medium">{L.t("pc.negocioPag.pedirContrato.naoAgrada", { clausula: clausula(c) })}</span>
            <textarea value={cls[c]} rows={2} onChange={(ev) => setCls((a) => ({ ...a, [c]: ev.target.value }))}
              className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-slate-900" />
          </label>
        ))}
        <div className="mt-4 grid gap-2">
          <Botao disabled={!Object.keys(cls).length || Object.values(cls).some((x) => !x.trim())}
            onClick={() => { const cs = Object.entries(cls).map(([c, nota]) => ({ c, nota })); fazer(() => (ad ? A.pedirAlteracoesContratoAdenda(d.id, ad.n, cs) : A.pedirAlteracoesContrato(d.id, cs))); setPedirContrato(false); setCls({}); }}>{L.t("pc.negocioPag.alterar.enviar")}</Botao>
          <Botao ghost onClick={() => { setPedirContrato(false); setCls({}); }}>{L.t("pc.negocioPag.pedirContrato.voltar")}</Botao>
        </div>
      </>
    ) : ad ? (
      // 21/10: o contrato da adenda, como o contrato: lê-se em baixo e assina-se com a Chave Móvel Digital ou o código por SMS
      <>
        <p className="text-sm font-medium text-slate-500">{L.t("pc.negocioPag.passoAdendaDe", { n: 4 })}{ad.contratoRevisto ? ` · ${L.t("pc.negocioPag.versaoRevista", { v: (ad.contratoVersoes?.length ?? 0) + 1 })}` : ""}</p>
        <h2 className="mt-0.5 text-xl font-semibold">{L.t("pc.negocioPag.assinar.adendaTitulo", { n: ad.n })}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.assinar.adendaTexto", { trabalhos: ad.linhas.map((x) => x.n).join(", ") })}</p>
        {TA && <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">{L.t("pc.negocioPag.rever.aMais")}</dt><dd className="text-lg font-semibold tabular-nums">{eur(TA.total)} €</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">{L.t("pc.negocioPag.rever.prazo")}</dt><dd className="text-lg font-semibold tabular-nums">+{L.tn("pc.docObra.diaUtil", "pc.docObra.diasUteis", diasAdenda(ad.linhas))}</dd></div>
        </dl>}
      </>
    ) : (
      <>
        <p className="text-sm font-medium text-slate-500">{L.t("pc.negocioPag.passoDe", { n: 3 })}{o?.contratoRevisto ? ` · ${L.t("pc.negocioPag.versaoRevista", { v: (o.contratoVersoes?.length ?? 0) + 1 })}` : ""}</p>
        <h2 className="mt-0.5 text-xl font-semibold">{L.t("pc.negocioPag.assinar.contratoTitulo")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.assinar.contratoTexto", { id: d.id })}</p>
      </>
    ));
  } else if (P.estado === "revisao" && (ad ? ad.contratoPedido : o?.contratoPedido)) {
    const cp = ad ? ad.contratoPedido! : o!.contratoPedido!;
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />{L.t("pc.negocioPag.pedido.enviado")}</p>
        <h2 className="mt-2 flex items-start gap-2 text-xl font-semibold"><Scale className="mt-1 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />{ad ? L.t("pc.negocioPag.revisao.tituloAdenda") : L.t("pc.negocioPag.revisao.titulo")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.revisao.texto")}</p>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-500">{L.t("pc.negocioPag.pedido.oQuePediu")}</p>
          <ul className="mt-1 space-y-1">{cp.clausulas.map((x) => <li key={x.c} className="text-[15px]"><b className="font-medium">{clausula(x.c)}:</b> <span className="text-slate-600">«{x.nota}»</span></li>)}</ul>
        </div>
      </>
    );
  } else if (P.estado === "sem" && ad) {
    agora = (
      <>
        <p className="text-sm font-medium text-slate-500">{L.t("pc.negocioPag.trabalhosMais")}</p>
        <h2 className="mt-0.5 text-xl font-semibold">{L.t("pc.negocioPag.adendaNova.titulo", { n: ad.n, v: versaoAdenda(ad) })}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.adendaNova.texto")}</p>
      </>
    );
  } else if (P.estado === "pagar" && ad) {
    // 21/10 (decisão C): assinada, a adenda paga-se nas mesmas parcelas do contrato; a 1.ª põe os trabalhos e os materiais a andar
    const f0 = faturasAdenda(ad).find((f) => f.i === 0);
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />{L.t("pc.negocioPag.adendaPagar.assinada", { n: ad.n })}</p>
        <h2 className="mt-2 text-xl font-semibold">{f0 ? L.t("pc.negocioPag.adendaPagar.titulo", { parcela: parcela(0) }) : L.t("pc.negocioPag.adendaPagar.faturaCaminho", { parcela: parcela(0) })}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{f0
          ? f0.pag?.comprovativo ? L.t("pc.negocioPag.adendaPagar.textoAvisado") : L.t("pc.negocioPag.adendaPagar.textoPagar")
          : L.t("pc.negocioPag.adendaPagar.textoCaminho")}</p>
      </>
    );
  } else if (P.estado === "auto" && au) {
    agora = confirmar === "auto" ? real ? real.receberObra(receber === "obs" ? obs : undefined, () => setConfirmar(null)) : (
      <AssinaturaContrato nome={d.f.nome_fiscal || d.nome} telemovel={d.tel} contrato={au.n} aceito={`Recebi a obra e li o auto de receção ${au.n}.`} acao="Assinar o auto" voltar="Voltar ao auto"
        onAssinar={(as) => fazer(() => A.assinarAuto(d.id, as, receber === "obs" ? obs : undefined))} onCancelar={() => setConfirmar(null)} />
    ) : (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />{L.t("pc.negocioPag.auto.etiqueta")}</p>
        <h2 className="mt-2 text-xl font-semibold">{L.t("pc.negocioPag.auto.titulo")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.auto.texto")}</p>
        <fieldset className="mt-4 border-t border-slate-200 pt-4">
          <legend className="text-[15px] font-medium">{L.t("pc.negocioPag.auto.comoEncontrou")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {([["ok", "pc.negocioPag.auto.tudoBem"], ["obs", "pc.negocioPag.auto.observacao"]] as const).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={receber === k} onClick={() => setReceber(k)}
                className={cn("flex min-h-12 items-center gap-2 rounded-xl border px-4 text-left text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900",
                  receber === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:border-slate-500")}>
                {receber === k && <Check className="h-4 w-4" aria-hidden="true" />}{L.t(t)}
              </button>
            ))}
          </div>
          {receber === "obs" && (
            <label className="mt-3 block animate-in fade-in-0">
              <span className="text-[15px] font-medium">{L.t("pc.negocioPag.auto.suaObservacao")}</span>
              <textarea value={obs} onChange={(ev) => setObs(ev.target.value)} rows={3} placeholder={L.t("pc.negocioPag.auto.exObservacao")}
                className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-slate-900" />
              <span className="text-sm text-slate-500">{L.t("pc.negocioPag.auto.fica")}</span>
            </label>
          )}
        </fieldset>
      </>
    );
  } else if (P.estado === "relatorio" && au) {
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><ClipboardCheck className="h-5 w-5" aria-hidden="true" />{L.t("pc.negocioPag.relatorio.etiqueta", { n: au.n })}</p>
        <h2 className="mt-2 text-xl font-semibold">{L.t("pc.negocioPag.relatorio.titulo")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">{L.t("pc.negocioPag.relatorio.texto")}</p>
      </>
    );
  } else if (P.estado === "obra") {
    const ultimo = fasesObra.length ? Math.max(...fasesObra.map((x) => x.i1)) : 0;
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />{o?.vendaDireta ? L.t("pc.negocioPag.obra.propostaAceite") : L.t("pc.negocioPag.obra.contratoAssinado")}</p>
        <h2 className="mt-2 text-xl font-semibold">{L.t("pc.negocioPag.obra.titulo")}</h2>
        <p className="mt-1 text-[15px] text-slate-600">
          {p?.estado === "concluída" ? L.t("pc.negocioPag.obra.concluida")
            : p?.estado === "em curso" ? (() => {
                // o que a equipa está a fazer hoje e quando acaba, numa frase
                // 12/11: o dia pelo calendário (o p.dia da vista fica parado até alguém da equipa abrir o negócio)
                const k = diaDeHoje(p), hoje = [...new Set(tarefasDoCliente(p).filter((t) => t.dia <= k && k < t.dia + t.dur && t.exec?.estado !== "validada").map((t) => t.nome.toLowerCase()))];
                const fim = rotuloDiaEm(p, Math.max(...p.tasks.map((t) => t.dia + t.dur)) - 1, L.idioma);
                return L.t("pc.negocioPag.obra.emCurso", { hoje: hoje.length ? L.t("pc.negocioPag.obra.hoje", { trabalhos: hoje.join(L.t("pc.negocioPag.obra.e")) }) : "", fim });
              })()
            : p && p.origem === "orcamento" && fasesObra.length ? L.t("pc.negocioPag.obra.datas", { inicio: rotuloDiaEm(p, 0, L.idioma), fim: rotuloDiaEm(p, ultimo, L.idioma) })
            : L.t("pc.negocioPag.obra.semDatas")}
        </p>
        {d.adendas?.at(-1)?.estado === "recusada" && <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600">{L.t("pc.negocioPag.obra.adendaNaoAceite", { n: d.adendas.at(-1)!.n })}</p>}
      </>
    );
  }

  /** A obra à vista: depois de assinar o contrato, e com a 1.ª parcela de uma adenda por pagar. */
  const naObra = P.estado === "obra" || P.estado === "pagar";
  /** 12/11: o progresso e o histórico da obra: com o contrato assinado e o plano feito, até ao relatório final. */
  const obraVisivel = !!p && (!!o?.vendaDireta || o?.contrato === "assinado") && P.estado !== "relatorio";
  // 2/11, portal real: aceitar a adenda pede o código por SMS (no lugar da confirmação da V1)
  if (real && ad && TA && P.estado === "rever" && confirmar === "aceitar") {
    agora = real.assinarComSms({ titulo: L.t("pc.negocioPag.aceitarAdenda.acao") + ` ${ad.n}`, texto: L.t("pc.negocioPag.aceitarAdenda.texto", { total: eur(TA.total), dias: L.tn("pc.docObra.diaUtil", "pc.docObra.diasUteis", diasAdenda(ad.linhas)) }),
      acao: L.t("pc.negocioPag.aceitarAdenda.acao"), fim: "adenda_aceitar", ref: ad.n, voltar: () => setConfirmar(null) });
  }

  /* ---------------------------------------------- a barra fixa em baixo: o próximo passo sempre à mão */
  // 2/11, portal real: aceitar e assinar o contrato abrem as páginas reais; a adenda e o auto respondem-se aqui, com o código por SMS
  const barraReal = !real ? null : ad && P.estado === "rever" ? (
    resposta || confirmar === "aceitar" ? null : (
      <div className="flex flex-col gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <div className="sm:w-64"><Botao onClick={() => { setConfirmar("aceitar"); topo(); }}>{L.t("pc.negocioPag.aceitarAdenda.acao")}</Botao></div>
        <button type="button" onClick={() => responder("escolher")} className="min-h-11 text-[15px] font-medium text-slate-600 underline-offset-4 hover:underline sm:mr-auto">{L.t("pc.negocioPag.pedirOuRecusar")}</button>
      </div>
    )
  ) : ad && P.estado === "assinar" ? (
    confirmar === "assinar" || pedirContrato ? null : (
      <div className="flex flex-col gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <div className="sm:w-64"><Botao onClick={() => { setConfirmar("assinar"); topo(); }}><span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4" aria-hidden="true" />{L.t("pc.negocioPag.assinar.adenda")}</span></Botao></div>
        <button type="button" onClick={() => { setPedirContrato(true); topo(); }} className="min-h-11 text-[15px] font-medium text-slate-600 underline-offset-4 hover:underline sm:mr-auto">{L.t("pc.negocioPag.assinar.pedirAdenda")}</button>
      </div>
    )
  ) : !ad && P.estado === "rever" ? (
    <div className="sm:ml-auto sm:w-72"><Botao onClick={real.abrirProposta}>{L.t("pc.negocioPag.responder")}</Botao></div>
  ) : !ad && P.estado === "assinar" && real.abrirContrato ? (
    <div className="sm:ml-auto sm:w-72"><Botao onClick={real.abrirContrato}><span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4" aria-hidden="true" />{L.t("pc.negocioPag.assinar.contratoTitulo")}</span></Botao></div>
  ) : P.estado === "auto" ? (
    confirmar === "auto" ? null : (
      <div className="flex flex-col gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <div className="sm:w-72"><Botao disabled={!receber || (receber === "obs" && !obs.trim())} onClick={() => { setConfirmar("auto"); topo(); }}><span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4" aria-hidden="true" />{L.t("pc.negocioPag.auto.assinar")}</span></Botao></div>
        {!receber && <p className="text-center text-sm text-slate-500 sm:mr-auto sm:text-left">{L.t("pc.negocioPag.auto.digaPrimeiro")}</p>}
      </div>
    )
  ) : null;
  const barra = real ? barraReal : P.estado === "rever" && !resposta ? (
    confirmar === "aceitar" ? (
      <div className="space-y-2">
        {ad
          ? <p className="text-[15px]">{L.t("pc.negocioPag.confirmar.adenda", { n: ad.n })} <b className="tabular-nums">{TA ? eur(TA.total) : ""} €</b> {L.t("pc.negocioPag.confirmar.iva")}</p>
          : <p className="text-[15px]">{L.t("pc.negocioPag.confirmar.proposta", { id: d.id })} <b className="tabular-nums">{T ? eur(T.total) : ""} €</b> {L.t("pc.negocioPag.confirmar.iva")}</p>}
        <div className="grid grid-cols-2 gap-2"><Botao ghost onClick={() => setConfirmar(null)}>{L.t("pc.negocioPag.voltar")}</Botao><Botao onClick={() => fazer(() => (ad ? A.aceitarAdenda(d.id, ad.n) : A.aceitar(d.id)))}>{L.t("pc.negocioPag.aceitar")}</Botao></div>
      </div>
    ) : (
      <div className="flex flex-col gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <div className="sm:w-64"><Botao onClick={() => setConfirmar("aceitar")}>{ad ? L.t("pc.negocioPag.aceitarAdenda.acao") : L.t("pc.negocioPag.aceitarProposta")}</Botao></div>
        <button type="button" onClick={() => responder("escolher")} className="min-h-11 text-[15px] font-medium text-slate-600 underline-offset-4 hover:underline sm:mr-auto">{L.t("pc.negocioPag.pedirOuRecusar")}</button>
      </div>
    )
  ) : P.estado === "auto" ? (
    confirmar === "auto" ? null : (
      <div className="flex flex-col gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <div className="sm:w-72"><Botao disabled={!receber || (receber === "obs" && !obs.trim())} onClick={() => { setConfirmar("auto"); topo(); }}><span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4" aria-hidden="true" />{L.t("pc.negocioPag.auto.assinar")}</span></Botao></div>
        {!receber && <p className="text-center text-sm text-slate-500 sm:mr-auto sm:text-left">{L.t("pc.negocioPag.auto.digaPrimeiro")}</p>}
      </div>
    )
  ) : P.estado === "assinar" ? (
    confirmar === "assinar" || pedirContrato ? null : (
      <div className="flex flex-col gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <div className="sm:w-64"><Botao onClick={() => { setConfirmar("assinar"); topo(); }}><span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4" aria-hidden="true" />{ad ? L.t("pc.negocioPag.assinar.adenda") : L.t("pc.negocioPag.assinar.contratoTitulo")}</span></Botao></div>
        <button type="button" onClick={() => { setPedirContrato(true); topo(); }} className="min-h-11 text-[15px] font-medium text-slate-600 underline-offset-4 hover:underline sm:mr-auto">{ad ? L.t("pc.negocioPag.assinar.pedirAdenda") : L.t("pc.negocioPag.assinar.pedirContrato")}</button>
      </div>
    )
  ) : null;

  return (
    <NaFrente>
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-100 text-slate-900 animate-in fade-in-0 duration-200" role="dialog" aria-modal="true" aria-label={L.t("pc.negocioPag.portalAria", { nome: d.nome })} ref={raiz}>
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
        <p className="text-sm font-semibold tracking-[0.18em] text-slate-900">{nomeEmpresa().toUpperCase()}</p>
        <div className="flex items-center gap-1">
          {outrosPedidos && !doc && (
            <button type="button" onClick={outrosPedidos} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[15px] font-medium text-slate-700 hover:bg-slate-200">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />{L.t("pc.negocioPag.meusPedidos")}
            </button>
          )}
          <button type="button" onClick={doc ? () => setDoc(null) : fechar} aria-label={doc ? L.t("pc.negocioPag.voltarPortal") : L.t("pc.negocioPag.fechar")} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-slate-200"><X className="h-5 w-5" /></button>
        </div>
      </div>
      {/* 23/10: "Ver como o cliente": a equipa só vê; responder (aceitar, assinar, pagar, escrever) é só do cliente */}
      {previa && (
        <div className="mx-auto w-full max-w-3xl px-4 pt-4">
          <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-[15px] text-amber-950">
            <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span><strong>Pré-visualização, só de leitura.</strong> É o que o cliente vê no portal. Aceitar, assinar, pagar e escrever são só do cliente, na conta dele.</span>
          </p>
          {bloqueou && <p role="alert" className="mt-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-[15px] text-red-900">Nada foi gravado: na pré-visualização não se responde em nome do cliente.</p>}
        </div>
      )}
      {real?.aviso && (
        <div className="mx-auto w-full max-w-3xl px-4 pt-4">
          <p role="status" className="rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-[15px] text-amber-950">{real.aviso}</p>
        </div>
      )}
      {doc ? (
        <div className="px-3 py-6 sm:py-10 animate-in fade-in-0 slide-in-from-right-3 duration-200">{corpoDoc(doc)}</div>
      ) : (
        <div className={cn("mx-auto w-full max-w-3xl space-y-5 px-4 pt-6", barra ? "pb-44" : "pb-10")}>
          <header>
            <h1 className="text-2xl font-semibold">{L.t("pc.negocioPag.ola", { nome })}</h1>
            <p className="text-[15px] text-slate-600">{d.servico} · {d.f.morada || d.local}</p>
          </header>

          {/* o percurso: onde está e o que vem a seguir */}
          <ol className="grid grid-cols-5 gap-1.5" aria-label={L.t("pc.negocioPag.percurso")}>
            {(ad ? CHAVES_PASSOS_ADENDA : CHAVES_PASSOS).map((chave, i) => {
              const t = L.t(chave);
              const feito = i < P.i || (P.estado === "relatorio" && i === 4);
              const aqui = i === P.i && !feito;
              return (
                <li key={chave} aria-current={aqui ? "step" : undefined}>
                  <span className={cn("block h-1.5 rounded-full transition-colors duration-500", feito ? "bg-slate-900" : aqui ? "bg-[#5a36bf]" : "bg-slate-300")} aria-hidden="true" />
                  <span className={cn("mt-1.5 flex items-center gap-1 text-xs sm:text-sm", aqui ? "font-semibold text-slate-900" : feito ? "text-slate-700" : "text-slate-500")}>
                    {feito && <Check className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden="true" />}
                    <span className="sm:hidden" aria-hidden="true">{L.t((ad ? CHAVES_CURTO_ADENDA : CHAVES_CURTO)[i])}</span><span className="sr-only sm:not-sr-only">{t}</span>
                    {feito && <span className="sr-only"> {L.t("pc.negocioPag.feito")}</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          {agora && <section aria-label={L.t("pc.negocioPag.agora")} className="rounded-2xl bg-white p-5 shadow-sm animate-in fade-in-0 slide-in-from-bottom-1 duration-300">{agora}</section>}

          {/* 12/11: a obra a andar (o progresso e as datas) e tudo o que aconteceu, do mais recente para o mais antigo (ObraNoPortal.tsx) */}
          {/* com o contrato assinado, sempre (também com uma adenda por responder e com o auto por assinar); depois, o relatório conta tudo */}
          {obraVisivel && p && <ProgressoObraPortal d={d} />}
          {obraVisivel && <HistoricoObraPortal d={d} />}
          {/* o plano da obra (depois de assinar; 21/10: também com a 1.ª parcela de uma adenda por pagar) */}
          {naObra && fasesObra.length > 0 && p && (
            <section aria-label={L.t("pc.negocioPag.obra.planoAria")} className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight">{L.t("pc.negocioPag.obra.plano")}</h2>
              {/* 21/10: em cada trabalho, as fotografias e as notas dos técnicos (12/11: o progresso e os avisos passaram para cima) */}
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
                        <p className="text-[15px] font-semibold">{CHAVE_FASE_CURTA[f] ? L.t(CHAVE_FASE_CURTA[f]) : FASES_OBRA[f - 1].curto}</p>
                        <p className="text-sm tabular-nums text-slate-500">{rotuloDiaEm(p, i0, L.idioma)}{i1 > i0 ? ` ${L.t("pc.negocioPag.obra.ate")} ${rotuloDiaEm(p, i1, L.idioma)}` : ""}</p>
                        {estado === "agora" && <p className="text-sm font-medium text-[#5a36bf]">{L.t("pc.negocioPag.obra.aDecorrer")}</p>}
                        {estado === "feita" && <p className="text-sm font-medium text-emerald-700">{L.t("pc.negocioPag.obra.feita")}</p>}
                        {p.estado === "em curso" || p.estado === "concluída"
                          ? <TrabalhosDaFase p={p} ts={ts} />
                          : <p className="text-sm text-slate-600">{[...new Set(ts.map((t) => t.nome))].join(" · ")}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {d.obra.ec && <MateriaisPortal d={d} L={L} />}
            </section>
          )}
          {/* 21/10: a conversa com a equipa da obra (o gestor responde na página da obra) */}
          {real ? (
            <section aria-label={L.t("pc.negocioPag.conversa.aria")} className="space-y-2">
              {real.conversa}
              {RESPONSAVEL_OBRA.tel && <p className="px-1 text-sm text-slate-500">{L.t("pc.negocioPag.conversa.ligar", { nome: RESPONSAVEL_OBRA.n, tel: RESPONSAVEL_OBRA.tel })}</p>}
            </section>
          ) : (naObra || !!ad || P.estado === "auto") && (
            <section aria-labelledby="conversa-portal-t" className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 id="conversa-portal-t" className="text-lg font-semibold tracking-tight">{L.t("pc.negocioPag.conversa.aria")}</h2>
              <p className="mb-3 text-sm text-slate-500">{L.t("pc.negocioPag.conversa.texto")}</p>
              <Conversa msgs={d.obra.chat ?? []} eu="cliente" enviar={(t) => run(() => A.mensagemObra(d.id, "cliente", t))} vazio={L.t("pc.negocioPag.conversa.vazio")}
                rapidas={[L.t("pc.negocioPag.conversa.rapida1"), L.t("pc.negocioPag.conversa.rapida2"), L.t("pc.negocioPag.conversa.rapida3")]} />
            </section>
          )}

          {outros.length > 0 && (
            <section aria-label={L.t("pc.negocioPag.outros.aria")} className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">{L.t("pc.negocioPag.outros.titulo")}</h2>
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
          {P.estado === "rever" && (noTemplate && !ad
            ? <CartaoDocumento tipo="proposta" abrir={real!.abrirProposta} L={L} />
            : <div className="-mx-4 sm:mx-0" aria-label={ad ? L.t("pc.negocioPag.doc.propostaAdenda") : L.t("pc.negocioPag.doc.proposta")} role="region"><PropostaDoc S={S} d={d} a={ad ?? undefined} /></div>)}
          {P.estado === "assinar" && (noTemplate && !ad
            ? (real!.abrirContrato ? <CartaoDocumento tipo="contrato" abrir={real!.abrirContrato} L={L} /> : null)
            : <div className="-mx-4 sm:mx-0" aria-label={ad ? L.t("pc.negocioPag.doc.adenda") : L.t("pc.negocioPag.doc.contrato")} role="region"><ContratoDoc S={S} d={d} a={ad ?? undefined} /></div>)}
          {P.estado === "auto" && <div className="-mx-4 sm:mx-0" aria-label={L.t("pc.negocioPag.doc.auto")} role="region"><AutoRececaoDoc d={d} /></div>}
          {P.estado === "relatorio" && <RelatorioObra S={S} d={d} docs={docs.filter(([k, t, ok]) => t && ok && k !== "relatorio").map(([k, t]) => [k, t])} abrirDoc={abrirDocumento} />}
          {(P.estado === "preparar" || P.estado === "pedido" || (P.estado === "sem" && !!ad)) && (
            verProposta && !(noTemplate && !ad)
              ? <div className="-mx-4 sm:mx-0" aria-label={ad ? L.t("pc.negocioPag.doc.propostaAdenda") : L.t("pc.negocioPag.doc.proposta")} role="region"><PropostaDoc S={S} d={d} a={ad ?? undefined} /></div>
              : <Botao ghost onClick={noTemplate && !ad ? real!.abrirProposta : () => setVerProposta(true)}>{P.estado === "preparar" ? L.t("pc.negocioPag.doc.verAceite") : L.t("pc.negocioPag.doc.verAtual")}</Botao>
          )}
          {P.estado === "sem" && !ad && <p className="rounded-2xl bg-white p-4 text-[15px] shadow-sm">{o?.versoes?.length ? L.t("pc.negocioPag.doc.semVersao", { v: versaoAtual(o) }) : L.t("pc.negocioPag.doc.semProposta")} {L.t("pc.negocioPag.doc.avisamos")}</p>}

          {/* os documentos */}
          {P.estado !== "relatorio" && docs.some(([, t, ok]) => t && ok) && (
            <section aria-label={L.t("pc.negocioPag.doc.lista")} className="rounded-2xl bg-white p-2 shadow-sm">
              <h2 className="px-2 pt-2 text-base font-semibold">{L.t("pc.negocioPag.doc.lista")}</h2>
              <ul>
                {docs.filter(([, t, ok]) => t && ok).map(([k, t]) => (
                  <li key={k}>
                    <button type="button" onClick={() => abrirDocumento(k)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-[15px] hover:bg-slate-50">
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
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3 backdrop-blur" role="region" aria-label={L.t("pc.negocioPag.proximoPasso")}>
          <div className="mx-auto w-full max-w-3xl">{barra}</div>
        </div>
      )}
    </div>
    </NaFrente>
  );
}

/** 2/11, portal real: a fatura e o valor (sem dados bancários de exemplo) e o aviso de que pagou (portal_neg_responder). */
/** 19/11 (Rúben): no portal real, cada fatura com a escolha da forma de pagar e os dados dela (a referência Multibanco: entidade, referência e
 *  montante), como no protótipo. A escolha fica neste browser e vai com o aviso «Já paguei» ao Financeiro. */
function PagarReal({ numero, real, montante, vence, refMb, titular, verFatura, L }: { numero: string; real: PortalReal; montante: string; vence: string; refMb: string; titular: string; verFatura: () => void; L: PortalTraducao }) {
  const chave = `olyvia-portal-metodo:${numero}`;
  const [metodo, setMetodo] = useState(() => { try { return localStorage.getItem(chave) ?? ""; } catch { return ""; } });
  const [erro, setErro] = useState<string | null>(null);
  const avisado = real.avisados.includes(numero);
  // 19/11 (auditoria): a forma guardada que a empresa já não recebe (ex.: a referência Multibanco, sem prestador) volta à transferência,
  // como no ecrã (PagarFatura): o aviso ao Financeiro leva a forma que o cliente viu
  const formas = metodosDe(useDadosPagamento()), usado = formas.includes(metodoDe(metodo)) ? metodoDe(metodo) : "Transferência";
  const escolher = (m: string) => { setMetodo(m); try { localStorage.setItem(chave, m); } catch { /* sem armazenamento: só nesta visita */ } };
  const avisar = (ref: string, m: string) => { setErro(null); real.avisarPagamento(numero, ref.trim(), m).catch((e: Error) => setErro(e.message)); };
  if (avisado) return (
    <div className="space-y-3">
      <p><span className="block text-xs uppercase tracking-[0.12em] text-slate-500">{L.t("pc.negocioPag.pagar.aPagar")}</span><span className="text-2xl font-semibold tabular-nums">{montante} €</span></p>
      <p role="status" className="flex items-center gap-2 text-[15px] text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" />{L.t("pc.negocioPag.pagar.recebemosAviso")}</p>
    </div>
  );
  return (
    <div className="space-y-3">
      <PagarFatura L={L} numero={numero} montante={montante} vence={vence} refMb={refMb} alvo={{ metodo }} titular={titular} verFatura={verFatura}
        escolher={escolher} pago={(r) => avisar(r, usado)} autorizar={(i, t) => avisar(`Débito direto autorizado na conta ${i} (${t})`, "Débito direto")} />
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
    </div>
  );
}

/** 16/10: o que o cliente vê dos materiais, lido da encomenda no Inventário novo. */
function MateriaisPortal({ d, L }: { d: Negocio; L: PortalTraducao }) {
  const inv = resumoEcNegocio(useInventario(), d.obra.ec?.ref);
  const texto = L.t(!d.obra.ec?.ref ? "pc.negocioPag.obra.materiaisProntos" : !inv ? "pc.negocioPag.obra.materiaisEncomendados" : inv.pronta ? "pc.negocioPag.obra.materiaisProntos" : inv.tot.aFornecedor ? (inv.pos.every((x) => x.fase === "por aprovar") ? "pc.negocioPag.obra.materiaisReservado" : "pc.negocioPag.obra.materiaisFornecedor") : "pc.negocioPag.obra.materiaisPreparar");
  return <p className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600">{L.t("pc.negocioPag.obra.materiais", { texto })}</p>;
}
