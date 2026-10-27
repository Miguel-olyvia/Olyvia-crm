// Os passos da fase Por contactar (Quem pede, Contacto e Origem) com o MESMO ecrã do passo, preenchido com o que a ficha tem e só para ler. Esta fase
// não tem assistente (o botão do passo regista a chamada num diálogo da ficha), por isso o guia pede estes ecrãs um a um, na fase atual e numa feita.
// Só apresentação: nada se grava aqui. O NIF abre sempre vazio (a ficha só diz se há e os últimos 3 dígitos); a origem só tem campanha e formulário.
import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { formularioInicial } from "@/components/pessoas-lista/identidadeFormulario";
import { formularioDeContacto } from "@/components/pessoas-lista/contactoFormulario";
import type { Pessoa } from "../pessoasTipos";
import { CorpoContacto, CorpoOrigem, CorpoQuemPede, SoLeitura } from "./PassosContacto";
import { tipoIdentidadeDe } from "./quemPedeFormulario";

const nada = (): void => undefined;

/** Os passos da fase Por contactar que têm ecrã (Quem pede, Contacto e Origem): os ids da lista da fase. */
const PASSOS_POR_CONTACTAR: readonly string[] = ["quemPede", "contacto", "origem"];

/** O que o guia pede para um passo da lista: o ecrã do passo se é da fase Por contactar, senão `null` (o guia mostra o registo em texto). */
export function leituraDoPasso(pessoa: Pessoa, { faseId, itemId, faseFeita }: { faseId: string; itemId: string; faseFeita: boolean }): JSX.Element | null {
  return faseId === "porContactar" && PASSOS_POR_CONTACTAR.includes(itemId) ? <LeituraDoContacto passo={itemId} pessoa={pessoa} faseFeita={faseFeita} /> : null;
}

export interface LeituraDoContactoProps {
  passo: string;
  pessoa: Pessoa;
  /** A fase já passou (a pessoa avançou): a frase diz isso; na atual diz onde se altera. */
  faseFeita: boolean;
}

/** O ecrã do passo (`quemPede`, `contacto` ou `origem`, os ids da lista da fase), só para ler; `null` nos outros (o guia cai no registo em texto). */
export function LeituraDoContacto({ passo, pessoa, faseFeita }: LeituraDoContactoProps) {
  const { t } = useTranslation();
  const tipoAtual = tipoIdentidadeDe(pessoa.tipoCliente);
  const empresaNome = pessoa.empresa?.nome ?? null;
  const formQuemPede = useMemo(
    () => formularioInicial({ nome: pessoa.nome, tipo: tipoAtual ?? "person", empresaNome }), [pessoa.nome, tipoAtual, empresaNome],
  );
  const formContacto = useMemo(() => formularioDeContacto({
    telefone: pessoa.contacto.telefone, email: pessoa.contacto.email, contacto: pessoa.contactoPreferido, hora: pessoa.horaPreferida, lingua: pessoa.lingua,
  }), [pessoa.contacto.telefone, pessoa.contacto.email, pessoa.contactoPreferido, pessoa.horaPreferida, pessoa.lingua]);
  const aviso = t(`pessoasPagina.assistente.leitura.${faseFeita ? "faseFeita" : "atual"}`);
  switch (passo) {
    case "quemPede":
      return (
        <SoLeitura ativo aviso={aviso}>
          <CorpoQuemPede
            podeEditar={false}
            quemPede={{
              form: formQuemPede, tipoAtual, nif: "", nifUltimos3: pessoa.nifUltimos3 ?? null, nifRegistado: Boolean(pessoa.nifUltimos3 || pessoa.temNif),
              aoMudarForm: nada, aoMudarNif: nada, somenteLeitura: true,
            }}
          />
        </SoLeitura>
      );
    case "contacto":
      return (
        <SoLeitura ativo aviso={aviso}>
          <CorpoContacto form={formContacto} aoMudar={nada} podeEditar={false} />
        </SoLeitura>
      );
    case "origem":
      return (
        <SoLeitura ativo aviso={aviso}>
          <CorpoOrigem campanha={pessoa.campanha ?? null} formulario={pessoa.formulario ?? null} />
        </SoLeitura>
      );
    default:
      return null;
  }
}
