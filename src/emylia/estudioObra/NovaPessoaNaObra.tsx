// 27/11 (Rúben: «nas equipas permitir criar novos perfis, que gera novas contas logo, porque podemos ter subcontratados»): a ficha
// «Nova pessoa» do RH aberta no Estúdio da obra. Cria a pessoa (usePessoas) e, com «Criar e enviar convite», manda-lhe o convite para
// criar a conta. Para entrar nas equipas e nas tarefas, a ficha leva o cargo de técnico de obra e o ofício (como na área Pessoas).
// 28/11 (Rúben: «deviamos simplificar, não ter este formulário todo, ele só quer nome, tipo de técnico… deixa uma opção ao criar:
// "Completa" que tem todo o form de RH, e outra de "Criação rápida" interativa com escolhas, curta e rápida»). Primeiro escolhe-se:
//  · Criação rápida: a empresa subcontratada (uma equipa de obra: escolhe-se ou cria-se) e os técnicos dela, cada um com o nome e o que
//    faz (os ofícios do Catálogo, por toque). Ficam no RH com um cargo de técnico de obra (o de subempreiteiro, se existir) e os ofícios
//    escolhidos; o resto da ficha completa-se depois no RH. Sem convite (sem conta). Entram logo nas equipas desta página, sem recarregar.
//  · Completa: a ficha toda do RH, como antes.
import { useMemo, useState } from "react";
import { ArrowLeft, Building2, Check, ChevronDown, ClipboardList, Loader2, Phone, Plus, Search, Sparkles, Trash2, UserPlus, X, Zap } from "lucide-react";
import { NovaPessoaDialogo } from "@/components/hr/NovaPessoaDialogo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePessoas } from "@/hooks/usePessoas";
import { useCargos } from "@/hooks/useCargos";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc } from "@/lib/hr/hrDb";
import type { NovaPessoaPayload } from "@/lib/hr/novaPessoa";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { FichaTecnico } from "../equipa/tecnicos";
import { guardarEquipasObra, lerEquipasObra, useEquipasObra } from "../equipa/equipasObra";
import { orgDoModoReal } from "../acessosPortal";
import { supabase } from "@/integrations/supabase/client";

/** Um ofício do Catálogo (o perfil: a chave e o nome). */
export interface OficioEscolha { id: string; n: string }

/** O nome escrito: o primeiro nome e o resto (o RH pede os dois; uma empresa também serve: «Gás Lisboa, Lda»). */
export function partirNome(s: string): { primeiro: string; apelido: string } | null {
  const p = s.replace(/\s+/g, " ").trim().split(" ");
  if (p.length < 2 || !p[0]) return null;
  return { primeiro: p[0], apelido: p.slice(1).join(" ") };
}

/** O cargo técnico de obra para a criação rápida: o de subempreiteiro (ou subcontratado, externo) se existir; senão o que traz menos
 *  ofícios herdados (assim a pessoa fica só com os que se escolhem). */
export function cargoParaRapida(cargos: readonly { id: string; nome: string; activo: boolean; tecnico_obra?: boolean }[], oficios: readonly { cargo_id: string }[]) {
  const tecnicos = cargos.filter((c) => c.activo && c.tecnico_obra);
  if (!tecnicos.length) return null;
  const sub = tecnicos.find((c) => /subempreit|subcontrat|extern/i.test(c.nome));
  if (sub) return sub;
  const n = (id: string) => oficios.filter((o) => o.cargo_id === id).length;
  return [...tecnicos].sort((a, b) => n(a.id) - n(b.id) || a.nome.localeCompare(b.nome, "pt"))[0];
}

