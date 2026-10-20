// «Registar chamada» ligado à base: a agenda da visita (quadros, recursos e conflito) vem da base, por isso este ficheiro importa essa ligação e
// carrega-se à parte (só quando a ficha real abre o formulário); o exemplo e os seus testes nunca o importam.
import { somarDias } from "./acoesPessoa";
import { CorpoChamada, type PropsFormChamada } from "./FormChamada";
import { useFormAgendaVisita } from "./useFormAgendaVisita";
import { HORA_POR_DEFEITO } from "./useFormChamada";

/** A agenda da visita parte de amanhã às 10:00 (como o resto da chamada) e do recurso do responsável da pessoa. */
export function FormChamadaNaBase(props: PropsFormChamada) {
  const form = useFormAgendaVisita({
    responsavelUserId: props.acoes.responsavelUserId ?? null, inicial: { data: somarDias(props.hoje, 1), hora: HORA_POR_DEFEITO },
  });
  return <CorpoChamada {...props} agendaReal={form} />;
}
