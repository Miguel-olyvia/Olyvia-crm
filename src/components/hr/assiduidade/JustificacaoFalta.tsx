/**
 * O documento da falta: dado de saude, tratado como tal.
 *
 * DUAS PERMISSOES, DUAS COISAS DIFERENTES
 * ---------------------------------------
 * Quem tem `hr.assiduidade.faltas.view` ve que a falta existe, o motivo
 * codificado e o ESTADO da justificacao -- sem justificacao, a espera de
 * documento, justificada, recusada. Nao ve o documento. Ler o documento e
 * `hr.assiduidade.justificacao.view`, que e permissao autonoma e perigosa: a
 * chefia nao a tem por ser chefia, e aprovar seja o que for nao a da.
 *
 * O ACESSO FICA REGISTADO, E DIZ-SE
 * ---------------------------------
 * `rpc_hr_falta_ver_justificacao` escreve a revelacao em
 * `pessoas_acessos_sensiveis` ANTES de devolver -- exactamente como o NISS e o
 * IBAN. Por isso: nunca se chama ao carregar o ecra, chama-se ao clique, o
 * valor revelado nao sobrevive ao fecho do painel, e nao se pre-carrega para
 * "ficar mais rapido". A frase por cima do botao diz que o acesso fica
 * registado, porque quem clica tem direito a saber isso antes de clicar.
 *
 * QUEM NAO TEM A PERMISSAO NAO VE UM BOTAO DESACTIVADO: o bloco nao se desenha.
 * Um botao bloqueado diz na mesma que ha um documento, e as vezes isso ja e de
 * mais.
 *
 * A RPC devolve o NOME do ficheiro e nunca o caminho. Nao se constroi URL
 * nenhuma e nao se tenta descarregar do bucket -- a politica de leitura do
 * storage nem sequer tem ramo de ficha-propria.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import type { EstadoJustificacao, JustificacaoFaltaRevelada } from "@/types/hrAssiduidade";

interface JustificacaoFaltaProps {
  faltaId: string;
  estado: EstadoJustificacao;
  decididaEm: string | null;
  decididaPorNome: string | null;
  motivoDaDecisao: string | null;
  podeVerDocumento: boolean;
  podeDecidir: boolean;
  aGravar: boolean;
  onRevelar: (faltaId: string) => Promise<JustificacaoFaltaRevelada[]>;
  onDecidir: (resultado: "justificada" | "recusada") => void;
}

export function JustificacaoFalta({
  faltaId,
  estado,
  decididaEm,
  decididaPorNome,
  motivoDaDecisao,
  podeVerDocumento,
  podeDecidir,
  aGravar,
  onRevelar,
  onDecidir,
}: JustificacaoFaltaProps) {
  const { t } = useTranslation();
  const [reveladas, setReveladas] = useState<JustificacaoFaltaRevelada[] | null>(null);
  const [aRevelar, setARevelar] = useState(false);

  const revelar = async () => {
    setARevelar(true);
    try {
      setReveladas(await onRevelar(faltaId));
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    } finally {
      setARevelar(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={estado === "recusada" ? "destructive" : "outline"} className="font-normal">
          {t(`hr.assiduidade.justificacao.estado.${estado}`)}
        </Badge>
        {decididaEm && (
          <span className="text-xs text-muted-foreground">
            {t("hr.assiduidade.justificacao.decididaPor", {
              autor: decididaPorNome ?? t("hr.assiduidade.historico.autorDesconhecido"),
              quando: decididaEm.slice(0, 10),
            })}
          </span>
        )}
      </div>

      {motivoDaDecisao && <p className="text-xs">{motivoDaDecisao}</p>}

      {podeVerDocumento && estado !== "sem_justificacao" && (
        <div className="space-y-2">
          {reveladas === null ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t("hr.assiduidade.justificacao.acessoRegistado")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={aRevelar}
                onClick={() => void revelar()}
              >
                {aRevelar ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("hr.assiduidade.justificacao.ver")}
              </Button>
            </>
          ) : reveladas.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("hr.assiduidade.justificacao.semDocumentos")}
            </p>
          ) : (
            <ul className="space-y-2">
              {reveladas.map((documento) => (
                <li key={documento.id} className="rounded-md bg-muted/50 p-2 text-xs">
                  {documento.tipo_documento && (
                    <p className="font-medium">
                      {t(`hr.assiduidade.tipoDocumento.${documento.tipo_documento}`)}
                    </p>
                  )}
                  {documento.documento_ref && (
                    <p>
                      {t("hr.assiduidade.campo.documentoRef")}: {documento.documento_ref}
                    </p>
                  )}
                  {documento.entidade_emissora && <p>{documento.entidade_emissora}</p>}
                  {documento.data_documento && <p className="tabular-nums">{documento.data_documento}</p>}
                  {documento.dias_atestados !== null && (
                    <p>
                      {t("hr.assiduidade.campo.diasAtestados")}: {documento.dias_atestados}
                    </p>
                  )}
                  {documento.texto && <p className="mt-1 whitespace-pre-wrap">{documento.texto}</p>}
                  {documento.ficheiro_nome && (
                    <p className="mt-1 text-muted-foreground">
                      {documento.ficheiro_nome}
                      {documento.ficheiro_bytes
                        ? ` · ${Math.round(documento.ficheiro_bytes / 1024)} kB`
                        : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {podeDecidir && estado === "pendente_documento" && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" disabled={aGravar} onClick={() => onDecidir("justificada")}>
            {t("hr.assiduidade.justificacao.aceitar")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={aGravar}
            onClick={() => onDecidir("recusada")}
          >
            {t("hr.assiduidade.justificacao.recusar")}
          </Button>
        </div>
      )}
    </div>
  );
}
