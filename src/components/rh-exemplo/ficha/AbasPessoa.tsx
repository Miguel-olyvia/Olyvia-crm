// O conteúdo das três primeiras abas da ficha de RH (Visão geral, Detalhes laborais e Detalhes pessoais): os mesmos componentes
// de sempre; só o contentor mudou (painel lateral em vez de página).
import { Card, CardContent } from "@/components/ui/card";
import { PessoaLaboraisTab } from "@/components/rh-exemplo/PessoaLaboraisTab";
import { PessoaOutrosDadosCard } from "@/components/rh-exemplo/PessoaOutrosDadosCard";
import { PessoaPessoaisTab } from "@/components/rh-exemplo/PessoaPessoaisTab";
import { PessoaVisaoGeralTab } from "@/components/rh-exemplo/PessoaVisaoGeralTab";
import type { usePessoa } from "@/components/rh-exemplo/hooks/usePessoa";
import type { Pessoa } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";
import type { ContextoFicha } from "./useContextoFicha";

export interface AbaProps {
  ficha: ReturnType<typeof usePessoa>;
  pessoa: Pessoa;
  ctx: ContextoFicha;
}

export function SemAcesso() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">{t("hr.semAcesso")}</CardContent>
    </Card>
  );
}

export function AbaVisaoGeral({ ficha, pessoa, ctx, aoAbrirAba }: AbaProps & { aoAbrirAba: (aba: string) => void }) {
  return (
    <PessoaVisaoGeralTab
      pessoa={pessoa} reportaANome={ctx.reportaANome} entidadeLegalNome={ctx.entidadeLegalNome} vinculos={ficha.vinculos}
      horarioRealizado={ficha.horarioRealizado} retribuicao={ficha.retribuicao} podeVerRealizado={ctx.trabalho.podeVerRealizado}
      podeVerAusencias={ctx.podeVerAusenciasResumo} podeVerRetribuicao={ctx.trabalho.podeVerRetribuicao} onAbrirSeparador={aoAbrirAba}
    />
  );
}

export function AbaLaborais({ ficha, pessoa, ctx, aoMudarCargo }: AbaProps & { aoMudarCargo: () => void }) {
  const w = ctx.trabalho;
  if (!w.podeVerLaborais) return <SemAcesso />;
  return (
    <PessoaLaboraisTab
      pessoa={pessoa} colegas={ctx.colegas.map((c) => ({ id: c.id, nome_completo: c.nome_completo }))}
      locais={ctx.locais} locaisALoad={ctx.locaisALoad} cargos={ctx.cargos} periodosDosCargos={ctx.periodosDosCargos}
      periodosLoading={ctx.cargosPorChegar} periodosError={ctx.periodosError} podeCorrigirRetribuicao={w.podeCorrigirRetribuicao}
      podeVerRetribuicao={w.podeVerRetribuicao} podeEditarRetribuicao={w.podeEditarRetribuicao}
      temRetribuicao={ficha.retribuicao !== null} salarioActual={ctx.salarioActual} onCargoMudou={aoMudarCargo}
      entidadeLegalNome={ctx.entidadeLegalNome} estadoContratoDerivado={ctx.estadoContratoDerivado} podeEditar={w.podeEditarLaborais}
      saving={ficha.saving} onGuardar={ficha.savePessoa} vinculoActivoId={ctx.vinculoActivoId}
      podeVerAfectacoes={ctx.podeVerAfectacoesEfectivo} podeEditarAfectacoes={w.podeEditarAfectacoes}
      podeCorrigirAfectacoes={w.podeCorrigirAfectacoes} podeVerColocacao={w.podeVerColocacao}
      podeEditarColocacao={w.podeEditarColocacao} podeCorrigirColocacao={w.podeCorrigirColocacao}
    />
  );
}

export function AbaPessoais({ ficha, pessoa, ctx }: AbaProps) {
  return (
    <div className="space-y-4">
    <PessoaPessoaisTab
      pessoaId={pessoa.id} organizationId={pessoa.organization_id} dadosPessoais={ficha.dadosPessoais}
      identificacao={ficha.identificacao} morada={ficha.morada} emergencia={ficha.emergencia} bancarios={ficha.bancarios}
      saude={ficha.saude} fardamento={ficha.fardamento} emailPessoal={pessoa.email_pessoal} permissoes={ctx.permissoes}
      saving={ficha.saving} onGuardarDadosPessoais={ficha.saveDadosPessoais} onGuardarPessoa={ficha.savePessoa}
      onGuardarIdentificacao={ficha.saveIdentificacao} onGuardarMorada={ficha.saveMorada}
      onGuardarEmergencia={ficha.saveEmergencia} onGuardarSaude={ficha.saveSaude} onGuardarFardamento={ficha.saveFardamento}
      onRevelarNiss={ficha.revelarNiss} onDefinirNiss={ficha.definirNiss} onDefinirConta={ficha.definirConta}
      onDefinirBic={ficha.definirBic}
    />
    <PessoaOutrosDadosCard pessoaId={pessoa.id} />
    </div>
  );
}
