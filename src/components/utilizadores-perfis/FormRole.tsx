// O formulário de role (criar, editar e duplicar), num painel lateral no estilo de "Novo negócio": abas Geral e Permissões,
// rodapé fixo com Cancelar e um único botão primário. Grava na memória (`perfisStore`), nunca na base.
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { AbaForm, ListaAbasForm, Tabs, TabsContent } from "./AbaForm";
import { AbaGeralRole, MODELO_DUPLICAR, MODELO_EM_BRANCO, type AcoesGeralRole } from "./AbaGeralRole";
import { EDITOR_EXEMPLO, PERMISSOES } from "./catalogoExemplo";
import { permissoesVisiveis } from "./logica";
import { contarConcedidas, fundirPermissoes } from "./matriz";
import { MatrizEditavel } from "./MatrizEditavel";
import { aplicarOrigem, MODELOS_EXEMPLO, valoresIniciaisRole, type ValoresFormRole } from "./modelosRole";
import { PainelFormulario } from "./PainelFormulario";
import { criarRole, guardarRole, type DadosRole } from "./perfisStore";
import { RodapeForm } from "./RodapeForm";
import { CHAVE_MODO, type FormAberto, type Permissao, type Role } from "./tipos";
import { useFocoCampo } from "./useFocoCampo";
import { useUltimo } from "./useUltimo";
import { abasComErroRole, gerarCodigo, validarRole } from "./validacoes";

type FormRoleAberto = Extract<NonNullable<FormAberto>, { tipo: "role" }>;
type AbaRole = "geral" | "permissoes";
const ehCriacao = (form: FormRoleAberto): boolean => form.modo !== "editar";

/** O que a página faz quando o formulário termina: aviso (toast), anúncio para o leitor de ecrã, e fecha. */
export interface ResultadoForm {
  aviso: string;
  anuncio: string;
}

interface FormRoleProps {
  form: FormAberto;
  roles: Role[];
  aoFechar: () => void;
  aoConcluir: (r: ResultadoForm) => void;
}

interface InteriorProps {
  form: FormRoleAberto;
  role: Role | undefined;
  roles: Role[];
  aoSujar: () => void;
  aoConcluir: (r: ResultadoForm) => void;
}

function useValoresRole(form: FormRoleAberto, role: Role | undefined, roles: Role[], aoSujar: () => void) {
  const { t } = useTranslation();
  const sufixo = t("usersProfiles.form.role.copySuffix");
  const [valores, setValores] = useState<ValoresFormRole>(() => valoresIniciaisRole(form.modo, role, sufixo));
  const [codigoManual, setCodigoManual] = useState(form.modo === "editar");
  const [modelo, setModelo] = useState(MODELO_EM_BRANCO);
  const [fonteId, setFonteId] = useState("");
  const mudar = (parcial: Partial<ValoresFormRole>) => { aoSujar(); setValores((v) => ({ ...v, ...parcial })); };
  const acompanhar = (nome: string) => (codigoManual ? {} : { codigo: gerarCodigo(nome) });
  const partirDe = (origem: Parameters<typeof aplicarOrigem>[1], marca = "") => {
    const novo = aplicarOrigem(valores, origem, marca);
    mudar({ ...novo, ...acompanhar(novo.nome) });
  };
  const acoes: AcoesGeralRole = {
    nome: (nome) => mudar({ nome, ...acompanhar(nome) }),
    codigo: (codigo) => { setCodigoManual(true); mudar({ codigo }); },
    descricao: (descricao) => mudar({ descricao }),
    podeAssinar: (podeAssinar) => mudar({ podeAssinar }),
    modelo: (m) => {
      setModelo(m);
      if (m === MODELO_EM_BRANCO) mudar({ permissoes: [] });
      else if (m !== MODELO_DUPLICAR) partirDe(MODELOS_EXEMPLO.find((x) => x.id === m) ?? null);
    },
    fonte: (roleId) => { setFonteId(roleId); partirDe(roles.find((r) => r.id === roleId) ?? null, sufixo); },
  };
  return { valores, mudar, acoes, modelo, fonteId };
}

type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

