// O percurso da pessoa na ficha: Lead, Contacto, Visita, Negócio e Cliente, a seguir à barra de ações. Prepara os textos
// e os ícones e entrega-os ao `PercursoLead` de `ficha-comum`.
import { useTranslation } from "@/hooks/useTranslation";
import { PercursoLead, type PassoPercurso, type TextosPercurso } from "@/components/ficha-comum/PercursoLead";
import { ETAPAS, indiceEtapa, passoDaPerdida } from "./etapaPessoa";
import { textoDiaMes } from "./formatoPessoas";
import { ICONE_ETAPA } from "./iconesPessoa";
import type { ResumoPessoa } from "./pessoasTipos";

const P = "pessoasPagina.";

export function PercursoPessoa({ resumo }: { resumo: ResumoPessoa }) {
  const { t } = useTranslation();
  const { pessoa } = resumo;
  const passos: PassoPercurso[] = ETAPAS.map((etapa, i) => ({ chave: etapa, nome: t(`${P}journey.step${i}`), icone: ICONE_ETAPA[etapa] }));
  const textos: TextosPercurso = {
    feito: t(`${P}journey.done`), atual: t(`${P}journey.current`), porFazer: t(`${P}journey.todo`), foraAlcance: t(`${P}journey.out`),
    perdidaEm: (step) => t(`${P}journey.lostIn`, { step }), etapaAtual: (step) => t(`${P}journey.currentStage`, { step }),
  };
  const perdida = pessoa.perdida;
  return (
    <PercursoLead
      rotulo={t(`${P}journey.label`)} passos={passos} atual={indiceEtapa(resumo.etapa)} textos={textos}
      concluido={resumo.papel === "cliente"} perdidaEm={perdida ? passoDaPerdida(resumo) : null}
      resumoPerda={perdida ? t(`${P}journey.lostSummary`, { reason: t(`${P}lost.${perdida.motivo}`), date: textoDiaMes(perdida.data) }) : undefined}
    />
  );
}
