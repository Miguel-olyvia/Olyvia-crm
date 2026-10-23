import { useTranslation } from "@/hooks/useTranslation";
import { AoMudarNegocio } from "./AoMudarNegocio";
import { BotaoPdf } from "./BotaoPdf";
import { Campo, ListaCampos } from "./CamposPainel";
import { formatarMeta } from "./formatoMetas";
import type { DetalheNegocio } from "./negocioDetalhes";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { estadoValidade, formatarData } from "./negocioPainel";

interface PropostaPainelProps {
  negocio: NegocioMes;
  detalhe: DetalheNegocio | null;
  hoje: string;
}

/** "válida até 12/11/2026" ou "expirada há 2 dias". */
function TextoValidade({ validaAte, hoje }: { validaAte: string; hoje: string }) {
  const { t } = useTranslation();
  const v = estadoValidade(validaAte, hoje);
  if (v.tipo === "valida") return <>{t("businessGoals.painel.proposal.valid", { data: formatarData(v.ate) })}</>;
  return <>{t(v.dias === 1 ? "businessGoals.painel.proposal.expiredOne" : "businessGoals.painel.proposal.expired", { dias: v.dias })}</>;
}

/**
 * O separador Proposta: o estado, o valor do orçamento escolhido, a data de envio, os orçamentos incluídos e a
 * validade. Um rascunho ainda não foi enviado, por isso não tem data nem validade.
 */
export function PropostaPainel({ negocio, detalhe, hoje }: PropostaPainelProps) {
  const { t } = useTranslation();
  const proposta = negocio.proposta;
  if (!proposta) return null;
  const d = detalhe?.proposta;
  const incluidos = negocio.orcamentos.filter((o) => d?.orcamentoIds.includes(o.id));
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <BotaoPdf documento={{ tipo: "proposta" }} negocio={negocio} detalhe={detalhe} />
      </div>
      <ListaCampos>
        <Campo rotulo={t("businessGoals.painel.proposal.state")}>{t(`businessGoals.proposal.${proposta.estado}`)}</Campo>
        <Campo rotulo={t("businessGoals.painel.proposal.value")}>{formatarMeta("euro", valorDoNegocio(negocio))}</Campo>
        {proposta.estado === "rascunho" ? (
          <Campo rotulo={t("businessGoals.painel.proposal.sentOn")}>{t("businessGoals.painel.proposal.notSent")}</Campo>
        ) : (
          <>
            {d?.enviadaEm && <Campo rotulo={t("businessGoals.painel.proposal.sentOn")}>{formatarData(d.enviadaEm)}</Campo>}
            {d?.validaAte && (
              <Campo rotulo={t("businessGoals.painel.proposal.validity")}><TextoValidade validaAte={d.validaAte} hoje={hoje} /></Campo>
            )}
          </>
        )}
        {incluidos.length > 0 && (
          <Campo rotulo={t("businessGoals.painel.proposal.quotes")}>
            {incluidos.map((o) => formatarMeta("euro", o.valor)).join(" · ")}
          </Campo>
        )}
      </ListaCampos>
      {faseDoNegocio(negocio) === "proposta" && <AoMudarNegocio negocio={negocio} />}
    </div>
  );
}
