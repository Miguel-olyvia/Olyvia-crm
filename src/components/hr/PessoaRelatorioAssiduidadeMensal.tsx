/**
 * O relatorio mensal de assiduidade de uma pessoa: cabecalho, selector de
 * mes, botao de exportar, e o CORPO do relatorio (grelha diaria, totais,
 * obras) vindo de `RelatorioAssiduidadeMensalConteudo` -- a mesma grelha
 * usada, uma instancia por pessoa, no relatorio em massa
 * `RelatorioAssiduidadeMensalOrganizacao`. Nao duplicar essa grelha aqui.
 *
 * NAO E UMA COPIA DO EXCEL DO KAIROS
 * -----------------------------------
 * A referencia tem as tres fontes fundidas em colunas soltas ("Marcacoes",
 * "H.Trab") e nenhum lugar para obra. Aqui as tres colunas -- Planeado,
 * Realizado, Obra -- ficam sempre distintas, e a obra tem seccao propria logo
 * a seguir a grelha. O rodape so replica conceitos que ja existem no Olyvia
 * (dias trabalhados, faltas): nao ha "saldo de compensacao" nem "banco de
 * horas", que este produto nao tem.
 *
 * EXPORTACAO REAL, NAO IMPRESSAO
 * --------------------------------
 * O botao "Exportar" gera um PDF verdadeiro com `@react-pdf/renderer`
 * (`generateRelatorioAssiduidadeMensalPdfBlob`, mesmo padrao de
 * `generateQuotePdfBlob`) e descarrega-o directamente -- nao abre o dialogo
 * de impressao do browser. Os dados (`dias`/`totais`/`obras`) chegam via
 * `aoObterDados`, que `RelatorioAssiduidadeMensalConteudo` ja calcula.
 */
import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "@/lib/toast";
import {
  RelatorioAssiduidadeMensalConteudo,
  type DadosRelatorioAssiduidadeMensal,
} from "@/components/hr/RelatorioAssiduidadeMensalConteudo";
import { generateRelatorioAssiduidadeMensalPdfBlob } from "@/utils/generateRelatorioAssiduidadeMensalPdfBlob";
import type { PermissoesAssiduidade } from "@/types/hrAssiduidade";

interface PessoaRelatorioAssiduidadeMensalProps {
  aberto: boolean;
  onFechar: () => void;
  pessoaId: string;
  pessoaNome: string;
  /** "Categoria profissional" do cabecalho -- `pessoas.cargo`, ja existente na ficha. */
  cargo?: string | null;
  dataAdmissao?: string | null;
  permissoes: PermissoesAssiduidade;
}

export function PessoaRelatorioAssiduidadeMensal({
  aberto,
  onFechar,
  pessoaId,
  pessoaNome,
  cargo,
  dataAdmissao,
  permissoes,
}: PessoaRelatorioAssiduidadeMensalProps) {
  const { t, language } = useTranslation();
  const { activeCompany } = useCompany();

  const [mesVisivel, setMesVisivel] = useState(() => {
    const agora = new Date();
    return { ano: agora.getFullYear(), mes: agora.getMonth() };
  });
  const [aExportar, setAExportar] = useState(false);
  const dadosRef = useRef<DadosRelatorioAssiduidadeMensal | null>(null);

  const nomeDoMes = useMemo(
    () =>
      new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(
        new Date(mesVisivel.ano, mesVisivel.mes, 1),
      ),
    [language, mesVisivel],
  );

  const mudarMes = (passo: number) =>
    setMesVisivel(({ ano, mes }) => {
      const proximo = new Date(ano, mes + passo, 1);
      return { ano: proximo.getFullYear(), mes: proximo.getMonth() };
    });

  const exportar = async () => {
    if (!dadosRef.current || aExportar) return;
    setAExportar(true);
    try {
      const { blob, fileName } = await generateRelatorioAssiduidadeMensalPdfBlob({
        organizacaoNome: activeCompany?.name,
        pessoaNome,
        cargo,
        dataAdmissao,
        ano: mesVisivel.ano,
        mes: mesVisivel.mes,
        dias: dadosRef.current.dias,
        totais: dadosRef.current.totais,
        obras: dadosRef.current.obras,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (erro) {
      toast.error(t("hr.relatorioMensal.exportarErro"));
    } finally {
      setAExportar(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(valor) => !valor && onFechar()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("hr.relatorioMensal.titulo")}</DialogTitle>
        </DialogHeader>

        <RelatorioAssiduidadeMensalConteudo
          pessoaId={pessoaId}
          ano={mesVisivel.ano}
          mes={mesVisivel.mes}
          pessoaNome={pessoaNome}
          cargo={cargo}
          dataAdmissao={dataAdmissao}
          permissoes={permissoes}
          aoObterDados={(dados) => {
            dadosRef.current = dados;
          }}
          controlos={
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium capitalize">{nomeDoMes}</h2>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("hr.assiduidade.mesAnterior")}
                  onClick={() => mudarMes(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("hr.assiduidade.mesSeguinte")}
                  onClick={() => mudarMes(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={exportar} disabled={aExportar}>
                  {aExportar ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {t("hr.relatorioMensal.exportar")}
                </Button>
              </div>
            </div>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
