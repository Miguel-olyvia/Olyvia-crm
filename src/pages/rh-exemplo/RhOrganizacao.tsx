/**
 * Organização (RH de exemplo), com duas vistas nas abas sublinhadas (`?vista=estrutura|chefias`, por omissão estrutura):
 * Estrutura = Grupo > Empresas (entidades legais) > Filiais > Centros de trabalho, onde se liga, altera e desliga a pessoa
 * (vínculo legal = empresa e filial; local de trabalho = o centro, que pode ser de outra filial);
 * Chefias = o organograma de pessoas por «reporta a». Tudo em memória, sem base.
 */
import { useSearchParams } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { ArvoreOrganizacao } from "@/components/rh-exemplo/organizacao/ArvoreOrganizacao";
import { BarraOrganizacao } from "@/components/rh-exemplo/organizacao/BarraOrganizacao";
import { ChefiasVista } from "@/components/rh-exemplo/organizacao/ChefiasVista";
import { DesligarDialogo } from "@/components/rh-exemplo/organizacao/DesligarDialogo";
import { FormularioLigacao } from "@/components/rh-exemplo/organizacao/FormularioLigacao";
import { LegendaOrganizacao } from "@/components/rh-exemplo/organizacao/LegendaOrganizacao";
import { PainelNo } from "@/components/rh-exemplo/organizacao/PainelNo";
import { ESTRUTURA_ORGANIZACAO as EST } from "@/components/rh-exemplo/organizacao/lojaOrganizacao";
import { usePaginaOrganizacao } from "@/components/rh-exemplo/organizacao/usePaginaOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";

const VISTAS = ["estrutura", "chefias"] as const;
type Vista = (typeof VISTAS)[number];

function lerVista(valor: string | null): Vista {
  return VISTAS.find((v) => v === valor) ?? "estrutura";
}

type Pagina = ReturnType<typeof usePaginaOrganizacao>;

function VistaEstrutura({ p }: { p: Pagina }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
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

export default function RhOrganizacao() {
  const { t } = useTranslation();
  const p = usePaginaOrganizacao();
  const [params, setParams] = useSearchParams();
  const vista = lerVista(params.get("vista"));
  const mudarVista = (valor: string) =>
    setParams((anterior) => {
      const proximos = new URLSearchParams(anterior);
      proximos.set("vista", lerVista(valor));
      return proximos;
    }, { replace: true });
  const botaoLigar = vista === "estrutura" ? (
    <Button type="button" className="min-h-11 gap-1.5" onClick={() => p.abrirForm(null)}>
      <UserPlus className="h-4 w-4" aria-hidden="true" />
      {t("rhOrg.ligarPessoa")}
    </Button>
  ) : undefined;
  return (
    <div className="space-y-5 p-6">
      <CabecalhoPagina
        titulo={t("rhOrg.titulo")} subtitulo={t("rhOrg.sub")} aviso={t("rhOrg.aviso")}
        pai={{ to: "/rh-exemplo/pessoas", texto: t("rhOrg.pai") }} acoes={botaoLigar}
      />
      <Tabs value={vista} onValueChange={mudarVista} className="space-y-5">
        <ListaAbas aria-label={t("rhOrg.vistas")}>
          {VISTAS.map((v) => <Aba key={v} value={v} rotulo={t(`rhOrg.vista.${v}`)} />)}
        </ListaAbas>
        <TabsContent value="estrutura" className="mt-0"><VistaEstrutura p={p} /></TabsContent>
        <TabsContent value="chefias" className="mt-0"><ChefiasVista /></TabsContent>
      </Tabs>
    </div>
  );
}
