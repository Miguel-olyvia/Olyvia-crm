/**
 * O formulario do portal: a UI do convite que a pessoa ja preenchia (`ConvitePagina1` e
 * `ConvitePagina2`), reutilizada tal como estava, preenchida com o que a accao `ler` devolveu.
 *
 * O QUE SE ADAPTOU, e so isso:
 *  - a origem dos dados: o rascunho vem da `ler` (nao do estado do convite antigo);
 *  - o que e obrigatorio: `campos_obrigatorios` da `ler` (os da posicao "convite" desta organizacao);
 *  - o que se edita: `campos_editaveis` da `ler`, conforme o estado (todos em preenchimento; so os
 *    devolvidos em `devolvida`);
 *  - NISS e IBAN: o botao que os guarda no cofre (accao `sensiveis`) fica junto do campo onde se escrevem.
 *
 * O QUE FICA PARA A V3B (e por isso nao existe aqui): gravar o rascunho, submeter e os anexos. Os
 * botoes de gravar e submeter estao desenhados e desactivados em `PortalProximaFase`; navegar entre as
 * duas paginas e livre e nao chama a Edge. Nada do que se escreve sai do browser (excepto o NISS e o
 * IBAN, a pedido), e acaba com a sessao: este componente desmonta-se com ela.
 */
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CamposTocadosProvider } from "@/components/hr/form/Campos";
import { ConvitePagina1 } from "@/components/hr/convite/ConvitePagina1";
import { ConvitePagina2 } from "@/components/hr/convite/ConvitePagina2";
import { useTranslation } from "@/hooks/useTranslation";
import type { ResultadoSensiveis } from "@/hooks/useConviteAdmissaoPublico";
import {
  campoEhObrigatorio,
  obrigatoriosResolvidos,
  type CodigoCampoObrigatorioAdmissao,
} from "@/lib/hr/admissaoObrigatorios";
import type { RascunhoConvite } from "@/lib/hr/conviteAdmissaoPayload";
import { errosDeFormato, type CampoComFormato } from "@/lib/hr/conviteAdmissaoEcra";
import { comSensiveisGuardados, formularioEditavel, rascunhoParaFormulario, type PortalLer } from "@/lib/hr/portalAdmissao";
import { PortalDocumentos } from "./PortalDocumentos";
import { PortalSensivel } from "./PortalSensiveis";

/** O `id` de cada campo com validacao de formato, para saber se ja foi tocado e para lhe levar o foco. */
const ID_DOM_DO_CAMPO: Record<CampoComFormato, string> = {
  nif: "convite-nif",
  niss: "convite-niss",
  conta_numero: "convite-conta-numero",
  conta_bic: "convite-conta-bic",
};

const CAMPOS_COM_FORMATO: readonly string[] = ["nif", "niss", "conta_numero", "conta_bic"];

interface PortalFormularioProps {
  dados: PortalLer;
  pagina: 1 | 2;
  aoMudarPagina: (pagina: 1 | 2) => void;
  aoGravarSensiveis: (valores: { niss?: string; iban?: string }) => Promise<ResultadoSensiveis>;
}

