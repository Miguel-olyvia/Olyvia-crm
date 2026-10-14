import { useId, useState } from "react";
import { Download } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { FOCO } from "./estilos";
import { formatarMeta } from "./formatoMetas";
import type { DetalheNegocio } from "./negocioDetalhes";
import type { NegocioMes } from "./negocioMetas";
import { ehMinuta, montarConteudoPdf, nomeFicheiroPdf, type DocumentoPdf } from "./pdfDocumento";
import { descarregarPdf, gerarBytesPdf } from "./pdfGerar";

const P = "businessGoals.painel.pdf.";

interface BotaoPdfProps {
  documento: DocumentoPdf;
  negocio: NegocioMes;
  detalhe: DetalheNegocio | null;
}

/**
 * "Descarregar PDF" de um documento que existe. Gera um PDF de exemplo no próprio navegador (nada se grava nem sai
 * dele). O texto visível é curto; o nome acessível diz qual é o documento (e o valor, no orçamento). Numa minuta
 * (rascunho ou por assinar) a descrição, só para leitores de ecrã, diz que o PDF é uma pré-visualização. O alvo tem 44 px
 * de altura por uma área invisível, sem esticar a linha. O aviso de conclusão vive numa região viva sempre montada.
 */
export function BotaoPdf({ documento, negocio, detalhe }: BotaoPdfProps) {
  const { t } = useTranslation();
  const idMinuta = useId();
  const [aviso, setAviso] = useState<{ n: number; texto: string }>({ n: 0, texto: "" });
  const minuta = ehMinuta(documento, negocio, detalhe);
  // "Descarregar PDF do orçamento de €8.600", "… da proposta", "… do contrato" (só o orçamento usa o valor).
  const valor = documento.tipo === "orcamento" ? formatarMeta("euro", documento.orcamento.valor) : "";
  const rotulo = t(`${P}${documento.tipo}.label`, { valor });

  const anunciar = (texto: string) => setAviso((a) => ({ n: a.n + 1, texto }));
  const descarregar = async () => {
    try {
      const bytes = await gerarBytesPdf(montarConteudoPdf(documento, negocio, detalhe, t));
      descarregarPdf(bytes, nomeFicheiroPdf(documento, negocio));
      anunciar(t(`${P}done`));
    } catch {
      toast.error(t(`${P}error`));
      anunciar(t(`${P}error`));
    }
  };

  return (
    <>
      <Button
        type="button" variant="outline" size="sm" aria-label={rotulo} aria-describedby={minuta ? idMinuta : undefined}
        onClick={descarregar}
        className={cn("relative shrink-0 gap-1.5 after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']", FOCO)}
      >
        <Download aria-hidden="true" />
        {t(`${P}button`)}
      </Button>
      {minuta && <span id={idMinuta} className="sr-only">{t(`${P}draft`)}</span>}
      <span role="status" className="sr-only"><span key={aviso.n}>{aviso.texto}</span></span>
    </>
  );
}
