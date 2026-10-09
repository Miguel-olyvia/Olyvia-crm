/**
 * Os dois atalhos de documentos do separador Contratos: "Anexar contrato ja
 * assinado" e "Criar aditamento". Saiu de `PessoaContratoTab.tsx`.
 *
 * Sao o mesmo atalho, o mesmo texto e o mesmo icone que existem em Documentos
 * (`PessoaDocumentosTab`) -- aqui e que se trata do contrato, e obrigar a
 * saltar de separador so para anexar o papel assinado era atrito. O fluxo dos
 * dois passos (criar + anexar ficheiro) vive em `AnexarContratoAssinadoDialog`
 * e em `InserirDocumentoDialog`, reaproveitados sem duplicar nada. A LISTAGEM
 * dos documentos continua so em Documentos.
 *
 * Instancia PROPRIA de `usePessoaDocumentos`, com `podeVerModelos: false`: este
 * caminho nunca passa por um modelo (so ficheiro anexado), por isso nunca
 * precisa da lista de modelos. A permissao (`hr.pessoas.documentos.emitir`) e
 * a mesma que abre os dois em Documentos; sem ela este componente nao mostra
 * nem monta nada.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FilePlus2, FileSignature } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { usePessoaDocumentos } from "@/hooks/usePessoaDocumentos";
import {
  AnexarContratoAssinadoDialog,
  type OpcaoVinculoDocumento,
} from "@/components/hr/AnexarContratoAssinadoDialog";
import { InserirDocumentoDialog } from "@/components/hr/InserirDocumentoDialog";

interface ContratoAtalhosDocumentosProps {
  pessoaId: string;
  organizationId: string;
  /** `hr.pessoas.documentos.emitir`. */
  podeAnexarContratoAssinado: boolean;
  /** Vinculos desta pessoa, para o selector opcional dos dialogos. */
  vinculosOpcoesDocumento: OpcaoVinculoDocumento[];
}

export function ContratoAtalhosDocumentos({
  pessoaId,
  organizationId,
  podeAnexarContratoAssinado,
  vinculosOpcoesDocumento,
}: ContratoAtalhosDocumentosProps) {
  const { t } = useTranslation();
  const dadosDocumentos = usePessoaDocumentos(pessoaId, false);
  const [aAnexarContrato, setAAnexarContrato] = useState(false);
  const [aCriarAditamento, setACriarAditamento] = useState(false);

  if (!podeAnexarContratoAssinado) return null;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAAnexarContrato(true)}>
        <FileSignature className="mr-2 h-4 w-4" />
        {t("hr.documentos.anexarContratoAssinado")}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setACriarAditamento(true)}>
        <FilePlus2 className="mr-2 h-4 w-4" />
        {t("hr.contrato.criarAditamento")}
      </Button>

      <AnexarContratoAssinadoDialog
        open={aAnexarContrato}
        onOpenChange={setAAnexarContrato}
        pessoaId={pessoaId}
        organizationId={organizationId}
        vinculosOpcoes={vinculosOpcoesDocumento}
        criarPorUpload={dadosDocumentos.criarPorUpload}
        anexarFicheiro={dadosDocumentos.anexarFicheiro}
        saving={dadosDocumentos.saving}
      />
      <InserirDocumentoDialog
        open={aCriarAditamento}
        onOpenChange={setACriarAditamento}
        pessoaId={pessoaId}
        organizationId={organizationId}
        vinculosOpcoes={vinculosOpcoesDocumento}
        modelos={dadosDocumentos.modelos}
        podeEmitir={false}
        podeCriarPorUpload={podeAnexarContratoAssinado}
        tipoInicial="adenda"
        emitir={dadosDocumentos.emitir}
        criarPorUpload={dadosDocumentos.criarPorUpload}
        anexarFicheiro={dadosDocumentos.anexarFicheiro}
        saving={dadosDocumentos.saving}
      />
    </>
  );
}
