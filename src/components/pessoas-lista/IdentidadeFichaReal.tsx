// A identidade da pessoa na ficha real: o tipo (pessoa singular ou empresa) e o nome (o da empresa, como em Clientes), com edição em linha.
// SEM NIF: a função da base (neg_guardar_identidade_pessoa) não lhe toca. Um erro da base (NG003 também cobre a entidade partilhada)
// aparece traduzido, e o formulário só fecha quando a base confirma.
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { LinhaCampo, ListaCampos } from "@/components/ficha-comum/ListaCampos";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ErroAcao } from "@/components/pessoas/ErroAcao";
import type { TipoCliente } from "@/components/pessoas/pessoasTipos";
import { useExecutarAcao } from "@/components/pessoas/useExecutarAcao";
import type { DadosIdentidade } from "@/hooks/pessoas/useGuardarIdentidadePessoa";
import { CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import { compactar, formularioInicial, nomeAmbiguo, pedidoDeIdentidade, temNomeEmPartes, type FormularioIdentidade, type TipoIdentidade } from "./identidadeFormulario";

const I = "pessoasPagina.real.ficha.identity.";
const SEM_INVALIDOS = { empresa: false, nomeProprio: false, apelido: false };

interface IdentidadeFichaRealProps {
  /** O nome visível da pessoa (o da empresa, numa empresa). */
  nome: string;
  /** `null` numa leitura anterior à migration que devolve o tipo: mostra o nome e não deixa editar. */
  tipo: TipoIdentidade | null;
  empresaNome: string | null;
  /** `first_name` e `last_name` da base: quando existem, o formulário abre com eles em vez de partir o nome. */
  nomeProprio?: string | null;
  apelido?: string | null;
  /** O tipo de cliente da base: `condominio` faz de uma organização um condomínio (que nunca se despromove a empresa aqui). */
  tipoCliente?: TipoCliente;
  podeEditar: boolean;
  aoGuardar: (dados: DadosIdentidade) => Promise<unknown>;
}

function OpcaoTipo({ valor, rotulo, id }: { valor: TipoIdentidade; rotulo: string; id: string }) {
  return (
    <Label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] font-normal">
      <RadioGroupItem id={id} value={valor} />
      {rotulo}
    </Label>
  );
}

