// A aba "Resumo" da ficha, em secções por esta ordem: próxima visita (só com visita), próximo passo e prazo, avisos, contacto,
// origem e sobre a pessoa.
// A marca "exemplo" vai por secção.
import { ContactoFicha } from "./ContactoFicha";
import type { AcoesFicha } from "./PainelBase";
import type { ResumoPessoa } from "./pessoasTipos";
import { SeccaoOrigem } from "./SeccaoOrigem";
import { SeccaoAvisos, SeccaoPasso, SeccaoSobre } from "./SeccoesResumo";
import { SeccaoProximaVisita } from "./SeccaoVisita";
import { proximaVisita } from "./visitaProxima";

interface ResumoFichaProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** Voltou a contactar: tem submissões pendentes e ainda ninguém lhe respondeu. */
  voltou: boolean;
  podeVerSubmissoes: boolean;
  pendentes: number;
  aoVerSubmissoes: () => void;
  alterarVisita: AcoesFicha["alterarVisita"];
  /** "Visita concluída → Criar negócio": a página abre o painel "Novo negócio" com a visita já preenchida. */
  aoCriarNegocioDaVisita: () => void;
}

export function ResumoFicha(p: ResumoFichaProps) {
  const { resumo } = p;
  const visita = proximaVisita(resumo.pessoa, resumo.etapa, p.hoje);
  return (
    <div className="space-y-4 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-4">
      {visita && (
        <SeccaoProximaVisita
          pessoa={resumo.pessoa} visita={visita} hoje={p.hoje} alterarVisita={p.alterarVisita} aoCriarNegocio={p.aoCriarNegocioDaVisita}
        />
      )}
      <SeccaoPasso resumo={resumo} hoje={p.hoje} comVisita={visita !== null} />
      <SeccaoAvisos
        resumo={resumo} voltou={p.voltou} podeVerSubmissoes={p.podeVerSubmissoes} pendentes={p.pendentes}
        aoVerSubmissoes={p.aoVerSubmissoes}
      />
      <ContactoFicha pessoa={resumo.pessoa} />
      <SeccaoOrigem pessoa={resumo.pessoa} />
      <SeccaoSobre resumo={resumo} hoje={p.hoje} />
    </div>
  );
}
