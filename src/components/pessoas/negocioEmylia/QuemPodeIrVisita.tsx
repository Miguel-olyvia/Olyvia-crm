// 4/11 (Rúben): em «Marcar a visita», primeiro a data da visita (obrigatória; sem atalhos de dia nem duração: a duração vem de «Preparar a
// visita»). Escolhida a data, aparecem os comerciais que podem ir, cada um com as horas livres que tem nesse dia. Sem nenhum comercial
// livre, sugerem-se os técnicos livres nesse dia e os próximos dias com comerciais livres. Depois, a hora. Os papéis vêm do RH
// (neg_papeis_dos_recursos, 20270106410000); sem essa função na base, «Quem vai» mostra toda a gente, como antes.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FOCO } from "@/components/negocio-metas/estilos";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FeriadosOrg, HorarioOrg } from "@/hooks/pessoas/horasLivresVisita";
import type { RecursoVisita } from "@/hooks/pessoas/useAgendaVisita";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useHorasPorRecurso } from "@/hooks/pessoas/useHorasLivresVisita";
import { cn } from "@/lib/utils";
import type { ArgsQuemEQuando } from "../CamposAgendaVisita";
import { MensagemErro } from "../CamposDataHora";
import { somarDias } from "./HorasLivresVisita";

const CHIP = "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-[15px] transition-colors motion-reduce:transition-none";
const chip = (ligado: boolean) => cn(CHIP, FOCO, ligado ? "border-primary bg-primary/10 font-medium ring-1 ring-primary" : "border-input bg-background hover:bg-accent");
const semFuncao = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";
/** Quantos dias a seguir à data se procuram comerciais livres, quando nesse dia não há nenhum. */
const DIAS_A_PROCURAR = 7;

/** Os papéis de cada recurso da agenda (do RH). null: não se sabem (a função por colar, ou um erro): mostra-se toda a gente. */
export function usePapeisDosRecursos(): Map<string, string[]> | null {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const q = useQuery({
    queryKey: ["neg-papeis-recursos", org],
    enabled: org !== null,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("neg_papeis_dos_recursos" as never, { p_org: org } as never);
      if (error) { if (semFuncao(error)) return null; throw error; }
      return new Map(((data as unknown as { resource_id: string; papeis: string[] | null }[]) ?? []).map((l) => [l.resource_id, l.papeis ?? []]));
    },
  });
  return q.data ?? null;
}

/** Os comerciais e os técnicos entre os recursos (os escolhidos ficam sempre à vista). Sem papéis conhecidos, todos são «quem vai». */
export function agruparQuemVai(recursos: readonly RecursoVisita[], papeis: ReadonlyMap<string, readonly string[]> | null, escolhidos: readonly string[]) {
  if (!papeis) return { conhecido: false, principais: [...recursos], tecnicos: [] as RecursoVisita[] };
  const tem = (r: RecursoVisita, p: string) => !!papeis.get(r.id)?.includes(p);
  const comerciais = recursos.filter((r) => tem(r, "comercial"));
  const principais = recursos.filter((r) => tem(r, "comercial") || escolhidos.includes(r.id));
  const tecnicos = recursos.filter((r) => tem(r, "tecnico") && !comerciais.includes(r));
  return { conhecido: true, principais, tecnicos, comerciais };
}

const diaPt = (dia: string) => { const [, m, d] = dia.split("-"); return `${d}/${m}`; };
const textoHoras = (h: string[] | undefined) => (h === undefined ? "a ver…" : h.length === 0 ? "sem horas livres" : h.length === 1 ? "1 hora livre" : `${h.length} horas livres`);

interface Props {
  a: ArgsQuemEQuando;
  recursos: readonly RecursoVisita[];
  duracaoMin: number;
  horario: HorarioOrg;
  feriados: FeriadosOrg;
  horarioPronto: boolean;
  excluirId: string | null;
  /** O campo da hora (as horas livres de quem se escolheu). */
  hora: ReactNode;
}