export function IdentidadeFichaReal({ nome, tipo: tipoDaBase, empresaNome, nomeProprio, apelido, tipoCliente, podeEditar, aoGuardar }: IdentidadeFichaRealProps) {
  const tipo: TipoIdentidade | null = tipoDaBase === "organization" && tipoCliente === "condominio" ? "condominio" : tipoDaBase;
  const { t } = useTranslation();
  const anunciar = useAnunciar();
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<FormularioIdentidade | null>(null);
  const [faltaChave, setFaltaChave] = useState<string | null>(null);
  // Os campos que a última validação deu por vazios: ficam `aria-invalid` até se voltar a escrever.
  const [invalidos, setInvalidos] = useState<{ empresa: boolean; nomeProprio: boolean; apelido: boolean }>(SEM_INVALIDOS);
  const executar = useExecutarAcao();
  const botaoEditar = useRef<HTMLButtonElement>(null);
  const primeiroCampo = useRef<HTMLInputElement>(null);
  const campoApelido = useRef<HTMLInputElement>(null);
  const jaAbriu = useRef(false);

  // O foco vai para o primeiro campo ao abrir e volta ao botão de editar ao fechar (cancelar ou guardar).
  useEffect(() => {
    if (aberto) { jaAbriu.current = true; primeiroCampo.current?.focus(); } else if (jaAbriu.current) botaoEditar.current?.focus();
  }, [aberto]);

  const atual = tipo === null ? null : { nome, tipo, empresaNome, nomeProprio, apelido };
  const abrir = () => {
    if (!atual) return;
    setForm(formularioInicial(atual));
    setFaltaChave(null);
    setInvalidos(SEM_INVALIDOS);
    setAberto(true);
  };
  const mudar = (parte: Partial<FormularioIdentidade>) => {
    setFaltaChave(null);
    setInvalidos(SEM_INVALIDOS);
    setForm((f) => (f ? { ...f, ...parte } : f));
  };
  const fechar = () => setAberto(false);

  const guardar = () => {
    if (!atual || !form) return;
    const pedido = pedidoDeIdentidade(form, atual);
    if (pedido.estado === "falta") {
      // O erro diz-se, marca o campo em falta e leva-lhe o foco (quem usa o teclado ou o leitor de ecrã sabe qual corrigir).
      const marcas = form.tipo !== "person"
        ? { empresa: true, nomeProprio: false, apelido: false }
        : { empresa: false, nomeProprio: compactar(form.nomeProprio) === "", apelido: compactar(form.apelido) === "" };
      setFaltaChave(`${I}${pedido.chaveErro}`);
      setInvalidos(marcas);
      (marcas.apelido && !marcas.nomeProprio ? campoApelido : primeiroCampo).current?.focus();
      return;
    }
    if (pedido.estado === "semAlteracao") { fechar(); return; }
    const mensagem = t(`${I}saved`);
    executar.executar(() => aoGuardar(pedido.dados).then(() => undefined), () => { fechar(); anunciar(mensagem); }, mensagem);
  };

  const ehEmpresa = tipo === "organization" || tipo === "condominio";
  const chaveTipo = tipo === "condominio" ? "condominio" : ehEmpresa ? "company" : "person";
  const chaveNomeEmpresa = form?.tipo === "condominio" ? "condominioName" : "companyName";
  // A pessoa que o servidor recusa por NG003 (indisponível, partilhada, utilizador do sistema): aqui diz-se o que isso significa para a edição.
  const chaveErro = executar.erro === CHAVES_ERRO_NEG.NG003 ? `${I}errorUnavailable` : executar.erro;
  const idErro = `${id}-erro`;
  const idAviso = `${id}-aviso`;
  const mostrarAviso = form?.tipo === "person" && atual?.tipo === "person" && !temNomeEmPartes(atual) && nomeAmbiguo(atual.nome);
  const ligar = (invalido: boolean, comAviso: boolean): { "aria-invalid"?: true; "aria-describedby"?: string } => {
    const ids = [invalido && faltaChave ? idErro : null, comAviso ? idAviso : null].filter(Boolean).join(" ");
    return { "aria-invalid": invalido ? true : undefined, "aria-describedby": ids || undefined };
  };
  return (
    <Seccao titulo={t(`${I}title`)}>
      {!aberto || !form ? (
        <>
          <ListaCampos>
            {tipo !== null && <LinhaCampo rotulo={t(`${I}type`)}>{t(`${I}${chaveTipo}`)}</LinhaCampo>}
            <LinhaCampo rotulo={t(`${I}${tipo === "condominio" ? "condominioName" : ehEmpresa ? "companyName" : "name"}`)}>{ehEmpresa ? empresaNome ?? nome : nome}</LinhaCampo>
          </ListaCampos>
          {podeEditar && tipo !== null && (
            <Button ref={botaoEditar} type="button" variant="outline" className={cn("mt-3 min-h-11", FOCO)} onClick={abrir}>{t(`${I}edit`)}</Button>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <RadioGroup value={form.tipo} onValueChange={(v) => mudar({ tipo: v as TipoIdentidade })} aria-label={t(`${I}typeLegend`)} className="gap-0">
            <OpcaoTipo id={`${id}-pessoa`} valor="person" rotulo={t(`${I}person`)} />
            {/* Um condomínio não se passa a empresa aqui: a base despromoveria o tipo de cliente. */}
            {tipo !== "condominio" && <OpcaoTipo id={`${id}-empresa`} valor="organization" rotulo={t(`${I}company`)} />}
            <OpcaoTipo id={`${id}-condominio`} valor="condominio" rotulo={t(`${I}condominio`)} />
          </RadioGroup>
          {form.tipo !== "person" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-nome-empresa`}>{t(`${I}${chaveNomeEmpresa}`)}</Label>
              <Input
                id={`${id}-nome-empresa`} ref={primeiroCampo} className="min-h-11" maxLength={200} value={form.nomeEmpresa}
                onChange={(e) => mudar({ nomeEmpresa: e.target.value })} {...ligar(invalidos.empresa, false)}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-nome-proprio`}>{t(`${I}firstName`)}</Label>
                <Input
                  id={`${id}-nome-proprio`} ref={primeiroCampo} className="min-h-11" maxLength={100} value={form.nomeProprio}
                  onChange={(e) => mudar({ nomeProprio: e.target.value })} {...ligar(invalidos.nomeProprio, mostrarAviso)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-apelido`}>{t(`${I}lastName`)}</Label>
                <Input
                  id={`${id}-apelido`} ref={campoApelido} className="min-h-11" maxLength={100} value={form.apelido}
                  onChange={(e) => mudar({ apelido: e.target.value })} {...ligar(invalidos.apelido, mostrarAviso)}
                />
              </div>
            </div>
          )}
          {mostrarAviso && <p id={idAviso} className="text-sm text-muted-foreground">{t(`${I}manyWords`)}</p>}
          {faltaChave && <p id={idErro} role="alert" className="text-sm font-medium text-destructive">{t(faltaChave)}</p>}
          <ErroAcao chave={chaveErro} chaveExtra={executar.erroExtra} />
          <div className="flex flex-wrap gap-2">
            {/* Como os botões dos outros painéis: ocupado fica `aria-disabled` (continua focável e lido) e o clique é ignorado. */}
            <Button
              type="button" className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)} onClick={() => { if (!executar.aGuardar) guardar(); }}
              aria-disabled={executar.aGuardar || undefined} aria-busy={executar.aGuardar || undefined}
            >
              {t(executar.aGuardar ? "pessoasPagina.real.ficha.saving" : `${I}save`)}
            </Button>
            <Button
              type="button" variant="outline" className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
              onClick={() => { if (!executar.aGuardar) fechar(); }} aria-disabled={executar.aGuardar || undefined}
            >
              {t(`${I}cancel`)}
            </Button>
          </div>
        </div>
      )}
    </Seccao>
  );
}
