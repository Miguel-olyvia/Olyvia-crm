// «Denúncias» em «A minha área»: UMA página para denunciar e acompanhar. O botão «Nova denúncia» abre o assistente num
// painel lateral; as abas são «As minhas (identificadas)» (lista da própria pessoa, na organização ativa) e «Anónimas»
// (acompanhar com código e PIN). A aba escolhida vive no endereço (`?aba=`) e `?nova=1` abre já o painel (é para onde
// leva o antigo endereço /rh-exemplo/denunciar).
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { useTranslation } from "@/hooks/useTranslation";
import { CabecalhoPagina } from "../comum/CabecalhoPagina";
import { useDenunciasDaOrganizacao } from "../dados/loja";
import { denunciasDaPessoa } from "../lib/organizacao";
import type { PessoaLigada } from "../lib/pessoaLigada";
import { AbaAnonimas } from "./AbaAnonimas";
import { AbaIdentificadas } from "./AbaIdentificadas";
import { PainelNovaDenuncia } from "./PainelNovaDenuncia";

interface PaginaDenunciasProps {
  organizacaoId: string;
  organizacaoNome: string;
  pessoa: PessoaLigada;
}

const ABAS = ["identificadas", "anonimas"] as const;
type AbaDenuncias = (typeof ABAS)[number];

export function PaginaDenuncias({ organizacaoId, organizacaoNome, pessoa }: PaginaDenunciasProps) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [painelAberto, setPainelAberto] = useState(params.get("nova") === "1");
  const botao = useRef<HTMLButtonElement>(null);
  const daOrganizacao = useDenunciasDaOrganizacao(organizacaoId);
  const minhas = denunciasDaPessoa(daOrganizacao, organizacaoId, pessoa.id);
  const aba: AbaDenuncias = ABAS.find((a) => a === params.get("aba")) ?? "identificadas";

  const mudarAba = (v: string): void => setParams({ aba: v }, { replace: true });
  const fechar = (): void => {
    setPainelAberto(false);
    if (params.has("nova")) setParams(Object.fromEntries([...params].filter(([k]) => k !== "nova")), { replace: true });
  };
  const acompanhar = (anonima: boolean): void => {
    setPainelAberto(false);
    setParams({ aba: anonima ? "anonimas" : "identificadas" }, { replace: true });
  };
  const abrirPainel = (): void => setPainelAberto(true);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <CabecalhoPagina
        titulo={t("cdm.minhas.titulo")}
        subtitulo={t("cdm.minhas.subtitulo")}
        raiz={{ rotulo: t("sidebar.rhExemploEu"), to: "/rh-exemplo/documentos" }}
        organizacao={organizacaoNome}
        acoes={
          <Button ref={botao} type="button" className="min-h-11" onClick={abrirPainel}>
            <Plus aria-hidden="true" />
            {t("cdm.denunciar.botao")}
          </Button>
        }
      />
      <Tabs value={aba} onValueChange={mudarAba} className="max-w-3xl space-y-4">
        <ListaAbas aria-label={t("cdm.minhas.abas")}>
          <Aba value="identificadas" rotulo={t("cdm.minhas.identificadas")} contador={minhas.length} />
          <Aba value="anonimas" rotulo={t("cdm.minhas.anonimas")} />
        </ListaAbas>
        <TabsContent value="identificadas" className="mt-0"><AbaIdentificadas denuncias={minhas} onNova={abrirPainel} /></TabsContent>
        <TabsContent value="anonimas" className="mt-0"><AbaAnonimas organizacaoId={organizacaoId} /></TabsContent>
      </Tabs>
      <PainelNovaDenuncia
        aberto={painelAberto}
        onFechar={fechar}
        onAcompanhar={acompanhar}
        organizacaoId={organizacaoId}
        pessoa={pessoa}
        devolverFoco={() => botao.current?.focus()}
      />
    </div>
  );
}
