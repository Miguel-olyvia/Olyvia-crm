// Os templates nos passos Orçamento, Proposta e Contrato do Negócio da Emylia (ficha do Pipeline). Não se mexe na Emylia (src/emylia): os passos que ela monta
// (passosDaFase) são embrulhados aqui, passo a passo, por `comTemplatesNosPassos` (a prop `ajustarPassos` da FaseDaEmylia).
//  · Orçamento: seletor do template do tipo orçamento (proposal_templates, template_type='quote') e o seu aspeto.
//  · Proposta:  seletor do template do tipo proposta (template_type='proposal'); a pré-visualização da proposta passa a ter as cores, as fontes, o logo
//    e os textos do template, com o nome e o logo REAIS da organização; botão «Enviar para o portal do cliente».
//  · Contrato:  seletor da minuta (client_contract_templates), as perguntas {{chave}} da minuta e o corpo preenchido; botão de envio ao portal.
// A escolha guarda-se SÓ pelas RPCs neg_definir_templates_negocio / neg_ler_templates_negocio (useTemplatesDoNegocio).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./propostaComTemplate.css";
import { totaisIva } from "@/emylia/motor";
import { definirModoReal, nifEmpresa, nomeEmpresa, nomeFiscalEmpresa, orgDoModoReal } from "@/emylia/acessosPortal";
import type { Passo } from "@/emylia/CamposFase";
import type { Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { PROPOSTA, efetivo, emFalta } from "@/emylia/campos";
import { useCompany } from "@/contexts/CompanyContext";
import { useDadosDaProposta, useMinutasDeContrato, useNomeDoSignatario, usePerguntasDeContrato, useTemplatesDeAspeto, type MinutaDeContrato, type TemplateDeAspeto } from "@/hooks/pessoas/useTemplatesDeDocumento";
import { useTemplatesDoNegocio, type UseTemplatesDoNegocio } from "@/hooks/pessoas/useTemplatesDoNegocio";
import { extractPromptTokens, substituteVariables, type ContractVariableData } from "@/utils/contractVariables";
import { sanitizeRichHtml } from "@/utils/sanitize";
import { FOCO } from "@/components/negocio-metas/estilos";
import { cn } from "@/lib/utils";
import { planoAprovadoDe, retificacaoAceite } from "@/emylia/preparacaoObra";
import { ContratoNoPasso } from "./ContratoNoPasso";
import { EnviarParaPortal } from "./EnviarParaPortal";
import { SeletorDeTemplate } from "./SeletorDeTemplate";
import { OrcamentoPdf } from "./OrcamentoPdf";

export interface ContextoDosTemplates { negocioId: string | null; ctx: Ctx; d: Negocio; podeEditar: boolean }

const COR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i;
const FONTE = /^[\w\s,'"-]{1,120}$/;
const cor = (v: string | null | undefined): string | undefined => (v && COR.test(v.trim()) ? v.trim() : undefined);
const fonte = (v: string | null | undefined): string | undefined => (v && FONTE.test(v.trim()) ? v.trim() : undefined);
const linkSeguro = (v: string | null | undefined): string | null => (v && /^https:\/\//i.test(v.trim()) ? v.trim() : null);

const AVISO_SEM_BASE = "Guardar o template precisa de uma atualização da base de dados que ainda não foi aplicada: por agora a escolha não fica guardada.";

/** Põe o nome real da organização nos documentos da Emylia (em vez do «Mudelar» por omissão), sem ligar o modo real do portal. */
function useNomeRealDaOrganizacao(): { nome: string; logo: string | null; chave: string } {
  const { activeCompany } = useCompany();
  const nome = activeCompany?.name?.trim() ?? "";
  const [aplicado, setAplicado] = useState("");
  // O estado global da Emylia só se mexe num efeito, com cleanup que o repõe tal como estava (organização do modo real e dados fiscais
  // ficam como estavam: só o nome muda). `aplicado` serve de key aos documentos, para voltarem a ler nomeEmpresa() já com o nome real.
  useLayoutEffect(() => {
    if (!nome) { setAplicado(""); return; }
    const antes = { org: orgDoModoReal(), nome: nomeEmpresa(), fiscal: { nome: nomeFiscalEmpresa(), nif: nifEmpresa() } };
    definirModoReal(antes.org, nome, antes.fiscal);
    setAplicado(nome);
    return () => { definirModoReal(antes.org, antes.nome, antes.fiscal); };
  }, [nome]);
  return { nome: nome || nomeEmpresa(), logo: linkSeguro(activeCompany?.logo_url), chave: aplicado };
}

const opcoesDe = (l: readonly { id: string; name: string; is_default: boolean }[] | undefined) =>
  (l ?? []).map((t) => ({ id: t.id, nome: t.name, porOmissao: t.is_default }));

function AvisosDaGravacao({ t }: { t: UseTemplatesDoNegocio }) {
  return (
    <div className="space-y-2 empty:hidden">
      {t.estado === "a-ler" && <p role="status" className="text-sm text-muted-foreground">A ler o que ficou escolhido neste negócio…</p>}
      {t.estado === "sem-base" && <p role="status" className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-[15px] text-muted-foreground">{AVISO_SEM_BASE}</p>}
      {t.estado === "erro" && (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-[15px]">
          <p className="text-destructive">Não foi possível ler a escolha guardada: {t.erro}</p>
          <button type="button" onClick={t.reler} className={cn("min-h-11 rounded-lg border border-input px-4 font-medium", FOCO)}>Tentar outra vez</button>
        </div>
      )}
      {t.aGuardar && <p role="status" className="text-sm text-muted-foreground">A guardar a escolha…</p>}
      {t.erroAoGuardar && <p role="alert" className="text-[15px] text-destructive">Não foi possível guardar a escolha: {t.erroAoGuardar}</p>}
    </div>
  );
}

const podeEscolher = (t: UseTemplatesDoNegocio, c: ContextoDosTemplates): boolean => c.podeEditar && t.estado === "pronto" && !t.aGuardar && c.negocioId !== null;

/* ------------------------------------------------------------------------------------------------ passo Orçamento */
/** O documento do orçamento (PDF), logo por baixo do seletor do template: aberto por omissão; o PDF só se gera enquanto está aberto.
 *  9/11 (Rúben, telemóvel): num ecrã estreito começa fechado (o leitor de PDF ocupava o ecrã todo e no telemóvel nem sempre mostra o PDF). */
const ecraLargo = () => typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 640px)").matches;
function DocumentoPdfRecolhido(props: Parameters<typeof OrcamentoPdf>[0]) {
  const [aberto, setAberto] = useState(ecraLargo);
  return (
    <details className="rounded-2xl border border-border bg-card p-4 text-[15px]" open={aberto} onToggle={(e) => setAberto((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className={cn("min-h-11 cursor-pointer py-2 font-medium", FOCO)}>Ver o documento do orçamento (PDF)</summary>
      {aberto && <div className="mt-2"><OrcamentoPdf {...props} /></div>}
    </details>
  );
}

function TemplateDoOrcamento({ c, children }: { c: ContextoDosTemplates; children: ReactNode }) {
  const org = useNomeRealDaOrganizacao();
  const { activeCompany } = useCompany();
  const lista = useTemplatesDeAspeto("quote");
  const neg = useTemplatesDoNegocio(c.negocioId);
  const escolhido = lista.data?.find((x) => x.id === neg.dados.template_orcamento_id) ?? null;
  const omissao = lista.data?.find((x) => x.is_default) ?? null;
  return (
    <div className="space-y-6">
      <section aria-label="Template do orçamento" className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <SeletorDeTemplate
          rotulo="Template do orçamento" valor={neg.dados.template_orcamento_id} opcoes={opcoesDe(lista.data)}
          ajuda={omissao && !neg.dados.template_orcamento_id ? `O da organização por omissão é «${omissao.name}».` : "Define o aspeto do documento do orçamento (cores, logótipo, textos)."}
          aLer={lista.isLoading} erro={lista.error instanceof Error ? lista.error.message : null} aoTentar={() => { void lista.refetch(); }}
          aoEscolher={(id) => { void neg.guardar({ template_orcamento_id: id }); }} desativado={!podeEscolher(neg, c)}
          paginaDeCriacao={{ para: "/quote-templates", texto: "Criar templates de orçamento" }} vazio="Ainda não há templates do tipo orçamento nesta organização."
        />
        <AvisosDaGravacao t={neg} />
      </section>
      {/* o orçamento em PDF, logo por baixo da escolha do template (fora do cartão do seletor, que só tem o seletor, como na Proposta) */}
      <DocumentoPdfRecolhido d={c.d} S={c.ctx.S} tpl={escolhido} orgId={activeCompany?.id ?? null} nome={org.nome} logoOrg={org.logo} />
      <div key={org.chave}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ passo Proposta */
function TextosDoTemplate({ tpl }: { tpl: TemplateDeAspeto }) {
  const itens: [string, string | null][] = [
    ["Cabeçalho", tpl.header_text], ["Termos e condições", tpl.show_terms === false ? null : tpl.terms_conditions],
    ["Agradecimento", tpl.thank_you_message], ["Rodapé", tpl.footer_text],
  ];
  const com = itens.filter((x): x is [string, string] => !!x[1]);
  if (com.length === 0) return null;
  return (
    <section aria-label="Textos do template" className="space-y-2 rounded-2xl border border-border bg-card p-4 text-[15px]">
      <p className="font-semibold">Textos do template «{tpl.name}»</p>
      <dl className="space-y-2">{com.map(([t, v]) => <div key={t}><dt className="text-sm text-muted-foreground">{t}</dt><dd className="whitespace-pre-line">{v}</dd></div>)}</dl>
    </section>
  );
}

function TemplateDaProposta({ c, children }: { c: ContextoDosTemplates; children: ReactNode }) {
  const org = useNomeRealDaOrganizacao();
  const lista = useTemplatesDeAspeto("proposal");
  const neg = useTemplatesDoNegocio(c.negocioId);
  const escolhido = lista.data?.find((x) => x.id === neg.dados.template_proposta_id) ?? null;
  // o que está congelado no negócio manda; senão o template vivo
  const tpl = (neg.dados.template_proposta_snapshot && escolhido ? ({ ...escolhido, ...(neg.dados.template_proposta_snapshot as Partial<TemplateDeAspeto>) }) : escolhido);
  const omissao = lista.data?.find((x) => x.is_default) ?? null;
  const logo = tpl ? linkSeguro(tpl.logo_url) ?? org.logo : org.logo;
  const estilo = useMemo((): CSSProperties => (tpl ? ({
    "--tpl-primaria": cor(tpl.primary_color), "--tpl-secundaria": cor(tpl.secondary_color), "--tpl-destaque": cor(tpl.accent_color),
    "--tpl-texto": cor(tpl.text_color), "--tpl-fonte": fonte(tpl.font_family), "--tpl-fonte-titulos": fonte(tpl.heading_font_family),
  } as CSSProperties) : {}), [tpl]);
  return (
    <div className="space-y-6">
      <section aria-label="Template da proposta" className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <SeletorDeTemplate
          rotulo="Template da proposta" valor={neg.dados.template_proposta_id} opcoes={opcoesDe(lista.data)}
          ajuda={omissao && !neg.dados.template_proposta_id ?`O da organização por omissão é «${omissao.name}».` : "A pré-visualização da proposta usa as cores, o logótipo e os textos do template escolhido."}
          aLer={lista.isLoading} erro={lista.error instanceof Error ? lista.error.message : null} aoTentar={() => { void lista.refetch(); }}
          aoEscolher={(id) => { void neg.guardar({ template_proposta_id: id }); }}
          desativado={!podeEscolher(neg, c)}
          paginaDeCriacao={{ para: "/proposal-templates", texto: "Criar templates de proposta" }} vazio="Ainda não há templates do tipo proposta nesta organização."
        />
        <AvisosDaGravacao t={neg} />
      </section>
      {tpl && tpl.show_company_info !== false && logo && (
        <div className="flex items-center gap-3"><img src={logo} alt={`Logótipo de ${org.nome}`} width={120} height={40} className="h-10 w-auto max-w-[10rem] object-contain" /><span className="text-sm text-muted-foreground">{org.nome}</span></div>
      )}
      <div key={org.chave} className={tpl ? "tpl-proposta" : undefined} style={estilo}>{children}</div>
      {tpl && <TextosDoTemplate tpl={tpl} />}
      <EnviarParaPortal negocioId={c.negocioId} tipo="proposal" podeEditar={c.podeEditar} />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ passo Contrato */
/** «2026-10-30» passa a «30/10/2026»; qualquer outro texto fica como está. */
const dataDmy = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso);

type DadosDaProposta = { numero: string; data: string } | null | undefined;

function dadosDaMinuta(d: Negocio, c: ContextoDosTemplates, nome: string, valores: Record<string, string>, proposta?: DadosDaProposta): ContractVariableData {
  const T = d.orc ? totaisIva(d, c.ctx.S) : null;
  // O início da obra é a data do contrato; o número e a data da proposta são os da base (os que o cliente vê no portal), não os do desenho da Emylia.
  const inicio = d.f.inicio_prev || d.orc?.inicioObra || "";
  const base: ContractVariableData = {
    empresa_nome: nome, cliente_nome: d.f.nome_fiscal || d.nome, cliente_nif: d.f.nif_fat || d.f.nif || "", cliente_morada: d.f.morada || d.local || "",
    cliente_email: d.f.email || "", cliente_telefone: d.tel.includes("@") ? "" : d.tel, ...(T ? { contrato_valor: T.total, proposta_valor: T.total } : {}),
    ...(proposta ? { proposta_numero: proposta.numero, ...(proposta.data ? { proposta_data: proposta.data } : {}) } : {}),
    ...(inicio ? { contrato_data_inicio: dataDmy(inicio) } : {}),
  };
  return { ...base, ...valores } as ContractVariableData;
}

/** As perguntas {{chave}} da minuta. 12/11: o corpo preenchido já não se mostra aqui: vê-se no contrato montado (ContratoNoPasso), mais abaixo. */
function MinutaDoContrato({ minuta, valores, aoEscrever, aoGuardar, desativado }: {
  minuta: MinutaDeContrato; valores: Record<string, string>; aoEscrever: (k: string, v: string) => void; aoGuardar: () => void; desativado: boolean;
}) {
  const perguntas = usePerguntasDeContrato();
  const chaves = useMemo(() => extractPromptTokens(minuta.body_html), [minuta.body_html]);
  const rotulo = new Map((perguntas.data ?? []).map((p) => [p.key, p]));
  if (chaves.length === 0 && !(perguntas.error instanceof Error)) return null;
  return (
    <div className="space-y-4">
      {perguntas.error instanceof Error && <p role="alert" className="text-[15px] text-destructive">Não foi possível ler as perguntas da minuta: {perguntas.error.message}</p>}
      {chaves.length > 0 && (
        <fieldset disabled={desativado} className="space-y-3 rounded-xl border border-border p-3">
          <legend className="px-1 text-[15px] font-semibold">Perguntas da minuta</legend>
          {chaves.map((k) => {
            const p = rotulo.get(k);
            const id = `minuta-${k}`;
            const comum = { id, value: valores[k] ?? "", onBlur: aoGuardar, className: cn("w-full rounded-lg border border-input bg-background px-3 py-2 text-[15px]", FOCO) };
            return (
              <div key={k} className="space-y-1">
                <label htmlFor={id} className="block text-[15px] font-medium">{p?.label ?? k}</label>
                {p?.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                {p?.promptType === "textarea"
                  ? <textarea rows={3} {...comum} onChange={(ev) => aoEscrever(k, ev.target.value)} />
                  : <input type={p?.promptType === "number" ? "number" : p?.promptType === "date" ? "date" : "text"} {...comum} onChange={(ev) => aoEscrever(k, ev.target.value)} className={cn(comum.className, "min-h-11")} />}
              </div>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}

/** Quem assina pela empresa o contrato desta minuta: o contrato nasce já assinado por essa pessoa (a assinatura é posta pela base ao nascer o contrato). */
function AssinaturaDaMinuta({ minuta }: { minuta: MinutaDeContrato }) {
  const id = minuta.signatory_user_id?.trim() || null;
  const nome = useNomeDoSignatario(id);
  if (!id) {
    return (
      <p role="status" className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[15px]">
        Esta minuta não tem signatário: o contrato nasce sem a assinatura da empresa. Escolha-o em <a className={cn("font-medium underline underline-offset-4", FOCO)} href="/contract-templates">Minutas de contrato</a>.
      </p>
    );
  }
  if (nome.isLoading) return <p role="status" className="text-sm text-muted-foreground">A ver quem assina pela empresa…</p>;
  if (nome.isError) return <p role="alert" className="text-[15px] text-destructive">Não foi possível ler o signatário da minuta: {nome.error instanceof Error ? nome.error.message : "erro desconhecido"}.</p>;
  return (
    <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[15px]">
      O contrato nasce assinado pela empresa por <strong>{nome.data ?? "o signatário da minuta"}</strong>, o signatário desta minuta.
    </p>
  );
}

function MinutaDoNegocio({ c, children, bloqueado, soEscolher = false }: { c: ContextoDosTemplates; children: ReactNode; bloqueado: boolean; soEscolher?: boolean }) {
  const org = useNomeRealDaOrganizacao();
  const lista = useMinutasDeContrato();
  const neg = useTemplatesDoNegocio(c.negocioId);
  const minuta = lista.data?.find((m) => m.id === neg.dados.minuta_id) ?? null;
  // As respostas repõem-se do guardado só quando muda o negócio, o estado da leitura ou a minuta escolhida (e não a cada gravação).
  const [valores, setValores] = useState<Record<string, string>>({});
  const [chaveVista, setChaveVista] = useState("");
  const chave = `${c.negocioId ?? ""}|${neg.estado}|${neg.dados.minuta_id ?? ""}`;
  if (chave !== chaveVista) { setChaveVista(chave); setValores(neg.dados.minuta_respostas); }
  // a minuta por omissão: a marcada como tal ou, havendo uma só minuta ativa, essa
  const omissao = lista.data?.find((m) => m.is_default) ?? (lista.data?.length === 1 ? lista.data[0] : null);
  const proposta = useDadosDaProposta(c.negocioId).data;
  const corpoPreenchido = (m: MinutaDeContrato, v: Record<string, string>): string =>
    sanitizeRichHtml(substituteVariables(m.body_html, dadosDaMinuta(c.d, c, org.nome, v, proposta)));
  const guardarRespostas = async (): Promise<void> => {
    if (!minuta) return;
    const guardado = neg.dados.minuta_respostas;
    const iguais = Object.keys({ ...guardado, ...valores }).every((k) => (guardado[k] ?? "") === (valores[k] ?? ""));
    if (iguais) return;
    // respostas e texto preenchido vão juntos: o contrato que segue é o que se viu. Se a base não aceitar, o ecrã volta ao guardado (o aviso diz porquê).
    const ok = await neg.guardar({ minuta_respostas: valores, contrato_corpo_html: corpoPreenchido(minuta, valores) });
    if (!ok) setValores(guardado);
  };
  const escolherMinuta = (id: string | null): void => {
    const m = id ? lista.data?.find((x) => x.id === id) ?? null : null;
    void neg.guardar({ minuta_id: id, minuta_respostas: {}, contrato_corpo_html: m ? corpoPreenchido(m, {}) : null });
  };
  // 12/11 (Rúben: a minuta estava em «Nenhum» e o contrato não se via): sem minuta escolhida, a por omissão escolhe-se sozinha, uma vez por
  // negócio (quem a tirar de propósito fica com «Nenhum» até sair do passo)
  const pode = !bloqueado && podeEscolher(neg, c);
  const jaEscolhida = useRef<string | null>(null);
  useEffect(() => {
    if (soEscolher || !pode || neg.dados.minuta_id || !omissao || jaEscolhida.current === c.negocioId) return;
    jaEscolhida.current = c.negocioId;
    escolherMinuta(omissao.id);
  }, [soEscolher, pode, neg.dados.minuta_id, omissao?.id, c.negocioId]); // eslint-disable-line react-hooks/exhaustive-deps
  // o corpo da minuta preenchido, com o que falta a amarelo (o que se grava vai sem o amarelo: corpoPreenchido)
  const minutaHtml = useMemo(
    () => (minuta ? sanitizeRichHtml(substituteVariables(minuta.body_html, dadosDaMinuta(c.d, c, org.nome, valores, proposta), true)) : null),
    [minuta, c, org.nome, valores, proposta],
  );
  const falta = oQueFaltaNoContrato({ c, minuta, valores, nMinutas: lista.data?.length ?? 0, aLer: lista.isLoading });
  return (
    <div className="space-y-6">
      <section aria-label="Minuta do contrato" className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <SeletorDeTemplate
          rotulo="Minuta do contrato" valor={neg.dados.minuta_id} opcoes={opcoesDe(lista.data)}
          ajuda={omissao && !neg.dados.minuta_id ?`A minuta por omissão é «${omissao.name}».` : "O corpo do contrato; as cláusulas do negócio (prestações, adendas) seguem no fim."}
          aLer={lista.isLoading} erro={lista.error instanceof Error ? lista.error.message : null} aoTentar={() => { void lista.refetch(); }}
          aoEscolher={escolherMinuta}
          desativado={!pode}
          paginaDeCriacao={{ para: "/contract-templates", texto: "Criar minutas de contrato" }} vazio="Ainda não há minutas de contrato ativas nesta organização."
        />
        <AvisosDaGravacao t={neg} />
        {minuta && <AssinaturaDaMinuta minuta={minuta} />}
        {minuta && !soEscolher && (
          <MinutaDoContrato
            minuta={minuta} valores={valores} desativado={!pode}
            aoEscrever={(k, v) => setValores((x) => ({ ...x, [k]: v }))}
            aoGuardar={() => { void guardarRespostas(); }}
          />
        )}
      </section>
      {/* O contrato é o da minuta escolhida (preenchida acima): o corpo que a Emylia desenha por baixo (Modelo, Assinatura, «Assina pela empresa»,
          Penalização, Partilhar e o contrato com as cláusulas dela) só se vê enquanto o contrato está bloqueado, que é o aviso de que ainda não abre. */}
      {soEscolher && <div key={org.chave}>{children}</div>}
      {/* 9/11 (Rúben: «falta o campo penalização, por isso não consigo gerar»): as condições do contrato da Emylia (penalização por atraso,
          modelo, assinatura, quem assina) continuam obrigatórias, mas o corpo dela não se vê aqui; respondem-se neste bloco */}
      {!soEscolher && <CondicoesDoContrato c={c} nomeMinuta={minuta?.name ?? ""} />}
      {/* 12/11 (Rúben: «falta ver aqui o contrato»): o contrato montado, antes do envio ao portal */}
      {!soEscolher && <div key={org.chave}><ContratoNoPasso S={c.ctx.S} d={c.d} minutaHtml={minutaHtml} nomeMinuta={minuta?.name ?? null} falta={falta} /></div>}
      {!soEscolher && <EnviarParaPortal negocioId={c.negocioId} tipo="contract" podeEditar={c.podeEditar} />}
    </div>
  );
}

/** O tipo de contrato que a minuta escolhida diz (o nome): «… Prestação de Serviços» é prestação de serviços; o resto, empreitada. */
const modeloDaMinuta = (nome: string) => (/presta[cç][aã]o de servi/i.test(nome) ? "Prestação de serviços" : "Empreitada de remodelação");

/** As perguntas do grupo «Contrato» da Emylia (como a empresa as ajustou), em botões: o que falta fica marcado.
 *  10/11 (Rúben: «informação limpa»): com uma minuta escolhida, o «Modelo» sai (é o da minuta); o que já está respondido fica numa linha,
 *  com «Mudar»; só se pergunta o que falta. */
function grupoDasCondicoes(c: ContextoDosTemplates, nomeMinuta: string) {
  // o modelo segue a minuta (a base pede-o para gerar o contrato): preenche-se sozinho e não se pergunta
  const modeloAuto = nomeMinuta ? modeloDaMinuta(nomeMinuta) : null;
  const g0 = efetivo(c.ctx.S.campos, PROPOSTA[1]);
  const opModelo = g0.campos.find((x) => x.k === "modelo_contrato")?.op ?? [];
  const usarAuto = !!modeloAuto && opModelo.includes(modeloAuto);
  const g = { ...g0, campos: g0.campos.filter((x) => !(usarAuto && x.k === "modelo_contrato")) };
  return { g, modeloAuto, usarAuto };
}

/** O que falta para haver contrato (12/11), pela ordem do ecrã: a minuta, as perguntas dela, as condições, as medidas e o plano. */
export function oQueFaltaNoContrato({ c, minuta, valores, nMinutas, aLer }: {
  c: ContextoDosTemplates; minuta: MinutaDeContrato | null; valores: Record<string, string>; nMinutas: number; aLer: boolean;
}): string[] {
  const falta: string[] = [];
  if (!minuta && !aLer) falta.push(nMinutas === 0 ? "Criar uma minuta de contrato, em «Minutas de contrato»." : "Escolher a minuta do contrato, na lista em cima.");
  if (minuta) {
    const n = extractPromptTokens(minuta.body_html).filter((k) => !(valores[k] ?? "").trim()).length;
    if (n) falta.push(n === 1 ? "Responder a 1 pergunta da minuta." : `Responder a ${n} perguntas da minuta.`);
  }
  const { g } = grupoDasCondicoes(c, minuta?.name ?? "");
  for (const x of emFalta([g], c.d.f)) falta.push(`Responder: ${x.l}.`);
  if (!retificacaoAceite(c.d)) falta.push("As medidas aceites.");
  if (!planoAprovadoDe(c.d)) falta.push("O plano da obra aprovado pelas Operações.");
  return falta;
}

function CondicoesDoContrato({ c, nomeMinuta = "" }: { c: ContextoDosTemplates; nomeMinuta?: string }) {
  const { ctx, d } = c;
  const [mudar, setMudar] = useState(false);
  const { g, modeloAuto, usarAuto } = grupoDasCondicoes(c, nomeMinuta);
  useEffect(() => {
    if (usarAuto && c.podeEditar && d.f.modelo_contrato !== modeloAuto) ctx.run(() => ctx.A.campo(d.id, "modelo_contrato", modeloAuto!));
  }, [usarAuto, modeloAuto, d.f.modelo_contrato]); // eslint-disable-line react-hooks/exhaustive-deps
  const falta = new Set(emFalta([g], d.f).map((x) => x.k));
  const todos = g.campos.filter((x) => x.t === "sim_nao" || x.t === "escolha");
  if (!todos.length) return null;
  const campos = mudar ? todos : todos.filter((x) => falta.has(x.k));
  const respondidos = todos.filter((x) => !falta.has(x.k) && d.f[x.k]);
  const opcoes = (x: (typeof todos)[number]) => (x.t === "sim_nao" ? ["Sim", "Não"] : x.op ?? []);
  return (
    <section aria-label="Condições do contrato" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h4 className="text-sm font-semibold">Condições do contrato</h4>
      {!mudar && respondidos.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
          <span className="min-w-0">{[usarAuto ? `${modeloAuto} (da minuta)` : "", ...respondidos.map((x) => `${x.l}: ${d.f[x.k]}`)].filter(Boolean).join(" · ")}</span>
          {c.podeEditar && <button type="button" onClick={() => setMudar(true)} className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Mudar</button>}
        </p>
      )}
      {campos.map((x) => (
        <div key={x.k} role="group" aria-label={x.l} className="space-y-1.5">
          <p className={cn("text-sm font-medium", falta.has(x.k) && "text-destructive")}>{x.l}{falta.has(x.k) ? " · falta responder" : ""}</p>
          <div className="flex flex-wrap gap-2">
            {opcoes(x).map((v) => {
              const on = d.f[x.k] === v;
              return (
                <button key={v} type="button" aria-pressed={on} disabled={!c.podeEditar}
                  onClick={() => ctx.run(() => ctx.A.campo(d.id, x.k, v))}
                  className={cn("min-h-11 rounded-full border px-4 text-[15px] transition-colors disabled:opacity-50", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>{v}</button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ a ligação à FaseDaEmylia */
/** Embrulha o corpo dos passos Orçamento, Proposta e Contrato com os templates; os outros passos ficam como a Emylia os montou. */
export function comTemplatesNosPassos(passos: Passo[], c: ContextoDosTemplates): Passo[] {
  return passos.map((p) => {
    if (p.id === "orc") return { ...p, corpo: <TemplateDoOrcamento c={c}>{p.corpo}</TemplateDoOrcamento> };
    if (p.id === "Proposta") return { ...p, corpo: <TemplateDaProposta c={c}>{p.corpo}</TemplateDaProposta> };
    // o contrato ainda bloqueado (o cliente não aceitou a proposta) deixa já escolher a minuta, que o contrato leva ao nascer (com o
    // signatário da minuta); o texto preenchido e o envio só abrem depois de o cliente aceitar
    if (p.id === "Contrato") return { ...p, corpo: <MinutaDoNegocio c={c} bloqueado={false} soEscolher={p.bloqueado === true}>{p.corpo}</MinutaDoNegocio> };
    return p;
  });
}