export function QuemPodeIrVisita({ a, recursos, duracaoMin, horario, feriados, horarioPronto, excluirId, hora }: Props) {
  const papeis = usePapeisDosRecursos();
  const dia = a.data;
  const g = agruparQuemVai(recursos, papeis, a.escolhidos);
  const base = { duracaoMin, horario, feriados, horarioPronto, excluirId };
  const noDia = useHorasPorRecurso({ ...base, recursos: recursos.map((r) => r.id), dias: dia ? [dia] : [], ativo: dia !== "" });
  const livresNoDia = (r: RecursoVisita) => (dia ? noDia.horas(dia, r.id) : undefined);
  const comerciais = g.conhecido ? g.comerciais ?? [] : [];
  const comerciaisLivres = comerciais.filter((r) => (livresNoDia(r)?.length ?? 0) > 0);
  const tudoLido = dia !== "" && comerciais.every((r) => livresNoDia(r) !== undefined);
  const semComercial = g.conhecido && tudoLido && comerciaisLivres.length === 0;
  const tecnicosLivres = g.tecnicos.filter((r) => (livresNoDia(r)?.length ?? 0) > 0);
  // sem comerciais livres nesse dia: os próximos dias em que há
  const proximos = useMemo(() => (dia ? Array.from({ length: DIAS_A_PROCURAR }, (_x, i) => somarDias(dia, i + 1)) : []), [dia]);
  const outros = useHorasPorRecurso({ ...base, recursos: comerciais.map((r) => r.id), dias: semComercial ? proximos : [], ativo: semComercial && comerciais.length > 0 });
  const diasComComerciais = semComercial ? proximos.filter((d) => comerciais.some((r) => (outros.horas(d, r.id)?.length ?? 0) > 0)).slice(0, 3) : [];
  // um só comercial livre nesse dia, e ninguém escolhido: fica escolhido (uma vez por data)
  const autoEm = useRef("");
  useEffect(() => {
    if (!dia || autoEm.current === dia || a.escolhidos.length > 0 || a.somenteLeitura || comerciaisLivres.length !== 1) return;
    autoEm.current = dia;
    a.aoMudarRecursos([comerciaisLivres[0].id]);
  }, [dia, a, comerciaisLivres]);

  const alternar = (id: string) => {
    if (a.somenteLeitura) return;
    a.aoMudarRecursos(a.escolhidos.includes(id) ? a.escolhidos.filter((x) => x !== id) : [...a.escolhidos, id]);
  };
  const chipDe = (r: RecursoVisita) => {
    const ligado = a.escolhidos.includes(r.id);
    return (
      <button key={r.id} type="button" aria-pressed={ligado} aria-disabled={a.somenteLeitura || undefined} onClick={() => alternar(r.id)} className={chip(ligado)}>
        {ligado && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <span>{r.name}</span>{" "}
        <span className="text-sm font-normal text-muted-foreground">· {a.ocupados.includes(r.id) ? "ocupado nesse horário" : textoHoras(livresNoDia(r))}</span>
      </button>
    );
  };
  const idData = `${a.id}-data`, idErroRec = `${a.id}-recursos-erro`;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor={idData}>Data da visita</Label>
        <Input
          ref={a.campoData} id={idData} type="date" min={a.hoje} value={dia} required readOnly={a.somenteLeitura}
          aria-invalid={a.erroData ? true : undefined} aria-describedby={a.erroData ? `${idData}-erro` : undefined}
          className={cn("min-h-11 max-w-xs", FOCO, a.erroData && "border-destructive")} onChange={(e) => a.aoMudar({ data: e.target.value })}
        />
        {a.erroData && <MensagemErro id={`${idData}-erro`} texto={a.erroData} />}
      </div>
      {!dia ? (
        <p className="text-sm text-muted-foreground">Escolha a data: a seguir aparecem os comerciais que podem ir nesse dia.</p>
      ) : (
        <>
          <fieldset ref={a.grupoRef} tabIndex={-1} aria-describedby={a.erroRecursos ? idErroRec : undefined} data-foco-erro={a.erroRecursos ? "" : undefined} className="m-0 min-w-0 space-y-2 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold text-foreground">{g.conhecido ? `Comerciais a ${diaPt(dia)}` : "Quem vai à visita"}</legend>
            {g.principais.length > 0
              ? <div className="flex flex-wrap gap-2">{g.principais.map(chipDe)}</div>
              : <p className="text-sm text-muted-foreground">Não há comerciais com agenda nesta organização.</p>}
            {a.erroRecursos && <MensagemErro id={idErroRec} texto={a.erroRecursos} />}
          </fieldset>
          {semComercial && (
            <section aria-label="Sugestões" className="space-y-3 rounded-xl border border-dashed border-border bg-muted/40 p-4">
              <p className="text-[15px] font-medium">Nenhum comercial está livre a {diaPt(dia)}.</p>
              {tecnicosLivres.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Técnicos livres nesse dia:</p>
                  <div className="flex flex-wrap gap-2">{tecnicosLivres.map(chipDe)}</div>
                </div>
              )}
              {diasComComerciais.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Ou outro dia, com comerciais livres:</p>
                  <div className="flex flex-wrap gap-2">
                    {diasComComerciais.map((d) => (
                      <button key={d} type="button" onClick={() => a.aoMudar({ data: d })} className={chip(false)}>
                        {diaPt(d)}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          · {comerciais.filter((r) => (outros.horas(d, r.id)?.length ?? 0) > 0).map((r) => r.name).join(", ")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {tecnicosLivres.length === 0 && diasComComerciais.length === 0 && !outros.aLer && (
                <p className="text-sm text-muted-foreground">Também não há técnicos livres nesse dia, nem comerciais nos próximos {DIAS_A_PROCURAR} dias. Escolha outra data.</p>
              )}
            </section>
          )}
          {(noDia.comErro || outros.comErro) && <p role="alert" className="text-sm text-foreground">Não foi possível ler as horas livres de toda a gente. Tente outra vez.</p>}
          {hora}
        </>
      )}
    </div>
  );
}