/** Grava a role no store (cria ou guarda) e diz o que o ecrã deve avisar. */
function gravarRole(form: FormRoleAberto, role: Role | undefined, valores: ValoresFormRole, visiveis: Permissao[], t: Traduzir): ResultadoForm {
  const dados: DadosRole = {
    nome: valores.nome.trim(), codigo: valores.codigo.trim(), descricao: valores.descricao.trim(), podeAssinar: valores.podeAssinar,
    permissoes: fundirPermissoes(form.modo === "editar" ? role?.permissoes ?? [] : [], valores.permissoes, visiveis),
  };
  const criacao = ehCriacao(form);
  if (criacao) criarRole(dados);
  else if (form.id) guardarRole(form.id, dados);
  return {
    aviso: t(criacao ? "usersProfiles.form.role.created" : "usersProfiles.form.role.saved"),
    anuncio: t(criacao ? "usersProfiles.form.role.announce.created" : "usersProfiles.form.role.announce.saved", { name: dados.nome }),
  };
}

function Interior({ form, role, roles, aoSujar, aoConcluir }: InteriorProps) {
  const { t } = useTranslation();
  const id = useId();
  const pedirFoco = useFocoCampo();
  const [aba, setAba] = useState<AbaRole>("geral");
  const [tentou, setTentou] = useState(false);
  const visiveis = useMemo(() => permissoesVisiveis(PERMISSOES, EDITOR_EXEMPLO), []);
  const { valores, mudar, acoes, modelo, fonteId } = useValoresRole(form, role, roles, aoSujar);
  const bloqueado = form.modo === "editar" && !!role?.sistema;
  const erros = validarRole(valores, roles, form.modo === "editar" ? form.id : undefined);
  const mostrados = tentou ? erros : {};

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (abasComErroRole(erros).length > 0) {
      setAba("geral");
      pedirFoco(`${id}-${erros.nome ? "nome" : "codigo"}`);
      return;
    }
    aoConcluir(gravarRole(form, role, valores, visiveis, t));
  };

  return (
    <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
      <Tabs value={aba} onValueChange={(v) => setAba(v === "permissoes" ? "permissoes" : "geral")} className="flex min-h-0 flex-1 flex-col">
        <ListaAbasForm aria-label={t("usersProfiles.form.tabs")}>
          <AbaForm value="geral" rotulo={t("usersProfiles.form.role.tab.general")} comErros={abasComErroRole(mostrados).includes("geral")} />
          <AbaForm value="permissoes" rotulo={t("usersProfiles.form.role.tab.permissions")} contador={contarConcedidas(valores.permissoes, visiveis)} />
        </ListaAbasForm>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <TabsContent value="geral" className="mt-0">
            <AbaGeralRole
              id={id} valores={valores} erros={mostrados} bloqueado={bloqueado} comModelo={form.modo === "criar"}
              modelo={modelo} fonteId={fonteId} roles={roles} acoes={acoes}
            />
          </TabsContent>
          <TabsContent value="permissoes" className="mt-0">
            <MatrizEditavel visiveis={visiveis} concedidas={valores.permissoes} somenteLeitura={bloqueado} aoMudar={(permissoes) => mudar({ permissoes })} />
          </TabsContent>
        </div>
      </Tabs>
      <RodapeForm submeter={bloqueado ? null : t(ehCriacao(form) ? "usersProfiles.form.role.submit.create" : "usersProfiles.form.role.submit.save")} />
    </form>
  );
}

/** O painel da role: título e selo conforme o modo (e "só leitura" numa role de sistema). */
export function FormRole({ form, roles, aoFechar, aoConcluir }: FormRoleProps) {
  const { t } = useTranslation();
  const [sujo, setSujo] = useState(false);
  const ultimo = useUltimo(form?.tipo === "role" ? form : null);
  const aberto = form?.tipo === "role";
  useEffect(() => { if (aberto) setSujo(false); }, [aberto]);
  const role = ultimo?.id ? roles.find((r) => r.id === ultimo.id) : undefined;
  const tituloModo = ultimo?.modo ?? "criar";
  const selo = tituloModo !== "editar" ? "new" : role?.sistema ? "viewing" : "editing";
  return (
    <PainelFormulario
      aberto={aberto} aoFechar={aoFechar} sujo={sujo} pai={t("usersProfiles.title")}
      titulo={t(`usersProfiles.form.role.title.${CHAVE_MODO[tituloModo]}`)} selo={t(`usersProfiles.form.badge.${selo}`)}
    >
      {ultimo && <Interior form={ultimo} role={role} roles={roles} aoSujar={() => setSujo(true)} aoConcluir={aoConcluir} />}
    </PainelFormulario>
  );
}
