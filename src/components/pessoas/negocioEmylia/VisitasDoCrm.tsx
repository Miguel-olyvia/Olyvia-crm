// O passo Visitas (e a vaga da primeira visita) do negócio da Emylia, com o agendamento do CRM. FONTE ÚNICA: a visita é o schedule_item que neg_guardar_visita grava com
// p_negocio_id; este corpo lê, mostra, conta e age só sobre esse (marcar, remarcar, «Revisita», cancelar, dar como feita). O negócio da Emylia guarda apenas um ESPELHO
// derivado (espelhoVisitaEmylia.ts) para o motor dela (os portões de «Fechar o levantamento») continuar a funcionar; se discordarem, ganha o CRM.
// Estados visíveis: a ler, erro (com «Tentar outra vez»), sem organização, sem negócio gravado, sem visitas. Nada de exemplo a parecer real.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { visitas as numerosDe, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { FOCO } from "@/components/negocio-metas/estilos";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/contexts/CompanyContext";
import { FontePessoasContext, useFontePessoas, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { chaveDosPresentes, TEXTO_DO_TIPO } from "@/hooks/pessoas/tipoVisitaChave";
import { useAcoesVisita } from "@/hooks/pessoas/useAcoesVisita";
import { useAgendaVisita } from "@/hooks/pessoas/useAgendaVisita";
import { semSombras, useEntidadeDoNegocio, useVisitasDoNegocio, visitasDoNegocioQueryKey, type VisitaDoNegocio } from "@/hooks/pessoas/useVisitasDoNegocio";
import { cn } from "@/lib/utils";
import { ErroAcao } from "../ErroAcao";
import { useExecutarAcao } from "../useExecutarAcao";
import type { MoradaVisita } from "../pessoasTipos";
import { EstadoHonesto } from "./EstadoHonesto";
import {
  aplicarEspelho, calcularEspelho, escreverDoFormulario, marcasDoEspelho, vagaDoMotor, visitasSoDaEmylia,
} from "./espelhoVisitaEmylia";
import { MarcarVisitaNegocio, type VisitaGravada } from "./MarcarVisitaNegocio";

/** O que o passo precisa de saber do negócio. `entityId` pode faltar (a ficha só sabe o negócio): lê-se da base. */
export interface ContextoDasVisitas {
  negocioId: string | null;
  entityId?: string | null;
  ctx: Ctx;
  d: Negocio;
  podeEditar: boolean;
}

type Modo = "visitas" | "primeira";

const COR_ESTADO = { marcada: "bg-sky-100 text-sky-800", feita: "bg-emerald-100 text-emerald-800", cancelada: "bg-muted text-muted-foreground" } as const;
const TEXTO_ESTADO = { marcada: "Marcada", feita: "Feita", cancelada: "Cancelada" } as const;
const diaCurto = (iso: string): string => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" }) : "dia por marcar");

/** Fora da ficha das Pessoas a fonte está em modo exemplo e os hooks do CRM não leem nem gravam: aqui liga-se à organização ativa (e só aqui). */
function ComFonteReal({ children }: { children: ReactNode }) {
  const fonte = useFontePessoas();
  const { activeCompany } = useCompany();
  const org = activeCompany?.id ?? null;
  const valor = useMemo<FontePessoas>(() => (org ? { modo: "real", organizationId: org, momentoGanho: null } : { modo: "exemplo" }), [org]);
  if (fonte.modo === "real") return <>{children}</>;
  if (!org) return <EstadoHonesto titulo="Escolha uma organização para marcar visitas." />;
  return <FontePessoasContext.Provider value={valor}>{children}</FontePessoasContext.Provider>;
}

const moradaDoNegocio = (d: Negocio): MoradaVisita | null => {
  const m = { rua: (d.f.morada || d.local || "").trim(), codigoPostal: (d.f.cp || "").trim(), localidade: (d.f.localidade || "").trim(), andar: "" };
  return m.rua || m.codigoPostal || m.localidade ? m : null;
};

function CartaoDaVisita({ n, tipo, estado, dia, hora, quem, aoLado }: { n: number; tipo: string; estado: keyof typeof COR_ESTADO; dia: string; hora: string; quem: string; aoLado?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="flex items-center gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-700" aria-hidden="true"><CalendarClock className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-semibold">Visita {n} · {tipo}</h4>
          <p className="text-[15px] text-muted-foreground">{diaCurto(dia)}{hora ? ` · ${hora}` : ""} · {quem || "por atribuir"}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-sm font-medium", COR_ESTADO[estado])}>{TEXTO_ESTADO[estado]}</span>
      </div>
      {aoLado}
    </section>
  );
}

function Corpo({ c, modo }: { c: ContextoDasVisitas; modo: Modo }) {
  const { d, ctx } = c;
  const cliente = useQueryClient();
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const entidade = useEntidadeDoNegocio(c.negocioId, c.entityId ?? null);
  const lidas = useVisitasDoNegocio(c.negocioId);
  const agenda = useAgendaVisita();
  const acoes = useAcoesVisita(entidade.entityId ?? "", null);
  const acao = useExecutarAcao();
  const [aMarcar, setAMarcar] = useState(false);
  const [aRemarcar, setARemarcar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const nomes = useMemo(() => new Map(agenda.recursos.map((r) => [r.id, r.name])), [agenda.recursos]);
  // sem useMemo: o negócio da Emylia é mutado no sítio e as marcas do espelho mudam sem mudar de identidade
  const visitasCrm = semSombras(lidas.visitas, marcasDoEspelho(d));
  const ativas = visitasCrm.filter((v) => v.estado !== "cancelada");
  const lido = !lidas.isLoading && !lidas.isError && !agenda.isLoading && c.negocioId !== null;

  // O espelho acompanha o CRM (se discordar, o CRM ganha): só escreve quando há diferença e a pessoa pode editar; nunca em loop com o mesmo plano.
  const ultimoPlano = useRef("");
  useEffect(() => {
    if (!lido || !c.podeEditar) return;
    const plano = calcularEspelho(d, visitasCrm, nomes);
    if (!plano) { ultimoPlano.current = ""; return; }
    const assinatura = JSON.stringify(plano);
    if (assinatura === ultimoPlano.current) return;
    ultimoPlano.current = assinatura;
    ctx.run(() => aplicarEspelho(d, plano));
  });

  const refletir = (lista: VisitaDoNegocio[], ligar: { visitaId: string; numero?: number } | null, antes?: () => number | undefined, presentes?: string): void => {
    ctx.run(() => {
      const numero = antes?.();
      const plano = calcularEspelho(d, lista, nomes, ligar ? { ...ligar, ...(numero !== undefined ? { numero } : {}) } : null);
      if (plano) aplicarEspelho(d, plano);
      const n = ligar ? [...marcasDoEspelho(d)].find(([, id]) => id === ligar.visitaId)?.[0] : undefined;
      if (n !== undefined && presentes !== undefined) escreverDoFormulario(d, n, presentes, "");
    });
    if (org) void cliente.invalidateQueries({ queryKey: visitasDoNegocioQueryKey(org, c.negocioId) });
  };
  // a primeira visita leva o negócio da fase Contacto para a Visita: o motor aplica os portões dele (as respostas do Contacto) e a visita fica no CRM de qualquer forma
  const passarAVisita = (g: VisitaGravada): number | undefined => {
    if (modo !== "primeira" || d.fase !== 1 || g.remarcada) return undefined;
    const antes = numerosDe(d).length;
    ctx.A.marcarVisita(d.id, vagaDoMotor(g.visita.dia, g.visita.hora));
    return antes === 0 && d.fase >= 2 ? numerosDe(d).find((n) => !d.f[`v${n}_crm`]) : undefined;
  };
  const aposGravar = (g: VisitaGravada): void => {
    setAMarcar(false); setARemarcar(null); setAviso(null);
    const lista = [...visitasCrm.filter((v) => v.id !== g.visita.id), ...(g.visita.id ? [g.visita] : [])];
    refletir(lista, g.visita.id ? { visitaId: g.visita.id } : null, () => passarAVisita(g), g.presentes);
    if (modo === "primeira" && d.fase < 2) setAviso("A visita ficou marcada no CRM, mas o negócio ainda não passou à fase da visita: faltam respostas do Contacto (veja o aviso). Complete-as e use «Passar à visita».");
  };
  const passarComAMarcada = (v: VisitaDoNegocio): void => {
    setAviso(null);
    refletir(visitasCrm, { visitaId: v.id }, () => passarAVisita({ visitaId: v.id, visita: v, presentes: "", remarcada: false }));
    if (d.fase < 2) setAviso("O negócio ainda não passou à fase da visita: faltam respostas do Contacto (veja o aviso).");
  };
  const cancelar = (v: VisitaDoNegocio): void => {
    acao.executar(() => acoes.cancelar(v.id).then(() => undefined), () => refletir(visitasCrm.map((x) => (x.id === v.id ? { ...x, estado: "cancelada" as const } : x)), null));
  };
  const darComoFeita = (v: VisitaDoNegocio): void => {
    acao.executar(() => acoes.concluir(v.id), () => refletir(visitasCrm.map((x) => (x.id === v.id ? { ...x, estado: "feita" as const } : x)), null));
  };

  if (c.negocioId === null) return <EstadoHonesto titulo="Este negócio ainda não está gravado na base.">As visitas marcam-se na agenda real, por isso só depois de o negócio estar gravado.</EstadoHonesto>;
  if (entidade.isError) return <EstadoHonesto titulo="Não foi possível saber a que pessoa pertence este negócio.">Sem isso não se marca a visita. Volte a abrir o negócio.</EstadoHonesto>;
  if (entidade.isLoading || lidas.isLoading || agenda.isLoading) return <p role="status" className="text-[15px] text-muted-foreground">A ler as visitas e a agenda…</p>;
  if (lidas.isError || agenda.isError) {
    return (
      <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-[15px]">
        <p className="text-destructive">Não foi possível ler as visitas ou a agenda. Não se mostra «sem visitas» porque não se sabe.</p>
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={() => { lidas.refetch(); agenda.refetch(); }}>Tentar outra vez</Button>
      </div>
    );
  }
  if (entidade.entityId === null) return <EstadoHonesto titulo="Este negócio não tem pessoa associada.">Sem pessoa não se marca a visita na agenda.</EstadoHonesto>;

  const formulario = (visita?: VisitaDoNegocio): ReactNode => (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <MarcarVisitaNegocio
        entityId={entidade.entityId as string} negocioId={c.negocioId as string} nome={d.nome} moradaLead={moradaDoNegocio(d)} soLeitura={!c.podeEditar}
        tipoInicial={ativas.length > 0 || numerosDe(d).length > 0 ? "revisita" : "levantamento"} {...(visita ? { visita, presentesInicial: presentesDe(d, visita) } : {})}
        rotuloGravar={visita ? "Guardar a nova hora" : modo === "primeira" ? "Marcar a visita" : "Marcar visita"} aoGuardada={aposGravar}
        aoFechar={visita || visitasCrm.length > 0 || modo === "visitas" ? () => { setAMarcar(false); setARemarcar(null); } : undefined}
      />
    </div>
  );
  const legadas = visitasSoDaEmylia(d);
  const semVisitas = visitasCrm.length === 0 && legadas.length === 0;
  return (
    <div className="max-w-3xl space-y-4">
      {modo === "primeira" && ativas.length > 0 && d.fase === 1 && (
        <EstadoHonesto titulo="Já há uma visita marcada no CRM para este negócio.">
          <Button type="button" className={cn("mt-2 min-h-11", FOCO)} onClick={() => passarComAMarcada(ativas[0] as VisitaDoNegocio)}>Passar à visita</Button>
        </EstadoHonesto>
      )}
      {aviso && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[15px] text-amber-900">{aviso}</p>}
      <ErroAcao chave={acao.erro} chaveExtra={acao.erroExtra} />
      {semVisitas && !aMarcar && <EstadoHonesto titulo="Ainda não há visitas marcadas neste negócio." />}
      {visitasCrm.map((v, i) => (
        <div key={v.id} className="space-y-3">
          <CartaoDaVisita
            n={i + 1} tipo={v.tipo ? TEXTO_DO_TIPO[v.tipo] : "Visita"} estado={v.estado} dia={v.dia} hora={v.hora} quem={v.recursos.map((r) => nomes.get(r) ?? "").filter(Boolean).join(" e ")}
            aoLado={v.estado === "marcada" && c.podeEditar && !d.visita.fechada ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} aria-disabled={acao.aGuardar || undefined} onClick={() => { if (!acao.aGuardar) { setAMarcar(false); setARemarcar(v.id); } }}>Remarcar</Button>
                <Button type="button" variant="ghost" className={cn("min-h-11 text-muted-foreground", FOCO)} aria-disabled={acao.aGuardar || undefined} onClick={() => { if (!acao.aGuardar) cancelar(v); }}>Cancelar esta visita</Button>
                {Date.parse(v.inicio) <= Date.now() && (
                  <Button type="button" variant="ghost" className={cn("min-h-11 text-muted-foreground", FOCO)} aria-disabled={acao.aGuardar || undefined} onClick={() => { if (!acao.aGuardar) darComoFeita(v); }}>Dar como feita</Button>
                )}
              </div>
            ) : undefined}
          />
          {aRemarcar === v.id && formulario(v)}
        </div>
      ))}
      {legadas.map((n) => (
        <CartaoDaVisita
          key={`antiga-${n}`} n={visitasCrm.length + legadas.indexOf(n) + 1} tipo={`${d.f[`v${n}_tipo`] || "Visita"} (antiga, só leitura)`} estado={d.f[`v${n}_estado`] === "Feita" ? "feita" : d.f[`v${n}_estado`] === "Cancelada" ? "cancelada" : "marcada"}
          dia={d.f[`v${n}_data`] || ""} hora={d.f[`v${n}_hora`] || ""} quem={(d.f[`v${n}_quem`] || "").split(" (")[0] ?? ""}
        />
      ))}
      {(aMarcar || (semVisitas && aRemarcar === null)) ? formulario() : (
        !d.visita.fechada && c.podeEditar && aRemarcar === null && (
          <button
            type="button" onClick={() => setAMarcar(true)}
            className={cn("flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-[15px] font-medium text-primary transition-colors hover:border-primary hover:bg-primary/[0.04]", FOCO)}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />Marcar outra visita
          </button>
        )
      )}
    </div>
  );
}

/** «Quem vai estar» que o negócio da Emylia guardou para esta visita (o CRM não o devolve a este ecrã). */
function presentesDe(d: Negocio, v: VisitaDoNegocio): string {
  const n = [...marcasDoEspelho(d)].find(([, id]) => id === v.id)?.[0];
  return n === undefined ? "" : chaveDosPresentes(d.f[`v${n}_presentes`]);
}

export function VisitasDoCrm({ c, modo }: { c: ContextoDasVisitas; modo: Modo }) {
  return <ComFonteReal><Corpo c={c} modo={modo} /></ComFonteReal>;
}
