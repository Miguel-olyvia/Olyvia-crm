// «Denunciar» em «A minha área»: o MESMO assistente do formulário público, mas dentro da app. A pessoa escolhe «Anónima» ou
// «Identificada»; identificada, o nome e o email vêm da sua sessão e a denúncia fica ligada a ela. A denúncia é da
// organização ativa (nunca de uma filial ou centro).
import { useTranslation } from "@/hooks/useTranslation";
import { CabecalhoPagina } from "../comum/CabecalhoPagina";
import { LigacaoPublica } from "../comum/LigacaoPublica";
import { FormularioDenuncia } from "../formulario/FormularioDenuncia";
import type { PessoaLigada } from "../lib/pessoaLigada";

export const CAMINHO_MINHAS_DENUNCIAS = "/rh-exemplo/minhas-denuncias";

interface PaginaDenunciarProps {
  organizacaoId: string;
  organizacaoNome: string;
  pessoa: PessoaLigada;
}

/** Depois de denunciar: uma identificada acompanha-se na lista; uma anónima, só com o código e o PIN. */
const acompanharEm = (anonima: boolean): string => `${CAMINHO_MINHAS_DENUNCIAS}?aba=${anonima ? "anonimas" : "identificadas"}`;

export function PaginaDenunciar({ organizacaoId, organizacaoNome, pessoa }: PaginaDenunciarProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <CabecalhoPagina
        titulo={t("cdm.denunciar.titulo")}
        subtitulo={t("cdm.denunciar.subtitulo")}
        raiz={{ rotulo: t("sidebar.rhExemploEu"), to: "/rh-exemplo/documentos" }}
        organizacao={organizacaoNome}
        acoes={<LigacaoPublica />}
      />
      <div className="max-w-3xl">
        <FormularioDenuncia organizacaoId={organizacaoId} pessoa={pessoa} acompanharTo={acompanharEm} />
      </div>
    </div>
  );
}
