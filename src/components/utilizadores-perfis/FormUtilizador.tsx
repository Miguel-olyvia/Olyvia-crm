// O formulário de utilizador (convidar/criar e editar), num painel lateral no estilo de "Novo negócio": abas Dados, Vínculos e
// Permissões (só leitura, com a origem). Grava na base pela função `aoGravar` (create-user e rpc_update_user), que a página
// liga aos wrappers; a palavra-passe vive só aqui e vai na gravação. Um erro de gravação aparece no painel e o painel não fecha.
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { AbaDadosUtilizador } from "./AbaDadosUtilizador";
import { AbaForm, ListaAbasForm, Tabs, TabsContent } from "./AbaForm";
import { AbaVinculosForm, type AcoesVinculos } from "./AbaVinculosForm";
import type { ResultadoForm } from "./FormRole";
import type { Editor } from "./logica";
import { PainelFormulario } from "./PainelFormulario";
import { RodapeForm } from "./RodapeForm";
import { SeparadorPermissoesUtilizador } from "./SeparadorPermissoesUtilizador";
import {
  CHAVE_MODO, type AbaFormUtilizador, type FormAberto, type Organizacao, type Permissao, type ResultadoMutacao, type Role, type Utilizador,
} from "./tipos";
import { gerarPalavraPasse, utilizadorDeValores, valoresIniciaisUtilizador, vinculoVazio, type ValoresFormUtilizador } from "./utilizadorForm";
import { useFocoCampo } from "./useFocoCampo";
import { useUltimo } from "./useUltimo";
import { abasComErroUtilizador, primeiroErroUtilizador, validarUtilizador, type CampoUtilizador } from "./validacoes";

export type FormUtilizadorAberto = Extract<NonNullable<FormAberto>, { tipo: "utilizador" }>;

interface FormUtilizadorProps {
  form: FormAberto;
  utilizadores: Utilizador[];
  roles: Role[];
  organizacoes: Organizacao[];
  catalogo: Permissao[];
  editor: Editor;
  /** users.edit com âmbito e sem as proteções de /users, para este utilizador. */
  podeEditar: (u: Utilizador) => boolean;
  /** users.manage_roles: sem ele, ao editar, os vínculos e âmbitos só se veem. */
  podeGerirRoles: boolean;
  /** Cria ou guarda na base. Devolve o erro (nunca o engole). */
  aoGravar: (form: FormUtilizadorAberto, valores: ValoresFormUtilizador, original: Utilizador | undefined) => Promise<ResultadoMutacao>;
  aoFechar: () => void;
  aoConcluir: (r: ResultadoForm) => void;
}

interface InteriorProps extends Omit<FormUtilizadorProps, "form" | "aoFechar"> {
  form: FormUtilizadorAberto;
  utilizador: Utilizador | undefined;
  aoSujar: () => void;
}

const ID_DO_CAMPO: Record<CampoUtilizador, string> = {
  nome: "nome", email: "email", telefone: "telefone", palavraPasse: "palavraPasse", vinculos: "v0-org",
};

function acoesDeVinculos(valores: ValoresFormUtilizador, mudar: (p: Partial<ValoresFormUtilizador>) => void): AcoesVinculos {
  return {
    // Mudar a organização limpa a role (cada organização oferece as suas).
    mudar: (indice, parcial) => mudar({
      vinculos: valores.vinculos.map((v, i) => {
        if (i !== indice) return v;
        const mudouOrg = parcial.organizacaoId !== undefined && parcial.organizacaoId !== v.organizacaoId;
        return { ...v, ...(mudouOrg ? { roleId: "", ambitos: {} } : {}), ...parcial };
      }),
    }),
    adicionar: () => mudar({ vinculos: [...valores.vinculos, vinculoVazio()] }),
    remover: (indice) => mudar({ vinculos: valores.vinculos.filter((_, i) => i !== indice) }),
  };
}

/** Os valores do formulário, os erros (só depois de tentar enviar) e o que deles se deriva. */
function useEstadoUtilizador({ form, utilizador, utilizadores, podeEditar, aoSujar }: InteriorProps, tentou: boolean) {
  const criar = form.modo === "criar";
  const [valores, setValores] = useState<ValoresFormUtilizador>(() => valoresIniciaisUtilizador(utilizador));
  const erros = validarUtilizador(valores, utilizadores, { criar, idAtual: form.id });
  const mudar = (parcial: Partial<ValoresFormUtilizador>) => { aoSujar(); setValores((v) => ({ ...v, ...parcial })); };
  return {
    criar, valores, mudar, erros, mostrados: tentou ? erros : {}, acoes: acoesDeVinculos(valores, mudar),
    bloqueado: !criar && !!utilizador && !podeEditar(utilizador),
    previsao: useMemo(() => utilizadorDeValores(valores, form.id ?? "novo"), [valores, form.id]),
  };
}

