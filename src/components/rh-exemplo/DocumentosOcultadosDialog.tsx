/**
 * Os documentos ocultados de uma pessoa, com «Repor». So para quem tem hr.pessoas.documentos.repor (quem chama decide se o mostra).
 *
 * So descritivos: titulo, tipo, estado, quem ocultou, quando e porque. NUNCA o texto nem o ficheiro -- para os ver, repoe-se
 * primeiro (`rpc_hr_documentos_ocultados` nem os devolve). Repor pede um motivo, como ocultar e anular.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { DocumentoMotivoDialog } from "@/components/rh-exemplo/DocumentoMotivoDialog";
import type { AccaoComMotivoDocumento, DocumentoOcultado } from "@/hooks/usePessoaDocumentos";

interface DocumentosOcultadosDialogProps {
  aberto: boolean;
  onFechar: () => void;
  listarOcultados: () => Promise<{ documentos: DocumentoOcultado[]; erro: string | null }>;
  repor: AccaoComMotivoDocumento;
  /** Chamado depois de repor um documento, para quem chama actualizar a lista e a contagem. */
  onAlterado: () => void;
}

function formatarData(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export function DocumentosOcultadosDialog({ aberto, onFechar, listarOcultados, repor, onAlterado }: DocumentosOcultadosDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const [itens, setItens] = useState<DocumentoOcultado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  // Comeca a true: ao abrir nunca se mostra «nao ha ocultados» antes de a lista chegar.
  const [aCarregar, setACarregar] = useState(true);
  const [aRepor, setARepor] = useState<DocumentoOcultado | null>(null);
  // O botao que abriu o dialogo do motivo: o foco volta-lhe quando o dialogo fecha (aRepor ja e null nessa altura).
  const ultimoRepostoId = useRef<string | null>(null);
  // So a leitura mais recente conta: respostas fora de ordem (ou depois de fechar) sao ignoradas.
  const ultimaLeitura = useRef(0);

  const carregar = useCallback(async () => {
    const leitura = ++ultimaLeitura.current;
    setACarregar(true);
    const resposta = await listarOcultados();
    if (leitura !== ultimaLeitura.current) return;
    setItens(resposta.documentos);
    setErro(resposta.erro);
    setACarregar(false);
  }, [listarOcultados]);

  useEffect(() => {
    if (aberto) void carregar();
    else {
      // Nada fica em estado depois de fechar (e uma leitura ainda a caminho deixa de contar).
      ultimaLeitura.current++;
      setACarregar(true);
      setItens([]);
      setErro(null);
      setARepor(null);
    }
  }, [aberto, carregar]);

  const confirmarRepor = async (motivo: string): Promise<string | null> => {
    if (!aRepor) return null;
    const resultado = await repor(aRepor.documento_id, motivo);
    if (resultado === null) {
      toast.success(t("hr.documentos.repor.sucesso"));
      onAlterado();
      void carregar();
    }
    return resultado;
  };

  const idTitulo = `${id}-titulo`;

  return (
    <>
      <Dialog open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle id={idTitulo} tabIndex={-1}>{t("hr.documentos.ocultadosTitulo")}</DialogTitle>
            <DialogDescription>{t("hr.documentos.ocultadosDescricao")}</DialogDescription>
          </DialogHeader>

          {erro && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {erro}
            </p>
          )}

          {aCarregar ? (
            <OlyviaLoader />
          ) : itens.length === 0 && !erro ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("hr.documentos.ocultadosVazio")}</p>
          ) : (
            <ul className="space-y-3">
              {itens.map((item) => (
                <li key={item.documento_id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{item.titulo}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{t(`hr.tipoDocumentoRH.${item.tipo}`)}</span>
                      <Badge variant="outline" className="font-normal">
                        {t(`hr.estadoDocumentoRH.${item.estado}`)}
                      </Badge>
                      {item.tem_ficheiro && <span>{t("hr.documentos.comFicheiro")}</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.ocultado_por_nome
                        ? t("hr.documentos.ocultadoPor", {
                            data: formatarData(item.ocultado_em),
                            nome: item.ocultado_por_nome,
                            motivo: item.ocultado_motivo ?? "—",
                          })
                        : t("hr.documentos.ocultadoSemAutor", {
                            data: formatarData(item.ocultado_em),
                            motivo: item.ocultado_motivo ?? "—",
                          })}
                    </p>
                  </div>
                  <Button
                    id={`${id}-repor-${item.documento_id}`}
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      ultimoRepostoId.current = item.documento_id;
                      setARepor(item);
                    }}
                  >
                    {t("hr.documentos.repor")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <DocumentoMotivoDialog
        aberto={aRepor !== null}
        titulo={t("hr.documentos.repor.titulo")}
        descricao={t("hr.documentos.repor.descricao", { titulo: aRepor?.titulo ?? "" })}
        rotuloConfirmar={t("hr.documentos.repor.confirmar")}
        onConfirmar={confirmarRepor}
        onFechar={() => setARepor(null)}
        devolverFoco={() =>
          (ultimoRepostoId.current && document.getElementById(`${id}-repor-${ultimoRepostoId.current}`)) ||
          document.getElementById(idTitulo)
        }
      />
    </>
  );
}
