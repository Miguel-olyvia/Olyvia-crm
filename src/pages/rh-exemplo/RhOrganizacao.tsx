/**
 * Organização (RH de exemplo): o organograma da ORGANIZAÇÃO, não o de pessoas. Grupo > Empresas (entidades legais) >
 * Filiais > Centros de trabalho. Cada pessoa tem duas ligações independentes: o vínculo legal (empresa e filial, o
 * contrato) e o local de trabalho (o centro, que pode ser de outra filial). Aqui liga-se, altera-se e desliga-se a pessoa.
 * Tudo em memória, sem base. A ficha da pessoa e a aba Contrato ainda não mostram estas duas ligações.
 */
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { ArvoreOrganizacao } from "@/components/rh-exemplo/organizacao/ArvoreOrganizacao";
import { BarraOrganizacao } from "@/components/rh-exemplo/organizacao/BarraOrganizacao";
import { DesligarDialogo } from "@/components/rh-exemplo/organizacao/DesligarDialogo";
import { FormularioLigacao } from "@/components/rh-exemplo/organizacao/FormularioLigacao";
import { LegendaOrganizacao } from "@/components/rh-exemplo/organizacao/LegendaOrganizacao";
import { PainelNo } from "@/components/rh-exemplo/organizacao/PainelNo";
import { ESTRUTURA_ORGANIZACAO as EST } from "@/components/rh-exemplo/organizacao/lojaOrganizacao";
import { usePaginaOrganizacao } from "@/components/rh-exemplo/organizacao/usePaginaOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";

export default function RhOrganizacao() {
  const { t } = useTranslation();
  const p = usePaginaOrganizacao();
  const botaoLigar = (
    <Button type="button" className="min-h-11 gap-1.5" onClick={() => p.abrirForm(null)}>
      <UserPlus className="h-4 w-4" aria-hidden="true" />
      {t("rhOrg.ligarPessoa")}
    </Button>
  );
  return (
    <div className="space-y-5 p-6">
      <CabecalhoPagina
        titulo={t("rhOrg.titulo")} subtitulo={t("rhOrg.sub")} aviso={t("rhOrg.aviso")}
        pai={{ to: "/rh-exemplo/pessoas", texto: t("rhOrg.pai") }} acoes={botaoLigar}
      />
      <p role="note" className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">{t("rhOrg.ajuda")}</p>
      <LegendaOrganizacao />
      <BarraOrganizacao termo={p.termo} aoPesquisar={p.setTermo} aoExpandir={p.expandirTudo} aoRecolher={p.recolherTudo} />
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{p.aviso}</p>
      {p.visivel ? (
        <ArvoreOrganizacao raiz={p.visivel} abertos={p.abertos} seleccionado={p.seleccionado} aoAlternar={p.alternar} aoAbrir={p.setSeleccionado} />
      ) : (
        <p className="py-10 text-center text-muted-foreground">{t("rhOrg.semResultados")}</p>
      )}
      <PainelNo
        est={EST} estado={p.estado} pessoas={p.porId} no={p.noAberto} aoFechar={() => p.setSeleccionado(null)}
        aoLigar={() => p.abrirForm(null)} aoAlterar={p.abrirForm} aoDesligar={p.setADesligar}
      />
      <FormularioLigacao
        aberto={p.form.aberto} est={EST} estado={p.estado} pessoas={p.pessoas} pessoaInicial={p.form.pessoaInicial}
        aoFechar={p.fecharForm} aoGuardar={p.guardar}
      />
      <DesligarDialogo pessoa={p.pessoaADesligar} aoCancelar={() => p.setADesligar(null)} aoConfirmar={p.desligar} />
    </div>
  );
}
