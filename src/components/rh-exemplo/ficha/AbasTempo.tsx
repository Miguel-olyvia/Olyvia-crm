// O conteúdo das quatro últimas abas da ficha de RH (Contratos, Planeamento de tempo, Ausências e Documentos): os mesmos
// componentes de sempre; só o contentor mudou.
import { PessoaAnexosCard } from "@/components/rh-exemplo/PessoaAnexosCard";
import { PessoaAusenciasTab } from "@/components/rh-exemplo/PessoaAusenciasTab";
import { PessoaContratoTab } from "@/components/rh-exemplo/PessoaContratoTab";
import { PessoaDocumentosTab } from "@/components/rh-exemplo/PessoaDocumentosTab";
import { PessoaHorarioTab } from "@/components/rh-exemplo/PessoaHorarioTab";
import { PortalColaboradorRh } from "@/components/rh-exemplo/portal/PortalColaboradorRh";
import { SemAcesso, type AbaProps } from "./AbasPessoa";

export function AbaContratos({ ficha, pessoa, ctx }: AbaProps) {
  const w = ctx.trabalho;
  if (!w.podeVerVinculos) return <SemAcesso />;
  const recarregar = () => void ficha.refresh();
  return (
    <PessoaContratoTab
      pessoaId={pessoa.id} organizationId={pessoa.organization_id} vinculos={ficha.vinculos} retribuicao={ficha.retribuicao}
      podeEditar={w.podeEditarVinculos} podeVerRetribuicao={w.podeVerRetribuicao} podeEditarRetribuicao={w.podeEditarRetribuicao}
      podeCorrigirRetribuicao={w.podeCorrigirRetribuicao} cargo={ctx.cargos.find((c) => c.id === pessoa.cargo_id) ?? null}
      periodosDosCargos={ctx.periodosDosCargos} periodosLoading={ctx.cargosPorChegar} periodosError={ctx.periodosError}
      onRetribuicaoMudou={recarregar} onContratoMudou={recarregar} podeCorrigirHoras={w.podeCorrigirHorasVinculo}
      podeAnexarContratoAssinado={ctx.permissoesDocumentos.emitir} vinculosOpcoesDocumento={ctx.vinculosOpcoesDocumento}
      saving={ficha.saving} onGuardarVinculo={ficha.saveVinculo}
    />
  );
}

export function AbaPlaneamento({ ficha, ctx }: AbaProps) {
  const w = ctx.trabalho;
  return (
    <PessoaHorarioTab
      planeado={ficha.horarioPlaneado} realizado={ficha.horarioRealizado} locais={ctx.locais} locaisALoad={ctx.locaisALoad}
      podeVerPlaneado={w.podeVerHorario} podeEditarPlaneado={w.podeEditarHorario} podeCorrigirPlaneado={w.podeCorrigirHorario}
      podeVerRealizado={w.podeVerRealizado} saving={ficha.saving} onGuardarPlaneado={ficha.savePlaneado}
      onCorrigirPlaneado={ficha.corrigirPlaneado} horasContratadasSemanais={ctx.horasContratadasSemanais}
    />
  );
}

export function AbaAusencias({ pessoa, ctx }: AbaProps) {
  return (
    <PessoaAusenciasTab
      pessoaId={pessoa.id} pessoaNome={pessoa.nome_completo} souAPessoa={ctx.minhaPessoaId === pessoa.id}
      aprovadorChefiaNome={ctx.reportaANome} nomePorPessoaId={ctx.nomePorPessoaId} permissoes={ctx.permissoesAusencias}
    />
  );
}

/** Os anexos são irmãos do separador de documentos, e não filhos: este devolve "sem acesso" a quem não tem permissões de documentos. */
export function AbaDocumentos({ ficha, pessoa, ctx }: AbaProps) {
  const souAPessoa = ctx.minhaPessoaId === pessoa.id;
  return (
    <div className="space-y-6">
      <PortalColaboradorRh pessoaId={pessoa.id} />
      <PessoaAnexosCard
        pessoaId={pessoa.id} organizationId={pessoa.organization_id} souAPessoa={souAPessoa && ctx.hasPermission("hr.pessoas.view.own")}
        permissoes={ctx.permissoesAnexos} permissoesEscrita={ctx.permissoesEscritaAnexos}
        onFotografiaAlterada={() => void ficha.refresh()}
      />
      <PessoaDocumentosTab
        pessoaId={pessoa.id} organizationId={pessoa.organization_id} souAPessoa={souAPessoa}
        permissoes={ctx.permissoesDocumentos} vinculosOpcoes={ctx.vinculosOpcoesDocumento}
      />
    </div>
  );
}
