// «As minhas denúncias» em «A minha área»: duas abas. «Identificadas» lista as denúncias identificadas da própria pessoa
// (da organização ativa); «Anónimas» explica que uma anónima não fica ligada a ninguém e acompanha-se com código e PIN.
// A aba escolhida vive no endereço (`?aba=`), para a confirmação de «Denunciar» poder levar já à aba certa.
import { useSearchParams } from "react-router-dom";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { useTranslation } from "@/hooks/useTranslation";
import { CabecalhoPagina } from "../comum/CabecalhoPagina";
import { useDenunciasDaOrganizacao } from "../dados/loja";
import { denunciasDaPessoa } from "../lib/organizacao";
import { AbaAnonimas } from "./AbaAnonimas";
import { AbaIdentificadas } from "./AbaIdentificadas";

interface PaginaMinhasDenunciasProps {
  organizacaoId: string;
  organizacaoNome: string;
  pessoaId: string;
}

const ABAS = ["identificadas", "anonimas"] as const;
type AbaMinhas = (typeof ABAS)[number];

export function PaginaMinhasDenuncias({ organizacaoId, organizacaoNome, pessoaId }: PaginaMinhasDenunciasProps) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const daOrganizacao = useDenunciasDaOrganizacao(organizacaoId);
  const minhas = denunciasDaPessoa(daOrganizacao, organizacaoId, pessoaId);
  const pedida = params.get("aba");
  const aba: AbaMinhas = ABAS.find((a) => a === pedida) ?? "identificadas";

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <CabecalhoPagina
        titulo={t("cdm.minhas.titulo")}
        subtitulo={t("cdm.minhas.subtitulo")}
        raiz={{ rotulo: t("sidebar.rhExemploEu"), to: "/rh-exemplo/documentos" }}
        organizacao={organizacaoNome}
      />
      <Tabs value={aba} onValueChange={(v) => setParams({ aba: v }, { replace: true })} className="max-w-3xl space-y-4">
        <ListaAbas aria-label={t("cdm.minhas.abas")}>
          <Aba value="identificadas" rotulo={t("cdm.minhas.identificadas")} contador={minhas.length} />
          <Aba value="anonimas" rotulo={t("cdm.minhas.anonimas")} />
        </ListaAbas>
        <TabsContent value="identificadas" className="mt-0"><AbaIdentificadas denuncias={minhas} /></TabsContent>
        <TabsContent value="anonimas" className="mt-0"><AbaAnonimas organizacaoId={organizacaoId} /></TabsContent>
      </Tabs>
    </div>
  );
}
