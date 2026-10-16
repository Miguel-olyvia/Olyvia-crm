/**
 * O resto da revisao, so de consulta: os documentos que a pessoa carregou, a ultima devolucao (comentarios por campo,
 * documentos pedidos e observacao) e o que ainda falta para a admissao ficar completa.
 *
 * Abrir os ficheiros (`hr-anexo-url`, alargada a anexos `ligado`) e da V3b: aqui so se listam, e di-lo.
 */
import { rotuloDeCampoAdmissao } from "@/components/hr/rotuloCampoAdmissao";
import { useTranslation } from "@/hooks/useTranslation";
import type { Pendencia } from "@/hooks/useAdmissaoPendencias";
import { formatarDataHora } from "@/lib/hr/conviteAdmissaoEcra";
import type { AnexoRevisao, DevolucaoRevisao } from "@/lib/hr/admissaoRevisao";

/** Os tres tipos de anexo da admissao e a chave do seu nome (as que o convite ja usa). */
const CHAVE_DO_TIPO: Readonly<Record<string, string>> = {
  cartao_cidadao: "hr.convite.anexos.cartaoCidadao",
  comprovativo_iban: "hr.convite.anexos.comprovativoIban",
  fotografia: "hr.convite.anexos.fotografia",
};

function useNomeDoTipo(): (tipo: string) => string {
  const { t } = useTranslation();
  return (tipo) => t(CHAVE_DO_TIPO[tipo] ?? "rhAdm.revisao.anexoOutro");
}

export function RevisaoAnexos({ anexos }: { anexos: readonly AnexoRevisao[] }) {
  const { t } = useTranslation();
  const nomeDoTipo = useNomeDoTipo();
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t("rhAdm.revisao.anexos")}</h3>
      {anexos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rhAdm.revisao.anexosVazio")}</p>
      ) : (
        <ul className="divide-y rounded-md border px-3">
          {anexos.map((anexo, i) => (
            <li key={anexo.id ?? `oculto-${i}`} className="py-2 text-sm">
              {anexo.visivel
                ? t("rhAdm.revisao.anexoDe", { tipo: nomeDoTipo(anexo.tipo), data: formatarDataHora(anexo.criadoEm) })
                : t("rhAdm.revisao.anexoOculto", { tipo: nomeDoTipo(anexo.tipo) })}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("rhAdm.revisao.anexosNota")}</p>
    </section>
  );
}

export function RevisaoDevolucao({ devolucao }: { devolucao: DevolucaoRevisao }) {
  const { t } = useTranslation();
  const nomeDoTipo = useNomeDoTipo();
  const comentarios = Object.entries(devolucao.campos);
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t("rhAdm.revisao.devolucao")}</h3>
      <div className="space-y-1 text-sm">
        {comentarios.length > 0 && (
          <ul className="list-disc pl-5">
            {comentarios.map(([chave, comentario]) => (
              <li key={chave}>
                <span className="font-medium">{rotuloDeCampoAdmissao(t, chave)}:</span>{" "}
                {comentario ?? t("rhAdm.revisao.campoOculto")}
              </li>
            ))}
          </ul>
        )}
        {devolucao.documentos.length > 0 && (
          <p>{t("rhAdm.revisao.devolucaoDocumentos", { lista: devolucao.documentos.map(nomeDoTipo).join(", ") })}</p>
        )}
        {devolucao.observacao && <p>{t("rhAdm.revisao.devolucaoObservacao", { texto: devolucao.observacao })}</p>}
      </div>
    </section>
  );
}

export function RevisaoPendencias({ pendencias }: { pendencias: readonly Pendencia[] }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t("rhAdm.revisao.pendencias")}</h3>
      {pendencias.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rhAdm.revisao.pendenciasVazio")}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {pendencias.map((p) => (
            <li key={`${p.origem}-${p.codigo}`} className="rounded-full border px-2.5 py-0.5 text-xs">
              {rotuloDeCampoAdmissao(t, p.codigo)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