export default function NovaPessoaNaObra({ aberto, fechar, oficios = [], aoCriarTecnico, aoCriarOficio }: {
  aberto: boolean; fechar: () => void;
  /** Os ofícios do Catálogo (S.custos.perfis), para a criação rápida. */
  oficios?: readonly OficioEscolha[];
  /** O técnico novo, para entrar logo nas equipas desta página. */
  aoCriarTecnico?: (t: FichaTecnico) => void;
  /** A função nova (criada no Catálogo), para entrar logo na lista dos ofícios desta página. */
  aoCriarOficio?: (o: OficioEscolha) => void;
}) {
  const [modo, setModo] = useState<"escolher" | "rapida" | "completa">("escolher");
  const { pessoas, criarPessoa } = usePessoas();
  const colegas = useMemo(() => pessoas.map((p) => ({ id: p.id, nome_completo: p.nome_completo })), [pessoas]);
  if (modo === "completa") {
    return (
      <NovaPessoaDialogo open={aberto} onOpenChange={(v) => { if (!v) fechar(); }} colegas={colegas} onCriar={criarPessoa}
        onCriada={() => {
          toast.success("Pessoa criada", { description: "Entra nas equipas e nas tarefas quando a ficha tiver o cargo de técnico de obra e o ofício. Recarregue o Estúdio para a ver." });
          fechar();
        }} />
    );
  }
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        {modo === "escolher" ? (
          <>
            <DialogHeader>
              <DialogTitle>Subcontratados</DialogTitle>
              <DialogDescription>Como quer criar?</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <button type="button" onClick={() => setModo("rapida")}
                className="flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/[0.04] p-4 text-left hover:border-primary">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Zap className="h-5 w-5" aria-hidden="true" /></span>
                <span><b className="block text-[15px] font-semibold">Criação rápida</b>
                  <span className="text-sm text-muted-foreground">A empresa subcontratada e os técnicos dela, com o que fazem. Entram logo nas equipas; o resto completa-se depois no RH.</span></span>
              </button>
              <button type="button" onClick={() => setModo("completa")}
                className="flex items-start gap-3 rounded-2xl border border-border p-4 text-left hover:border-primary/50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><ClipboardList className="h-5 w-5" aria-hidden="true" /></span>
                <span><b className="block text-[15px] font-semibold">Completa</b>
                  <span className="text-sm text-muted-foreground">A ficha toda do RH: documentos, contrato, retribuição e o convite para a conta.</span></span>
              </button>
            </div>
          </>
        ) : (
          <CriacaoRapida oficios={oficios} voltar={(feito) => (feito ? fechar() : setModo("escolher"))} criarPessoa={criarPessoa}
            criado={(t) => aoCriarTecnico?.(t)} aoCriarOficio={aoCriarOficio} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const CAMPO = "h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px] outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const NOVA = "__nova__";
/** Quantas funções se mostram antes de «Ver todas» (sem pesquisa). */
const VISIVEIS = 10;

interface TecnicoRascunho { chave: number; nome: string; faz: string[] }

/** O nome de um técnico da empresa para o RH: com apelido, como está; só com um nome, o apelido é o da empresa («Rui» · «Gás Lisboa»). */
export function nomeDoTecnico(nome: string, empresa: string): { primeiro: string; apelido: string } | null {
  const p = partirNome(nome);
  if (p) return p;
  const so = nome.trim();
  return so && empresa.trim() ? { primeiro: so, apelido: empresa.trim() } : null;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** O nome de uma função para mostrar: com maiúscula no início («tecnico de eletricidade» → «Tecnico de eletricidade»). */
export const nomeDaFuncao = (n: string) => (n ? n.charAt(0).toLocaleUpperCase("pt-PT") + n.slice(1) : n);
/** As funções que batem com a pesquisa (sem acentos nem maiúsculas; todas as palavras têm de estar). */
export function funcoesQueBatem(lista: readonly OficioEscolha[], q: string): OficioEscolha[] {
  const ps = semAcento(q).split(/\s+/).filter(Boolean);
  return ps.length ? lista.filter((o) => ps.every((p) => semAcento(o.n).includes(p))) : [...lista];
}
/** Se a pesquisa já é o nome de uma função (para não oferecer criar uma repetida). */
export const funcaoExiste = (lista: readonly OficioEscolha[], q: string) => lista.some((o) => semAcento(o.n) === semAcento(q));
const iniciais = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toLocaleUpperCase("pt-PT")).join("");

// 28/11 (cliente, pelo Rúben: «porque eles são subcontratos, precisamos do seguinte: 1 empresa subcontratada, 2 técnicos da empresa»;
// «permitir "criar empresa" na dropdown, um campo simples de choice»). A empresa é uma equipa de obra (as pessoas que vêm juntas): escolhe-se
// uma das que já existem ou «Criar empresa…»; os técnicos dela, cada um com o nome e o que faz, entram no RH e na equipa da empresa.
// 28/11 (Rúben: «permitir pesquisar funções, selecionar várias e criar mais funções, e mete mais bonito»): as funções de cada técnico com
// pesquisa, as escolhidas à vista (tiram-se com um toque) e «Criar função "…"» quando a pesquisa não acha nenhuma (fica no Catálogo).
function CriacaoRapida({ oficios, voltar, criarPessoa, criado, aoCriarOficio }: {
  oficios: readonly OficioEscolha[]; voltar: (feito: boolean) => void;
  criarPessoa: ReturnType<typeof usePessoas>["criarPessoa"];
  criado: (t: FichaTecnico) => void;
  aoCriarOficio?: (o: OficioEscolha) => void;
}) {
  const { activeCompany } = useCompany();
  const { cargos, oficios: oficiosDosCargos, isLoading } = useCargos();
  const cargo = useMemo(() => cargoParaRapida(cargos, oficiosDosCargos), [cargos, oficiosDosCargos]);
  const equipas = useEquipasObra();
  const [empresaId, setEmpresaId] = useState(() => (lerEquipasObra().some((e) => e.ativa) ? "" : NOVA));
  const [empresaNova, setEmpresaNova] = useState("");
  const [tecnicos, setTecnicos] = useState<TecnicoRascunho[]>([{ chave: 1, nome: "", faz: [] }]);
  const [tel, setTel] = useState("");
  const [aCriar, setACriar] = useState(false);
  const [erro, setErro] = useState("");
  // as funções criadas aqui (entram logo na lista, antes de o Catálogo se ler outra vez)
  const [novas, setNovas] = useState<OficioEscolha[]>([]);
  const lista = useMemo(() => {
    const todas = [...oficios, ...novas.filter((x) => !oficios.some((o) => o.id === x.id))];
    return todas.filter((o) => o.n).sort((a, b) => a.n.localeCompare(b.n, "pt", { sensitivity: "base" }));
  }, [oficios, novas]);
  const existente = equipas.find((e) => e.id === empresaId) ?? null;
  const empresa = empresaId === NOVA ? empresaNova.trim() : existente?.nome ?? "";
  const mudar = (chave: number, m: Partial<TecnicoRascunho>) => setTecnicos((L) => L.map((t) => (t.chave === chave ? { ...t, ...m } : t)));
  const escritos = tecnicos.filter((t) => t.nome.trim());
  const pronto = !!empresa && !!cargo && !aCriar && escritos.length > 0 && escritos.every((t) => t.faz.length > 0 && !!nomeDoTecnico(t.nome, empresa));

  /** Cria a função no Catálogo (ops_skill, como em Catálogo › Perfis) e devolve-a; null se falhou (com o aviso). */
  const criarFuncao = async (nome: string): Promise<OficioEscolha | null> => {
    const n = nome.replace(/\s+/g, " ").trim();
    if (!n || !activeCompany?.id) return null;
    const { data, error } = await supabase.rpc("cat_guardar_perfil" as never, { p_org: activeCompany.id, p_id: null, p_nome: n, p_salario_referencia: null } as never);
    if (error || !data) { toast.error("Não foi possível criar a função", { description: error?.message ?? "Tente outra vez, ou crie-a no Catálogo." }); return null; }
    const o = { id: String(data), n };
    setNovas((L) => [...L, o]);
    aoCriarOficio?.(o);
    return o;
  };

  const criar = async () => {
    if (!cargo || !activeCompany?.id || !empresa) return;
    setACriar(true); setErro("");
    const criados: string[] = [], falhas: string[] = [];
    for (const t of escritos) {
      const partes = nomeDoTecnico(t.nome, empresa)!;
      try {
        const payload: NovaPessoaPayload = {
          nucleo: {
            primeiro_nome: partes.primeiro, apelido: partes.apelido, email_trabalho: null, email_pessoal: null,
            telefone_trabalho: tel.trim() || null, numero_interno: null, cargo: cargo.nome, cargo_id: cargo.id, local_id: null,
            reporta_a_pessoa_id: null, data_admissao: null, data_antiguidade: null,
          },
          dadosPessoais: null, identificacao: null, niss: null, morada: null, conta: null, bicSozinho: null, fardamento: null, emergencia: null,
          vinculo: null, horasVinculo: null, retribuicao: null, horario: null,
          acesso: { role_id: null, enviar_convite: false, email_convite: null }, contaALigar: null,
        };
        const { id } = await criarPessoa(payload);
        // as funções escolhidas (pelo nome: os perfis do Catálogo são os ofícios do RH)
        const nomes = new Set(t.faz.map((k) => semAcento(lista.find((o) => o.id === k)?.n ?? "")).filter(Boolean));
        const { data } = await hrRpc("rh_ler_oficios_pessoa", { p_org: activeCompany.id, p_pessoa: id });
        const todos = (data as { oficios?: { id: string; nome: string }[] } | null)?.oficios ?? [];
        const skills = todos.filter((o) => nomes.has(semAcento(o.nome))).map((o) => o.id);
        const { error } = await hrRpc("rh_guardar_oficios_pessoa", { p_org: activeCompany.id, p_pessoa: id, p_skills: skills });
        if (error) falhas.push(`as funções de ${partes.primeiro} (junte-as na ficha do RH)`);
        const nomesFaz = t.faz.map((k) => lista.find((o) => o.id === k)?.n ?? "").filter(Boolean);
        criado({
          id, pessoaRhId: id, n: `${partes.primeiro} ${partes.apelido}`, sk: nomesFaz[0] ?? "", perfilId: t.faz[0], perfis: [...t.faz],
          ...(nomesFaz.length > 1 ? { oficiosRotulo: [...nomesFaz].sort((a, b) => a.localeCompare(b, "pt")).join(" · ") } : {}),
          ferias: [], custoHora: 0, semCustoRh: true, tel: tel.trim(), desde: "",
        });
        criados.push(id);
      } catch (e) {
        falhas.push(`${t.nome.trim()}: ${e instanceof Error ? e.message : "não foi possível criar"}`);
      }
    }
    // a empresa: a equipa com os técnicos dela (a que já existia ganha os novos)
    if (criados.length) {
      const org = orgDoModoReal();
      const L = existente
        ? lerEquipasObra().map((e) => (e.id === existente.id ? { ...e, membros: [...e.membros, ...criados] } : e))
        : [...lerEquipasObra(), { id: `eq-${Date.now().toString(36)}`, nome: empresa, membros: criados, ativa: true }];
      const e = await guardarEquipasObra(org ? supabase : null, org, L);
      if (e) falhas.push(`a empresa: ${e}`);
    }
    setACriar(false);
    if (criados.length) toast.success(`${empresa}: ${criados.length} ${criados.length === 1 ? "técnico criado" : "técnicos criados"}`, { description: "Já está nas equipas. O resto das fichas completa-se no RH." });
    if (falhas.length) setErro(`Faltou: ${falhas.join("; ")}.`);
    else voltar(true);
  };

  return (
    <>
      <DialogHeader className="space-y-1">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Zap className="h-5 w-5" /></span>
          <div className="min-w-0 text-left">
            <DialogTitle>Criação rápida</DialogTitle>
            <DialogDescription>A empresa subcontratada e os técnicos dela.</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); if (pronto) void criar(); }}>
        {/* 1. a empresa */}
        <section aria-labelledby="rapida-t-empresa" className="space-y-2">
          <h3 id="rapida-t-empresa" className="flex items-center gap-2 text-sm font-semibold"><Passo n={1} />Empresa</h3>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <select aria-label="Empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={cn(CAMPO, "appearance-none pl-9 pr-9")}>
              <option value="" disabled>Escolha a empresa</option>
              {equipas.filter((e) => e.ativa).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              <option value={NOVA}>+ Criar empresa…</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          </div>
          {empresaId === NOVA && (
            <input autoFocus aria-label="Nome da empresa" value={empresaNova} onChange={(e) => setEmpresaNova(e.target.value)} placeholder="Nome da empresa (ex.: Gás Lisboa, Lda)" className={CAMPO} />
          )}
        </section>

        {/* 2. os técnicos */}
        <section aria-labelledby="rapida-t-tecnicos" className="space-y-3">
          <h3 id="rapida-t-tecnicos" className="flex items-center gap-2 text-sm font-semibold"><Passo n={2} />Técnicos da empresa</h3>
          {tecnicos.map((t, i) => (
            <div key={t.chave} className="space-y-3 rounded-2xl border border-border bg-muted/30 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold", t.nome.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {t.nome.trim() ? iniciais(t.nome) : i + 1}
                </span>
                <input aria-label={`Nome do técnico ${i + 1}`} value={t.nome} onChange={(e) => mudar(t.chave, { nome: e.target.value })} placeholder="Nome do técnico" className={cn(CAMPO, "bg-card")} />
                {tecnicos.length > 1 && (
                  <button type="button" aria-label={`Tirar o técnico ${i + 1}`} onClick={() => setTecnicos((L) => L.filter((x) => x.chave !== t.chave))}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                )}
              </div>
              <FuncoesDoTecnico n={i + 1} lista={lista} escolhidas={t.faz} mudar={(faz) => mudar(t.chave, { faz })} criarFuncao={criarFuncao} />
            </div>
          ))}
          <button type="button" onClick={() => setTecnicos((L) => [...L, { chave: Math.max(...L.map((x) => x.chave)) + 1, nome: "", faz: [] }])}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground">
            <UserPlus className="h-4 w-4" aria-hidden="true" />Juntar outro técnico
          </button>
        </section>

        {/* 3. o contacto */}
        <section aria-labelledby="rapida-t-tel" className="space-y-2">
          <h3 id="rapida-t-tel" className="flex items-center gap-2 text-sm font-semibold"><Passo n={3} />Telefone da empresa <span className="font-normal text-muted-foreground">(opcional)</span></h3>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input aria-label="Telefone da empresa" type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="912 345 678" className={cn(CAMPO, "pl-9")} />
          </div>
        </section>

        <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {isLoading ? "A ler os cargos do RH…" : cargo ? <>Os técnicos ficam no RH com o cargo «{cargo.nome}», sem conta na Olyvia. O resto das fichas completa-se depois no RH.</> : "No RH falta um cargo de técnico de obra: use a ficha completa."}
        </p>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => voltar(false)}><ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />Voltar</Button>
          <Button type="submit" className="min-h-11 px-5" disabled={!pronto}>
            {aCriar ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            {escritos.length > 1 ? `Criar ${escritos.length} técnicos` : "Criar técnico"}
          </Button>
        </div>
      </form>
    </>
  );
}

const Passo = ({ n }: { n: number }) => (
  <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{n}</span>
);

/** As funções de um técnico: as escolhidas à vista (um toque tira), a pesquisa e as sugestões; sem resultado, criar a função. */
function FuncoesDoTecnico({ n, lista, escolhidas, mudar, criarFuncao }: {
  n: number; lista: readonly OficioEscolha[]; escolhidas: string[]; mudar: (faz: string[]) => void;
  criarFuncao: (nome: string) => Promise<OficioEscolha | null>;
}) {
  const [q, setQ] = useState("");
  const [todas, setTodas] = useState(false);
  const [aCriar, setACriar] = useState(false);
  const escolhidasO = escolhidas.map((id) => lista.find((o) => o.id === id)).filter((o): o is OficioEscolha => !!o);
  const resto = funcoesQueBatem(lista, q).filter((o) => !escolhidas.includes(o.id));
  const mostrar = q.trim() || todas ? resto : resto.slice(0, VISIVEIS);
  const podeCriar = q.trim().length >= 2 && !funcaoExiste(lista, q);
  const criar = async () => {
    setACriar(true);
    const o = await criarFuncao(q);
    setACriar(false);
    if (o) { mudar([...escolhidas, o.id]); setQ(""); }
  };
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
        <span className="text-xs font-medium text-muted-foreground">Funções:</span>
        {escolhidasO.length ? escolhidasO.map((o) => (
          <button key={o.id} type="button" onClick={() => mudar(escolhidas.filter((x) => x !== o.id))} aria-label={`Tirar a função ${o.n}`}
            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {nomeDaFuncao(o.n)}<X className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
          </button>
        )) : <span className="text-xs text-muted-foreground">nenhuma ainda: escolha abaixo (pode escolher várias)</span>}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" aria-label={`Procurar uma função do técnico ${n}`} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (resto.length === 1) { mudar([...escolhidas, resto[0].id]); setQ(""); } else if (podeCriar && !resto.length) void criar(); } }}
          placeholder="Procurar função (ex.: gás, canalizador)" className={cn(CAMPO, "h-10 bg-card pl-9 text-sm [&::-webkit-search-cancel-button]:hidden")} />
      </div>
      <div role="group" aria-label={`Funções para escolher, técnico ${n}`} className="flex flex-wrap gap-1.5">
        {mostrar.map((o) => (
          <button key={o.id} type="button" onClick={() => { mudar([...escolhidas, o.id]); if (q) setQ(""); }}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm hover:border-primary/60 hover:bg-primary/[0.04]">
            <Plus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{nomeDaFuncao(o.n)}
          </button>
        ))}
        {!q.trim() && !todas && resto.length > VISIVEIS && (
          <button type="button" onClick={() => setTodas(true)} className="inline-flex min-h-8 items-center rounded-full px-3 text-sm font-medium text-primary hover:underline">
            Ver todas ({resto.length})
          </button>
        )}
        {q.trim() && !resto.length && !podeCriar && <span className="text-sm text-muted-foreground">Essa função já está escolhida.</span>}
        {podeCriar && (
          <button type="button" disabled={aCriar} onClick={() => void criar()}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-primary/60 px-3 text-sm font-medium text-primary hover:bg-primary/[0.06] disabled:opacity-60">
            {aCriar ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}Criar função «{q.trim()}»
          </button>
        )}
      </div>
    </div>
  );
}