function Interior(props: InteriorProps) {
  const { form, roles, organizacoes, catalogo, editor, podeGerirRoles, utilizador, aoConcluir, aoGravar } = props;
  const { t } = useTranslation();
  const id = useId();
  const pedirFoco = useFocoCampo();
  const [aba, setAba] = useState<AbaFormUtilizador>(form.aba ?? "dados");
  const [tentou, setTentou] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [erroGravar, setErroGravar] = useState<string | null>(null);
  const { criar, valores, mudar, erros, mostrados, acoes, bloqueado, previsao } = useEstadoUtilizador(props, tentou);
  const marcas = abasComErroUtilizador(mostrados);
  // Ao criar, o criador escolhe os vínculos (o servidor valida); ao editar, gerir roles é users.manage_roles, como em /users.
  const vinculosBloqueados = bloqueado || (!criar && !podeGerirRoles);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (aGravar) return;
    setTentou(true);
    setErroGravar(null);
    const primeiro = primeiroErroUtilizador(erros);
    if (primeiro) {
      setAba(primeiro.aba);
      pedirFoco(`${id}-${ID_DO_CAMPO[primeiro.campo]}`);
      return;
    }
    setAGravar(true);
    const r = await aoGravar(form, valores, utilizador);
    setAGravar(false);
    if (!r.ok) { setErroGravar(r.erro); return; }
    const nome = valores.nome.trim();
    aoConcluir({
      aviso: t(criar ? "usersProfiles.form.user.created" : "usersProfiles.form.user.saved"),
      anuncio: t(criar ? "usersProfiles.form.user.announce.created" : "usersProfiles.form.user.announce.saved", { name: nome }),
    });
  };

  return (
    <form onSubmit={(e) => { void enviar(e); }} noValidate className="flex min-h-0 flex-1 flex-col">
      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaFormUtilizador)} className="flex min-h-0 flex-1 flex-col">
        <ListaAbasForm aria-label={t("usersProfiles.form.tabs")}>
          <AbaForm value="dados" rotulo={t("usersProfiles.form.user.tab.data")} comErros={marcas.dados} />
          <AbaForm value="vinculos" rotulo={t("usersProfiles.form.user.tab.links")} contador={valores.vinculos.length} comErros={marcas.vinculos} />
          <AbaForm value="permissoes" rotulo={t("usersProfiles.form.user.tab.permissions")} />
        </ListaAbasForm>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <TabsContent value="dados" className="mt-0">
            <AbaDadosUtilizador
              id={id} valores={valores} erros={mostrados} criar={criar} bloqueado={bloqueado} aoMudar={mudar}
              aoGerar={() => mudar({ palavraPasse: gerarPalavraPasse() })}
            />
          </TabsContent>
          <TabsContent value="vinculos" className="mt-0">
            <AbaVinculosForm
              id={id} vinculos={valores.vinculos} erro={mostrados.vinculos} organizacoes={organizacoes} roles={roles}
              editor={editor} catalogo={catalogo} podeEditarAmbitos={podeGerirRoles} bloqueado={vinculosBloqueados} acoes={acoes}
            />
          </TabsContent>
          <TabsContent value="permissoes" className="mt-0 space-y-3">
            <p className="text-sm text-muted-foreground">{t("usersProfiles.form.perms.note")}</p>
            <SeparadorPermissoesUtilizador utilizador={previsao} roles={roles} catalogo={catalogo} editor={editor} />
          </TabsContent>
        </div>
      </Tabs>
      {erroGravar && (
        <p role="alert" className="border-t border-destructive/40 bg-destructive/5 px-6 py-3 text-sm text-destructive">
          {t("usersProfiles.form.user.saveError", { message: erroGravar })}
        </p>
      )}
      <RodapeForm
        submeter={bloqueado ? null : t(aGravar ? "usersProfiles.form.user.saving" : criar ? "usersProfiles.form.user.submit.create" : "usersProfiles.form.user.submit.save")}
        desativado={aGravar}
      />
    </form>
  );
}

/** O painel do utilizador: «Convidar utilizador» ou «Editar utilizador». */
export function FormUtilizador({ form, aoFechar, ...resto }: FormUtilizadorProps) {
  const { t } = useTranslation();
  const [sujo, setSujo] = useState(false);
  const ultimo = useUltimo(form?.tipo === "utilizador" ? form : null);
  const aberto = form?.tipo === "utilizador";
  useEffect(() => { if (aberto) setSujo(false); }, [aberto]);
  const utilizador = ultimo?.id ? resto.utilizadores.find((u) => u.id === ultimo.id) : undefined;
  const modo = ultimo?.modo ?? "criar";
  const protegido = modo === "editar" && !!utilizador && !resto.podeEditar(utilizador);
  const selo = modo === "criar" ? "new" : protegido ? "viewing" : "editing";
  return (
    <PainelFormulario
      aberto={aberto} aoFechar={aoFechar} sujo={sujo} pai={t("usersProfiles.title")}
      titulo={t(`usersProfiles.form.user.title.${CHAVE_MODO[modo]}`)} selo={t(`usersProfiles.form.badge.${selo}`)}
    >
      {ultimo && <Interior form={ultimo} utilizador={utilizador} aoSujar={() => setSujo(true)} {...resto} />}
    </PainelFormulario>
  );
}
