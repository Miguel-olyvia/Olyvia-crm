// Os templates nos passos Orçamento, Proposta e Contrato do Negócio da Emylia (ficha do Pipeline). Não se mexe na Emylia (src/emylia): os passos que ela monta
// (passosDaFase) são embrulhados aqui, passo a passo, por `comTemplatesNosPassos` (a prop `ajustarPassos` da FaseDaEmylia).
//  · Orçamento: seletor do template do tipo orçamento (proposal_templates, template_type='quote') e o seu aspeto.
//  · Proposta:  seletor do template do tipo proposta (template_type='proposal'); a pré-visualização da proposta passa a ter as cores, as fontes, o logo
//    e os textos do template, com o nome e o logo REAIS da organização; botão «Enviar para o portal do cliente».
//  · Contrato:  seletor da minuta (client_contract_templates), as perguntas {{chave}} da minuta e o corpo preenchido; botão de envio ao portal.
// A escolha guarda-se SÓ pelas RPCs neg_definir_templates_negocio / neg_ler_templates_negocio (useTemplatesDoNegocio).
import { useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import "./propostaComTemplate.css";
import { totaisIva } from "@/emylia/motor";
import { definirModoReal, nifEmpresa, nomeEmpresa, nomeFiscalEmpresa, orgDoModoReal } from "@/emylia/acessosPortal";
import type { Passo } from "@/emylia/CamposFase";
import type { Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { useCompany } from "@/contexts/CompanyContext";
import { useMinutasDeContrato, usePerguntasDeContrato, useTemplatesDeAspeto, type MinutaDeContrato, type TemplateDeAspeto } from "@/hooks/pessoas/useTemplatesDeDocumento";
import { useTemplatesDoNegocio, type UseTemplatesDoNegocio } from "@/hooks/pessoas/useTemplatesDoNegocio";
import { extractPromptTokens, substituteVariables, type ContractVariableData } from "@/utils/contractVariables";
import { sanitizeRichHtml } from "@/utils/sanitize";
import { FOCO } from "@/components/negocio-metas/estilos";
import { cn } from "@/lib/utils";
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
          ajuda={omissao && !neg.dados.template_orcamento_id ? `O da organização por omissão é «${omissao.name}».` : "Define o aspeto do documento do orçamento (cores, logótipo, textos). Cada versão nova do orçamento começa sem template: volte a escolher."}
          aLer={lista.isLoading} erro={lista.error instanceof Error ? lista.error.message : null} aoTentar={() => { void lista.refetch(); }}
          aoEscolher={(id) => { void neg.guardar({ template_orcamento_id: id }); }} desativado={!podeEscolher(neg, c)}
          paginaDeCriacao={{ para: "/quote-templates", texto: "Criar templates de orçamento" }} vazio="Ainda não há templates do tipo orçamento nesta organização."
        />
        <AvisosDaGravacao t={neg} />
        {(
          <details className="text-[15px]" open>
            <summary className={cn("min-h-11 cursor-pointer py-2 font-medium", FOCO)}>Ver o documento do orçamento</summary>
            <div className="mt-2"><OrcamentoPdf d={c.d} S={c.ctx.S} tpl={escolhido} orgId={activeCompany?.id ?? null} nome={org.nome} logoOrg={org.logo} /></div>
          </details>
        )}
      </section>
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
function dadosDaMinuta(d: Negocio, c: ContextoDosTemplates, nome: string, valores: Record<string, string>): ContractVariableData {
  const T = d.orc ? totaisIva(d, c.ctx.S) : null;
  const base: ContractVariableData = {
    empresa_nome: nome, cliente_nome: d.f.nome_fiscal || d.nome, cliente_nif: d.f.nif_fat || d.f.nif || "", cliente_morada: d.f.morada || d.local || "",
    cliente_email: d.f.email || "", cliente_telefone: d.tel.includes("@") ? "" : d.tel, ...(T ? { contrato_valor: T.total, proposta_valor: T.total } : {}),
  };
  return { ...base, ...valores } as ContractVariableData;
}

function MinutaDoContrato({ minuta, valores, aoEscrever, aoGuardar, desativado, d, c, nome }: {
  minuta: MinutaDeContrato; valores: Record<string, string>; aoEscrever: (k: string, v: string) => void; aoGuardar: () => void; desativado: boolean; d: Negocio; c: ContextoDosTemplates; nome: string;
}) {
  const perguntas = usePerguntasDeContrato();
  const chaves = useMemo(() => extractPromptTokens(minuta.body_html), [minuta.body_html]);
  const rotulo = new Map((perguntas.data ?? []).map((p) => [p.key, p]));
  const html = useMemo(() => sanitizeRichHtml(substituteVariables(minuta.body_html, dadosDaMinuta(d, c, nome, valores), true)), [minuta.body_html, d, c, nome, valores]);
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
      <section aria-label="Minuta preenchida" className="rounded-xl border border-border bg-white p-4 text-[15px] text-slate-900">
        <p className="mb-2 text-sm font-semibold text-slate-600">Minuta «{minuta.name}» preenchida (o que falta aparece a amarelo)</p>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    </div>
  );
}

function MinutaDoNegocio({ c, children, bloqueado }: { c: ContextoDosTemplates; children: ReactNode; bloqueado: boolean }) {
  const org = useNomeRealDaOrganizacao();
  const lista = useMinutasDeContrato();
  const neg = useTemplatesDoNegocio(c.negocioId);
  const minuta = lista.data?.find((m) => m.id === neg.dados.minuta_id) ?? null;
  // As respostas repõem-se do guardado só quando muda o negócio, o estado da leitura ou a minuta escolhida (e não a cada gravação).
  const [valores, setValores] = useState<Record<string, string>>({});
  const [chaveVista, setChaveVista] = useState("");
  const chave = `${c.negocioId ?? ""}|${neg.estado}|${neg.dados.minuta_id ?? ""}`;
  if (chave !== chaveVista) { setChaveVista(chave); setValores(neg.dados.minuta_respostas); }
  const omissao = lista.data?.find((m) => m.is_default) ?? null;
  const corpoPreenchido = (m: MinutaDeContrato, v: Record<string, string>): string =>
    sanitizeRichHtml(substituteVariables(m.body_html, dadosDaMinuta(c.d, c, org.nome, v)));
  const guardarRespostas = async (): Promise<void> => {
    if (!minuta) return;
    const guardado = neg.dados.minuta_respostas;
    const iguais = Object.keys({ ...guardado, ...valores }).every((k) => (guardado[k] ?? "") === (valores[k] ?? ""));
    if (iguais) return;
    // respostas e texto preenchido vão juntos: o contrato que segue é o que se viu. Se a base não aceitar, o ecrã volta ao guardado (o aviso diz porquê).
    const ok = await neg.guardar({ minuta_respostas: valores, contrato_corpo_html: corpoPreenchido(minuta, valores) });
    if (!ok) setValores(guardado);
  };
  return (
    <div className="space-y-6">
      <section aria-label="Minuta do contrato" className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <SeletorDeTemplate
          rotulo="Minuta do contrato" valor={neg.dados.minuta_id} opcoes={opcoesDe(lista.data)}
          ajuda={omissao && !neg.dados.minuta_id ?`A minuta por omissão é «${omissao.name}».` : "O corpo do contrato; as cláusulas do negócio (prestações, adendas) seguem no fim."}
          aLer={lista.isLoading} erro={lista.error instanceof Error ? lista.error.message : null} aoTentar={() => { void lista.refetch(); }}
          aoEscolher={(id) => {
            const m = id ? lista.data?.find((x) => x.id === id) ?? null : null;
            void neg.guardar({ minuta_id: id, minuta_respostas: {}, contrato_corpo_html: m ? corpoPreenchido(m, {}) : null });
          }}
          desativado={bloqueado || !podeEscolher(neg, c)}
          paginaDeCriacao={{ para: "/contract-templates", texto: "Criar minutas de contrato" }} vazio="Ainda não há minutas de contrato ativas nesta organização."
        />
        <AvisosDaGravacao t={neg} />
        {minuta && (
          <MinutaDoContrato
            minuta={minuta} valores={valores} d={c.d} c={c} nome={org.nome} desativado={bloqueado || !podeEscolher(neg, c)}
            aoEscrever={(k, v) => setValores((x) => ({ ...x, [k]: v }))}
            aoGuardar={() => { void guardarRespostas(); }}
          />
        )}
      </section>
      <div key={org.chave}>{children}</div>
      <EnviarParaPortal negocioId={c.negocioId} tipo="contract" podeEditar={c.podeEditar} />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ a ligação à FaseDaEmylia */
/** Embrulha o corpo dos passos Orçamento, Proposta e Contrato com os templates; os outros passos ficam como a Emylia os montou. */
export function comTemplatesNosPassos(passos: Passo[], c: ContextoDosTemplates): Passo[] {
  return passos.map((p) => {
    if (p.id === "orc") return { ...p, corpo: <TemplateDoOrcamento c={c}>{p.corpo}</TemplateDoOrcamento> };
    if (p.id === "Proposta") return { ...p, corpo: <TemplateDaProposta c={c}>{p.corpo}</TemplateDaProposta> };
    // o contrato ainda bloqueado (o cliente não aceitou a proposta) fica como a Emylia o diz: sem minuta nem envio
    if (p.id === "Contrato" && p.bloqueado !== true) return { ...p, corpo: <MinutaDoNegocio c={c} bloqueado={false}>{p.corpo}</MinutaDoNegocio> };
    return p;
  });
}
