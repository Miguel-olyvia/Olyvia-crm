/**
 * Organização (RH de exemplo), num só organograma: Grupo > Empresas (entidades legais) > Filiais > Centros de trabalho >
 * PESSOAS. As pessoas estão debaixo do centro onde trabalham (a chefia primeiro, os subordinados por baixo, com «Reporta a»),
 * e quem tem vínculo legal mas ainda não tem centro fica em «Sem centro atribuído». Daqui liga-se, altera-se e desliga-se a
 * pessoa (vínculo legal = empresa e filial; local de trabalho = o centro, que pode ser de outra filial). Clicar numa pessoa
 * abre a ficha de RH; clicar num nó abre o painel do nó. Ligado à base: filiais (árvore da organização), centros (locais de
 * trabalho), NIF, morada e hierarquia das filiais, e colocação das pessoas no organograma.
 *
 * Os endereços antigos `?vista=chefias` e `?vista=estrutura` (a página já teve duas abas) voltam à página sem parâmetro.
 */
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { ArvoreOrganizacao } from "@/components/rh-exemplo/organizacao/ArvoreOrganizacao";
import { BarraOrganizacao } from "@/components/rh-exemplo/organizacao/BarraOrganizacao";
import { DesligarDialogo } from "@/components/rh-exemplo/organizacao/DesligarDialogo";
import { FormularioLigacao } from "@/components/rh-exemplo/organizacao/FormularioLigacao";
import { LegendaOrganizacao } from "@/components/rh-exemplo/organizacao/LegendaOrganizacao";
import { PainelNo } from "@/components/rh-exemplo/organizacao/PainelNo";
import { usePaginaOrganizacao } from "@/components/rh-exemplo/organizacao/usePaginaOrganizacao";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";

const ORGANIZACAO_URL = "/rh-exemplo/organizacao";

function PaginaOrganizacao() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const p = usePaginaOrganizacao();
  const { hasPermission } = usePermissions();
  // Ligar, Alterar e Desligar escrevem a colocação: pedem `hr.pessoas.colocacao.edit` (a RLS recusaria o resto).
  const podeAlterar = hasPermission("hr.pessoas.colocacao.edit");
  const botaoLigar = !podeAlterar ? null : (
    <Button type="button" className="min-h-11 gap-1.5" onClick={() => p.abrirForm(null)}>
      <UserPlus className="h-4 w-4" aria-hidden="true" />
      {t("rhOrg.ligarPessoa")}
    </Button>
  );
  return (
    <div className="space-y-5 p-6">
      <CabecalhoPagina
        titulo={t("rhOrg.titulo")} subtitulo={t("rhOrg.sub")} aviso={null}
        pai={{ to: "/rh-exemplo/pessoas", texto: t("rhOrg.pai") }} acoes={botaoLigar}
      />
      <div className="space-y-5">
        <p role="note" className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">{t("rhOrg.ajuda")}</p>
        <LegendaOrganizacao />
        <BarraOrganizacao termo={p.termo} aoPesquisar={p.setTermo} aoExpandir={p.expandirTudo} aoRecolher={p.recolherTudo} />
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{p.aviso}</p>
        {p.semPermissao && <p role="alert" className="text-sm text-destructive">{t("rhOrg.semPermissao")}</p>}
        {p.falhaDados && <p role="alert" className="text-sm text-destructive">{t("rhOrg.falhaDados")}</p>}
        {p.falhaLeitura && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            <span>{t("rhOrg.falhaLeitura")}</span>
            <Button type="button" variant="outline" size="sm" onClick={p.recarregar}>{t("rhOrg.tentarDeNovo")}</Button>
          </div>
        )}
        {p.loading ? (
          <p role="status" className="py-10 text-center text-muted-foreground">{t("rhOrg.carregar")}</p>
        ) : p.visivel ? (
          <ArvoreOrganizacao
            raiz={p.visivel} abertos={p.abertos} seleccionado={p.seleccionado} aoAlternar={p.alternar} aoAbrir={p.setSeleccionado}
            aoAbrirPessoa={(id) => navigate(`/rh-exemplo/pessoas/${id}`)}
          />
        ) : (
          <p className="py-10 text-center text-muted-foreground">{t("rhOrg.semResultados")}</p>
        )}
        <PainelNo
          est={p.est} estado={p.estado} pessoas={p.porId} no={p.noAberto} aoFechar={() => p.setSeleccionado(null)}
          aoLigar={() => p.abrirForm(null)} aoAlterar={p.abrirForm} aoDesligar={p.setADesligar} podeAlterar={podeAlterar}
        />
        <FormularioLigacao
          aberto={p.form.aberto} est={p.est} estado={p.estado} pessoas={p.pessoas} pessoaInicial={p.form.pessoaInicial}
          aoFechar={p.fecharForm} aoGuardar={p.guardar}
        />
        <DesligarDialogo pessoa={p.pessoaADesligar} aoCancelar={() => p.setADesligar(null)} aoConfirmar={p.desligar} />
      </div>
    </div>
  );
}

export default function RhOrganizacao() {
  const [params] = useSearchParams();
  if (params.has("vista")) return <Navigate to={ORGANIZACAO_URL} replace />;
  return <PaginaOrganizacao />;
}
