/**
 * Ver o cartao de cidadao ou o comprovativo de IBAN DENTRO DA PAGINA: numa janela
 * por cima da ficha, e nao noutra pagina nem noutro separador.
 *
 * DECISAO DO PRODUTO: ver na pagina, ficando REGISTADO. A abertura e auditada no
 * servidor (`hr-anexo-url`); aqui nao ha confirmacao previa.
 *
 * O QUE A JANELA FAZ
 * ------------------
 * - mostra o ficheiro como imagem (`<img>`) ou como PDF (`<iframe sandbox>` com
 *   `#toolbar=0&navpanes=0`), a partir de um blob local (`useVisualizacaoAnexo`);
 * - cobre-o com uma MARCA DE AGUA com o nome de quem ve e a hora de abertura;
 * - nao tem botao de descarregar nem de imprimir, e o menu de contexto do
 *   ficheiro esta desligado;
 * - fecha sozinha ao fim de 2 minutos e, ao fechar, o URL de objecto e revogado
 *   e o ficheiro deixa de estar guardado.
 *
 * LIMITE (dito, nao escondido): isto e DISSUASAO. Num PDF nao ha forma de
 * bloquear por completo o descarregar nem a captura de ecra: o visualizador do
 * browser pode ter os seus proprios atalhos, e quem ve o ficheiro pode fotografa-lo.
 * O que fica garantido e o registo da abertura e a marca de agua com o nome.
 */
import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNomeParaMarcaDagua } from "@/hooks/useNomeParaMarcaDagua";
import { useTranslation } from "@/hooks/useTranslation";
import { useVisualizacaoAnexo } from "@/hooks/useVisualizacaoAnexo";
import type { UrlAnexo } from "@/lib/hr/anexoUrl";

interface VisualizadorAnexoSensivelProps {
  /** O anexo a ver; `null` = janela fechada. */
  anexoId: string | null;
  nomeFicheiro: string;
  /** O tipo por extenso ("Cartao de cidadao"), para o titulo. */
  rotuloTipo: string;
  obterUrl: (anexoId: string) => Promise<UrlAnexo>;
  aoFechar: () => void;
}

/** Linhas e colunas da grelha de marcas de agua que cobre a area do ficheiro. */
const MARCAS_DE_AGUA = Array.from({ length: 12 }, (_, i) => i);

export function VisualizadorAnexoSensivel({
  anexoId,
  nomeFicheiro,
  rotuloTipo,
  obterUrl,
  aoFechar,
}: VisualizadorAnexoSensivelProps) {
  const { t, language } = useTranslation();
  const nome = useNomeParaMarcaDagua();
  const estado = useVisualizacaoAnexo({ anexoId, obterUrl, aoExpirar: aoFechar });

  // A hora e a da abertura: fixa enquanto a janela esta aberta.
  const hora = useMemo(() => (anexoId ? new Date().toLocaleString(language) : ""), [anexoId, language]);
  const textoMarca = t("hr.anexos.marcaDagua", { nome, hora });
  const titulo = `${rotuloTipo}: ${nomeFicheiro}`;

  return (
    <Dialog
      open={anexoId !== null}
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar();
      }}
    >
      <DialogContent hideClose className="max-h-[92vh] gap-3 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">{titulo}</DialogTitle>
          <DialogDescription>{t("hr.anexos.visualizar.aviso")}</DialogDescription>
        </DialogHeader>

        <div
          className="relative h-[65vh] select-none overflow-hidden rounded-md border bg-muted"
          onContextMenu={(e) => e.preventDefault()}
        >
          {estado.fase === "a_carregar" && (
            <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>{t("hr.anexos.visualizar.aCarregar")}</span>
            </div>
          )}
          {estado.fase === "erro" && (
            <p role="alert" className="flex h-full items-center justify-center p-4 text-center text-sm text-destructive">
              {t("hr.anexos.erroAbrir")}
            </p>
          )}
          {estado.fase === "pronto" && estado.mime === "application/pdf" && (
            <iframe
              title={titulo}
              src={`${estado.url}#toolbar=0&navpanes=0`}
              sandbox="allow-same-origin allow-scripts"
              referrerPolicy="no-referrer"
              className="h-full w-full bg-white"
            />
          )}
          {estado.fase === "pronto" && estado.mime !== "application/pdf" && (
            <img
              src={estado.url}
              alt={titulo}
              draggable={false}
              className="h-full w-full object-contain"
            />
          )}

          {estado.fase === "pronto" && (
            <div
              data-testid="marca-dagua"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-4 place-items-center overflow-hidden"
            >
              {MARCAS_DE_AGUA.map((i) => (
                <span
                  key={i}
                  className="-rotate-[24deg] whitespace-nowrap text-sm font-semibold text-foreground/25 mix-blend-multiply"
                >
                  {textoMarca}
                </span>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar}>
            {t("hr.anexos.fechar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