export function PortalFormulario({ dados, pagina, aoMudarPagina, aoGravarSensiveis }: PortalFormularioProps) {
  const { t } = useTranslation();
  // Preenche-se uma so vez, com o que a `ler` trouxe: depois disso quem manda e quem escreve.
  const [rascunho, setRascunho] = useState<RascunhoConvite>(() => rascunhoParaFormulario(dados.rascunho));
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const formularioRef = useRef<HTMLDivElement>(null);

  const tocar = (campoId: string) =>
    setTocados((anteriores) => (anteriores.has(campoId) ? anteriores : new Set(anteriores).add(campoId)));
  const definir = <K extends keyof RascunhoConvite>(campo: K, valor: RascunhoConvite[K]) =>
    setRascunho((anterior) => ({ ...anterior, [campo]: valor }));

  // Os obrigatorios REAIS desta organizacao: os codigos que a `ler` devolveu (posicao "convite"). Uma lista
  // vazia e uma resposta ("nada e obrigatorio"), nunca um motivo para cair na lista fixa.
  const camposObrigatorios = useMemo(
    () => obrigatoriosResolvidos(dados.campos_obrigatorios.map((codigo) => ({ codigo, condicional: false }))),
    [dados.campos_obrigatorios],
  );
  // O NISS e o IBAN guardados no cofre contam como preenchidos (um dos dois, NIF ou NISS, basta).
  const efetivo = useMemo(() => comSensiveisGuardados(rascunho, dados), [rascunho, dados]);
  const obrigatorio = (codigo: CodigoCampoObrigatorioAdmissao): boolean => campoEhObrigatorio(efetivo, codigo, camposObrigatorios);

  // Formato: digito de controlo do NIF/NISS, IBAN, BIC. So se mostra depois de sair do campo.
  const errosFormato = useMemo(
    () => errosDeFormato({ nif: rascunho.nif, niss: rascunho.niss, conta_numero: rascunho.conta_numero, conta_bic: rascunho.conta_bic }),
    [rascunho.nif, rascunho.niss, rascunho.conta_numero, rascunho.conta_bic],
  );
  // Na V3a nada se submete, por isso nao ha erros de "campo em falta": o asterisco diz o que e pedido.
  const erroDe = (campoId: keyof RascunhoConvite): string | null => {
    if (!CAMPOS_COM_FORMATO.includes(campoId)) return null;
    const campo = campoId as CampoComFormato;
    const chave = errosFormato[campo];
    return chave && tocados.has(ID_DOM_DO_CAMPO[campo]) ? t(chave) : null;
  };

  const editavel = (campo: keyof RascunhoConvite): boolean => formularioEditavel(dados, campo);

  /** Um valor com formato errado: mostra-se o erro no campo e leva-se-lhe o foco. */
  const mostrarErroDoCampo = (campo: CampoComFormato) => {
    tocar(ID_DOM_DO_CAMPO[campo]);
    setTimeout(() => formularioRef.current?.querySelector<HTMLElement>(`#${ID_DOM_DO_CAMPO[campo]}`)?.focus(), 0);
  };

  const sensivel = (campo: "niss" | "iban") => {
    const eNiss = campo === "niss";
    const campoDoEcra: "niss" | "conta_numero" = eNiss ? "niss" : "conta_numero";
    return (
      <PortalSensivel
        campo={campo}
        valor={rascunho[campoDoEcra]}
        formatoInvalido={Boolean(errosFormato[campoDoEcra])}
        editavel={editavel(campoDoEcra)}
        aoInvalido={() => mostrarErroDoCampo(campoDoEcra)}
        aoGravar={aoGravarSensiveis}
        aoGuardado={() => definir(campoDoEcra, "")}
      />
    );
  };

  const propsPagina = { t, rascunho, definir, erroDe, obrigatorio, editavel };

  return (
    <div ref={formularioRef} className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("portal.formulario.aviso")}</p>
      {dados.estado === "devolvida" && <p className="text-sm font-medium">{t("portal.formulario.bloqueados")}</p>}

      <CamposTocadosProvider onTocar={tocar} rotuloObrigatorio={t("hr.campos.obrigatorio")}>
        {pagina === 1 && <ConvitePagina1 {...propsPagina} aposCampo={{ niss: sensivel("niss") }} />}
        {pagina === 2 && (
          <ConvitePagina2
            {...propsPagina}
            erroAssinatura={null}
            erroAceite={null}
            anexos={<PortalDocumentos anexos={dados.anexos} />}
            aposCampo={{ conta_numero: sensivel("iban") }}
          />
        )}
      </CamposTocadosProvider>

      <div className="flex justify-between">
        {pagina === 2 ? (
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => aoMudarPagina(1)}>
            {t("hr.convite.anterior")}
          </Button>
        ) : (
          <span />
        )}
        {pagina === 1 && (
          <Button type="button" className="min-h-11" onClick={() => aoMudarPagina(2)}>
            {t("hr.convite.seguinte")}
          </Button>
        )}
      </div>
    </div>
  );
}
