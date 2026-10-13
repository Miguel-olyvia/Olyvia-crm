// A aba "Resumo" da ficha, em secções por esta ordem: próximo passo e prazo, avisos, contacto, origem e sobre a pessoa.
// A marca "exemplo" vai por secção.
import { ContactoFicha } from "./ContactoFicha";
import type { ResumoPessoa } from "./pessoasTipos";
import { SeccaoOrigem } from "./SeccaoOrigem";
import { SeccaoAvisos, SeccaoPasso, SeccaoSobre } from "./SeccoesResumo";

interface ResumoFichaProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** Voltou a contactar: tem submissões pendentes e ainda ninguém lhe respondeu. */
  voltou: boolean;
  podeVerSubmissoes: boolean;
  pendentes: number;
  aoVerSubmissoes: () => void;
}

export function ResumoFicha(p: ResumoFichaProps) {
  const { resumo } = p;
  return (
    <div className="space-y-6 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-4">
      <SeccaoPasso resumo={resumo} hoje={p.hoje} />
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
