/**
 * O relatório mensal de assiduidade de uma pessoa, na apresentação: ao abrir, gera um PDF simples com a grelha do
 * mês (planeado, realizado e estado de cada dia) e abre-o noutro separador. Sem janela própria: o PDF é gerado
 * no navegador, com os dados de exemplo, e não vai para lado nenhum.
 */
import { useEffect, useRef } from "react";
import { useRelatorioAssiduidadeMensal } from "@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal";
import { formatarDuracao } from "@/components/rh-exemplo/lib/assiduidade";
import { gerarPdfRelatorioMensal } from "@/components/rh-exemplo/lib/relatorioPdf";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  pessoaId: string;
  pessoaNome: string;
  cargo?: string | null;
  dataAdmissao?: string | null;
  permissoes: PermissoesAssiduidade;
}

export function PessoaRelatorioAssiduidadeMensal({ aberto, onFechar, pessoaId, pessoaNome, cargo, dataAdmissao }: Props) {
  const { t, language } = useTranslation();
  const hoje = new Date();
  const relatorio = useRelatorioAssiduidadeMensal(pessoaId, hoje.getFullYear(), hoje.getMonth());
  const emCurso = useRef(false);

  useEffect(() => {
    if (!aberto || emCurso.current) return;
    emCurso.current = true;
    const nomeDoMes = new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(hoje);
    const linhas = relatorio.dias.map(
      (dia) =>
        `${dia.iso}   ${t(`rhExemplo.relatorio.estado.${dia.estado}`)}   ${t("rhExemplo.relatorio.planeado")} ${formatarDuracao(dia.planeadoMinutos)}   ${t("rhExemplo.relatorio.realizado")} ${formatarDuracao(dia.realizadoMinutos)}`,
    );
    const subtitulo = [pessoaNome, cargo, dataAdmissao].filter(Boolean).join(" · ");
    void gerarPdfRelatorioMensal({ titulo: `${t("rhExemplo.relatorio.titulo")} — ${nomeDoMes}`, subtitulo, linhas })
      .then((bytes) => {
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        window.open(url, "_blank", "noopener");
      })
      .catch(() => toast.error(t("rhExemplo.relatorio.erro")))
      .finally(() => {
        emCurso.current = false;
        onFechar();
      });
    // Corre uma vez por abertura: `aberto` é o único gatilho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  return null;
}
