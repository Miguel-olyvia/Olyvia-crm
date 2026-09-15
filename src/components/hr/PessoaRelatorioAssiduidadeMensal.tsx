/**
 * O relatorio mensal de assiduidade de uma pessoa: cabecalho, selector de
 * mes, botao de imprimir, e o CORPO do relatorio (grelha diaria, totais,
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
 * IMPRESSAO, NAO EXPORTACAO
 * --------------------------
 * O botao "Exportar / Imprimir" chama `window.print()`. Uma folha de estilo
 * `@media print` propria esconde tudo o que nao seja o relatorio (inclusive o
 * resto do dialog) e mostra so o conteudo, em formatacao limpa -- nao gera
 * nenhum ficheiro .xlsx.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { RelatorioAssiduidadeMensalConteudo } from "@/components/hr/RelatorioAssiduidadeMensalConteudo";
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

  const [mesVisivel, setMesVisivel] = useState(() => {
    const agora = new Date();
    return { ano: agora.getFullYear(), mes: agora.getMonth() };
  });

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

  return (
    <Dialog open={aberto} onOpenChange={(valor) => !valor && onFechar()}>
      <DialogContent className="max-w-4xl print:max-w-none">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #hr-relatorio-mensal-impressao, #hr-relatorio-mensal-impressao * { visibility: visible; }
            #hr-relatorio-mensal-impressao { position: static; padding: 1.5rem; }
            .no-print { display: none !important; }
            tr { break-inside: avoid; }
          }
        `}</style>

        <DialogHeader className="no-print">
          <DialogTitle>{t("hr.relatorioMensal.titulo")}</DialogTitle>
        </DialogHeader>

        <div id="hr-relatorio-mensal-impressao">
          <RelatorioAssiduidadeMensalConteudo
            pessoaId={pessoaId}
            ano={mesVisivel.ano}
            mes={mesVisivel.mes}
            pessoaNome={pessoaNome}
            cargo={cargo}
            dataAdmissao={dataAdmissao}
            permissoes={permissoes}
            controlos={
              <div className="flex items-center justify-between no-print">
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
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="mr-2 h-4 w-4" />
                    {t("hr.relatorioMensal.imprimir")}
                  </Button>
                </div>
              </div>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
