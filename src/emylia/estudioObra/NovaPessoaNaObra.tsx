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
import { ArrowLeft, Check, ClipboardList, Loader2, Plus, X, Zap } from "lucide-react";
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

export default function NovaPessoaNaObra({ aberto, fechar, oficios = [], aoCriarTecnico }: {
  aberto: boolean; fechar: () => void;
  /** Os ofícios do Catálogo (S.custos.perfis), para a criação rápida. */
  oficios?: readonly OficioEscolha[];
  /** O técnico novo, para entrar logo nas equipas desta página. */
  aoCriarTecnico?: (t: FichaTecnico) => void;
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
            criado={(t) => aoCriarTecnico?.(t)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const CHIP = (on: boolean) => cn("inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm font-medium transition-colors",
  on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50");
const CAMPO = "h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const NOVA = "__nova__";

interface TecnicoRascunho { chave: number; nome: string; faz: string[] }

/** O nome de um técnico da empresa para o RH: com apelido, como está; só com um nome, o apelido é o da empresa («Rui» · «Gás Lisboa»). */
export function nomeDoTecnico(nome: string, empresa: string): { primeiro: string; apelido: string } | null {
  const p = partirNome(nome);
  if (p) return p;
  const so = nome.trim();
  return so && empresa.trim() ? { primeiro: so, apelido: empresa.trim() } : null;
}

// 28/11 (cliente, pelo Rúben: «porque eles são subcontratos, precisamos do seguinte: 1 empresa subcontratada, 2 técnicos da empresa»;
// «permitir "criar empresa" na dropdown, um campo simples de choice»). A empresa é uma equipa de obra (as pessoas que vêm juntas): escolhe-se
// uma das que já existem ou «Criar empresa…»; os técnicos dela, cada um com o nome e o que faz, entram no RH e na equipa da empresa.
function CriacaoRapida({ oficios, voltar, criarPessoa, criado }: {
  oficios: readonly OficioEscolha[]; voltar: (feito: boolean) => void;
  criarPessoa: ReturnType<typeof usePessoas>["criarPessoa"];
  criado: (t: FichaTecnico) => void;
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
  const lista = useMemo(() => [...oficios].filter((o) => o.n).sort((a, b) => a.n.localeCompare(b.n, "pt")), [oficios]);
  const existente = equipas.find((e) => e.id === empresaId) ?? null;
  const empresa = empresaId === NOVA ? empresaNova.trim() : existente?.nome ?? "";
  const mudar = (chave: number, m: Partial<TecnicoRascunho>) => setTecnicos((L) => L.map((t) => (t.chave === chave ? { ...t, ...m } : t)));
  const escritos = tecnicos.filter((t) => t.nome.trim());
  const pronto = !!empresa && !!cargo && !aCriar && escritos.length > 0 && escritos.every((t) => t.faz.length > 0 && !!nomeDoTecnico(t.nome, empresa));

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
        // os ofícios escolhidos (pelo nome: os perfis do Catálogo são os ofícios do RH)
        const nomes = new Set(t.faz.map((k) => oficios.find((o) => o.id === k)?.n.toLocaleLowerCase("pt-PT")).filter(Boolean));
        const { data } = await hrRpc("rh_ler_oficios_pessoa", { p_org: activeCompany.id, p_pessoa: id });
        const todos = (data as { oficios?: { id: string; nome: string }[] } | null)?.oficios ?? [];
        const skills = todos.filter((o) => nomes.has(o.nome.toLocaleLowerCase("pt-PT"))).map((o) => o.id);
        const { error } = await hrRpc("rh_guardar_oficios_pessoa", { p_org: activeCompany.id, p_pessoa: id, p_skills: skills });
        if (error) falhas.push(`os ofícios de ${partes.primeiro} (junte-os na ficha do RH)`);
        const nomesFaz = t.faz.map((k) => oficios.find((o) => o.id === k)?.n ?? "").filter(Boolean);
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
      <DialogHeader>
        <DialogTitle>Criação rápida</DialogTitle>
        <DialogDescription>A empresa subcontratada e os técnicos dela. O resto das fichas completa-se depois no RH.</DialogDescription>
      </DialogHeader>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (pronto) void criar(); }}>
        <div className="space-y-1.5">
          <label htmlFor="rapida-empresa" className="text-sm font-medium">Empresa</label>
          <select id="rapida-empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={CAMPO}>
            <option value="" disabled>Escolha a empresa</option>
            {equipas.filter((e) => e.ativa).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            <option value={NOVA}>+ Criar empresa…</option>
          </select>
          {empresaId === NOVA && (
            <input autoFocus aria-label="Nome da empresa" value={empresaNova} onChange={(e) => setEmpresaNova(e.target.value)} placeholder="Nome da empresa (ex.: Gás Lisboa, Lda)" className={CAMPO} />
          )}
        </div>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Técnicos da empresa</legend>
          {tecnicos.map((t, i) => (
            <div key={t.chave} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex gap-2">
                <input aria-label={`Nome do técnico ${i + 1}`} value={t.nome} onChange={(e) => mudar(t.chave, { nome: e.target.value })} placeholder="Nome do técnico" className={CAMPO} />
                {tecnicos.length > 1 && (
                  <button type="button" aria-label={`Tirar o técnico ${i + 1}`} onClick={() => setTecnicos((L) => L.filter((x) => x.chave !== t.chave))}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button>
                )}
              </div>
              <div role="group" aria-label={`O que faz o técnico ${i + 1}`} className="flex flex-wrap gap-1.5">
                {lista.map((o) => {
                  const on = t.faz.includes(o.id);
                  return (
                    <button key={o.id} type="button" aria-pressed={on} className={CHIP(on)}
                      onClick={() => mudar(t.chave, { faz: on ? t.faz.filter((x) => x !== o.id) : [...t.faz, o.id] })}>
                      {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{o.n}
                    </button>
                  );
                })}
                {!lista.length && <p className="text-sm text-muted-foreground">O Catálogo ainda não tem ofícios.</p>}
              </div>
              {t.nome.trim() && !t.faz.length && <p className="text-xs text-muted-foreground">Toque no que este técnico faz.</p>}
            </div>
          ))}
          <Button type="button" variant="ghost" className="min-h-10" onClick={() => setTecnicos((L) => [...L, { chave: Math.max(...L.map((x) => x.chave)) + 1, nome: "", faz: [] }])}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Juntar outro técnico
          </Button>
        </fieldset>
        <div className="space-y-1.5">
          <label htmlFor="rapida-tel" className="text-sm font-medium">Telefone da empresa <span className="font-normal text-muted-foreground">(opcional)</span></label>
          <input id="rapida-tel" type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="912 345 678" className={CAMPO} />
        </div>
        <p className="text-xs text-muted-foreground">
          {isLoading ? "A ler os cargos do RH…" : cargo ? <>Os técnicos ficam no RH com o cargo «{cargo.nome}», sem conta na Olyvia.</> : "No RH falta um cargo de técnico de obra: use a ficha completa."}
        </p>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => voltar(false)}><ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />Voltar</Button>
          <Button type="submit" className="min-h-11" disabled={!pronto}>
            {aCriar ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            Criar {escritos.length > 1 ? `${escritos.length} técnicos` : "técnico"}
          </Button>
        </div>
      </form>
    </>
  );
}
