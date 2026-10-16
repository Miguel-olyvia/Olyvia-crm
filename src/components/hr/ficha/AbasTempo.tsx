// O conteúdo das quatro últimas abas da ficha de RH (Contratos, Planeamento de tempo, Ausências e Documentos): os mesmos
// componentes de sempre, já ligados à base; só o contentor mudou.
import { PessoaAnexosCard } from "@/components/hr/PessoaAnexosCard";
import { PessoaAusenciasTab } from "@/components/hr/PessoaAusenciasTab";
import { PessoaContratoTab } from "@/components/hr/PessoaContratoTab";
import { PessoaDocumentosTab } from "@/components/hr/PessoaDocumentosTab";
import { PessoaHorarioTab } from "@/components/hr/PessoaHorarioTab";
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

/**
 * O horário e, dentro dele, a sub-aba Assiduidade. Esta precisa da pessoa, do nome, de saber se é a própria, das
 * permissões de assiduidade, do cargo e da admissão (cabeçalho do relatório mensal): sem elas a sub-aba desaparecia.
 */
export function AbaPlaneamento({ ficha, pessoa, ctx }: AbaProps) {
  const w = ctx.trabalho;
  return (
    <PessoaHorarioTab
      planeado={ficha.horarioPlaneado} realizado={ficha.horarioRealizado} locais={ctx.locais} locaisALoad={ctx.locaisALoad}
      podeVerPlaneado={w.podeVerHorario} podeEditarPlaneado={w.podeEditarHorario} podeCorrigirPlaneado={w.podeCorrigirHorario}
      podeVerRealizado={w.podeVerRealizado} saving={ficha.saving} onGuardarPlaneado={ficha.savePlaneado}
      onCorrigirPlaneado={ficha.corrigirPlaneado} horasContratadasSemanais={ctx.horasContratadasSemanais}
      pessoaId={pessoa.id} pessoaNome={pessoa.nome_completo} souAPessoa={ctx.minhaPessoaId === pessoa.id}
      permissoesAssiduidade={ctx.permissoesAssiduidade} cargo={pessoa.cargo} dataAdmissao={pessoa.data_admissao}
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
