/**
 * Agenda de obra (28/10/2026): as tarefas de obra desta pessoa nas proximas
 * semanas, como ficaram no plano da obra do negocio (/negocios). Obra, numero
 * do negocio, morada, dias e horas por dia; e os dias em que esta indisponivel
 * (ausencias aprovadas, sem o tipo).
 *
 * Le pela RPC rh_agenda_tecnicos (migration 20261231999000), que pede
 * `pessoas.view` ou `hr.pessoas.laborais.view`. A atribuicao faz-se no plano da
 * obra, no negocio: aqui so se ve. Quem nao e tecnico de obra nem tem tarefas
 * nao ve o cartao. Numa base sem a funcao, o cartao nao aparece.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { hrRpc } from "@/lib/hr/hrDb";

export interface TarefaAgenda {
  tarefa_id: string;
  nome: string;
  oficio: string | null;
  inicio: string;
  fim: string;
  estado: string;
  horas_dia: number;
  obra_codigo: string;
  obra_titulo: string;
  morada: string | null;
  negocio_numero: number | null;
}

export interface PessoaAgenda {
  pessoa_id: string;
  nome: string;
  oficios: string[];
  tarefas: TarefaAgenda[];
  indisponivel: { data: string; fraccao: number }[];
}

interface PessoaAgendaObraCardProps {
  pessoaId: string;
  organizationId: string;
  /** Quantos dias para a frente (por omissao, 60). */
  dias?: number;
  /** Para os testes: o dia de hoje. */
  hoje?: Date;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dataCurta = (s: string) => {
  const [a, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });
};
const horas = (h: number) => h.toLocaleString("pt-PT", { maximumFractionDigits: 1 });

export function PessoaAgendaObraCard({ pessoaId, organizationId, dias = 60, hoje }: PessoaAgendaObraCardProps) {
  const { t } = useTranslation();
  const [agenda, setAgenda] = useState<PessoaAgenda | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const de = iso(hoje ?? new Date());
  const ate = iso(new Date((hoje ?? new Date()).getTime() + dias * 86_400_000));

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await hrRpc("rh_agenda_tecnicos", { p_org: organizationId, p_de: de, p_ate: ate });
      if (!vivo) return;
      if (error) {
        // base sem a funcao (migration por aplicar): sem cartao
        if (error.code === "PGRST202" || error.code === "42883") setAgenda(null);
        else setErro(error.message ?? "");
        return;
      }
      setAgenda(((data as PessoaAgenda[] | null) ?? []).find((p) => p.pessoa_id === pessoaId) ?? null);
    })();
    return () => {
      vivo = false;
    };
  }, [organizationId, pessoaId, de, ate]);

  if (agenda === null) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {t("hr.agendaObra.titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {erro !== null && <p className="text-sm text-destructive">{erro || t("hr.agendaObra.erroLer")}</p>}
        {agenda === undefined && erro === null && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {agenda && !agenda.tarefas.length && (
          <p className="text-sm text-muted-foreground">{t("hr.agendaObra.semTarefas", { dias: String(dias) })}</p>
        )}
        {agenda && agenda.tarefas.length > 0 && (
          <ul className="divide-y divide-border">
            {agenda.tarefas.map((x) => (
              <li key={x.tarefa_id} className="py-2 text-sm">
                <div className="font-medium">
                  {x.nome}
                  {x.oficio && <span className="ml-1 font-normal text-muted-foreground">· {x.oficio}</span>}
                </div>
                <div className="text-muted-foreground">
                  {x.inicio === x.fim ? dataCurta(x.inicio) : `${dataCurta(x.inicio)} – ${dataCurta(x.fim)}`}
                  {" · "}
                  {t("hr.agendaObra.horasDia", { horas: horas(Number(x.horas_dia)) })}
                </div>
                <div className="text-muted-foreground">
                  {x.negocio_numero != null ? `#${x.negocio_numero} · ` : ""}
                  {x.obra_titulo}
                  {x.morada ? ` · ${x.morada}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
        {agenda && agenda.indisponivel.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("hr.agendaObra.indisponivel", { dias: agenda.indisponivel.map((a) => dataCurta(a.data)).join(", ") })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("hr.agendaObra.ajuda")}</p>
      </CardContent>
    </Card>
  );
}
