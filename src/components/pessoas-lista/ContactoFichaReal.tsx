// O contacto da pessoa na ficha real: telefone e email (que se substituem), «Prefere ser contactado», «Melhor hora» e «Idioma», com edição em linha.
// Um idioma fora da lista (por exemplo es) mostra-se tal como está e nunca se reenvia. Um erro da base (contacto de outra pessoa, email ou telefone
// repetido) aparece traduzido, e o formulário só fecha quando a base confirma.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { LinhaCampo, ListaCampos } from "@/components/ficha-comum/ListaCampos";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/negocio-metas/estilos";
import { TelefoneNovaLead } from "@/components/pessoas-leads/TelefoneNovaLead";
import { ErroAcao } from "@/components/pessoas/ErroAcao";
import type { ContactoPreferido, HoraPreferida } from "@/components/pessoas/pessoasTipos";
import { useExecutarAcao } from "@/components/pessoas/useExecutarAcao";
import { CHAVE_EMAIL_DUPLICADO, CHAVE_TELEFONE_DUPLICADO, CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import { CONTACTOS_PREFERIDOS, HORAS_PREFERIDAS, LINGUAS_GRAVAVEIS, opcoesDeLingua } from "@/hooks/pessoas/useGuardarContactoPessoa";
import { formularioDeContacto, pedidoDeContacto, type DadosContactoFormulario, type FormularioContacto } from "./contactoFormulario";

const C = "pessoasPagina.real.ficha.contact.";

/** O campo a que um erro de contacto repetido se refere: pela chave (23505) ou, no NG019, pelo que se enviou (o primeiro, se foram os dois). */
function campoDoErroRepetido(chave: string | null, enviado: DadosContactoFormulario | null): "email" | "telefone" | null {
  if (chave === CHAVE_EMAIL_DUPLICADO) return "email";
  if (chave === CHAVE_TELEFONE_DUPLICADO) return "telefone";
  if (chave !== CHAVES_ERRO_NEG.NG019 || !enviado) return null;
  return enviado.email !== undefined ? "email" : enviado.telefone !== undefined ? "telefone" : null;
}

/** O nome do idioma na língua do ecrã; se o código não se reconhece, o próprio código. */
function nomeDeIdioma(codigo: string, ecra: string): string {
  try {
    return new Intl.DisplayNames([ecra], { type: "language" }).of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}
const CLASSE_SELECT = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-[15px] text-foreground";

interface ContactoFichaRealProps {
  telefone: string | null;
  email: string | null;
  contactoPreferido?: ContactoPreferido;
  horaPreferida?: HoraPreferida;
  /** O idioma da base (pode estar fora da lista: es). */
  lingua?: string;
  podeEditar: boolean;
  aoGuardar: (dados: DadosContactoFormulario) => Promise<unknown>;
}

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label id={`${id}-rotulo`} htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  );
}

export function ContactoFichaReal({ telefone, email, contactoPreferido, horaPreferida, lingua, podeEditar, aoGuardar }: ContactoFichaRealProps) {
  const { t, language } = useTranslation();
  const anunciar = useAnunciar();
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<FormularioContacto | null>(null);
  const [faltaChave, setFaltaChave] = useState<string | null>(null);
  const [invalido, setInvalido] = useState<"email" | "telefone" | null>(null);
  const executar = useExecutarAcao();
  const botaoEditar = useRef<HTMLButtonElement>(null);
  const campoTelefone = useRef<HTMLInputElement>(null);
  const campoEmail = useRef<HTMLInputElement>(null);
  const jaAbriu = useRef(false);
  const enviado = useRef<DadosContactoFormulario | null>(null);
  const atual = { telefone, email, contacto: contactoPreferido, hora: horaPreferida, lingua };

  // O foco vai para o primeiro campo ao abrir e volta ao botão de editar ao fechar.
  useEffect(() => {
    if (aberto) { jaAbriu.current = true; campoTelefone.current?.focus(); } else if (jaAbriu.current) botaoEditar.current?.focus();
  }, [aberto]);

  // Um email ou telefone que a base diz ser de outra pessoa marca o campo e leva-lhe o foco.
  useEffect(() => {
    const campo = campoDoErroRepetido(executar.erro, enviado.current);
    if (!campo) return;
    setInvalido(campo);
    (campo === "email" ? campoEmail : campoTelefone).current?.focus();
  }, [executar.erro]);

  const abrir = () => { setForm(formularioDeContacto(atual)); setFaltaChave(null); setInvalido(null); setAberto(true); };
  const mudar = (parte: Partial<FormularioContacto>) => { setFaltaChave(null); setInvalido(null); setForm((f) => (f ? { ...f, ...parte } : f)); };
  const fechar = () => setAberto(false);

  const guardar = () => {
    if (!form) return;
    const pedido = pedidoDeContacto(form, atual);
    if (pedido.estado === "falta") {
      setFaltaChave(`${C}${pedido.chaveErro}`);
      setInvalido(pedido.campo);
      (pedido.campo === "email" ? campoEmail : campoTelefone).current?.focus();
      return;
    }
    if (pedido.estado === "semAlteracao") { fechar(); return; }
    const mensagem = t(`${C}saved`);
    enviado.current = pedido.dados;
    executar.executar(() => aoGuardar(pedido.dados).then(() => undefined), () => { fechar(); anunciar(mensagem); }, mensagem);
  };

  const idErro = `${id}-erro`;
  const idDica = `${id}-dica`;
  const idErroBase = `${id}-erro-base`;
  const ligar = (campo: "email" | "telefone") => {
    const ids = [invalido === campo && faltaChave ? idErro : null, invalido === campo && executar.erro ? idErroBase : null, idDica].filter(Boolean).join(" ");
    return { "aria-invalid": invalido === campo ? (true as const) : undefined, "aria-describedby": ids };
  };
  const semIndicacao = t(`${C}notSet`);
  const nomeLingua = (l: string): string => (LINGUAS_GRAVAVEIS.includes(l) ? t(`${C}language.${l}`) : nomeDeIdioma(l, language));
  const linguaAtual = lingua?.trim() || "";
  return (
    <Seccao titulo={t(`${C}title`)}>
      {!aberto || !form ? (
        <>
          <ListaCampos>
            <LinhaCampo rotulo={t(`${C}phone`)}>{telefone || semIndicacao}</LinhaCampo>
            <LinhaCampo rotulo={t(`${C}email`)}>{email || semIndicacao}</LinhaCampo>
            <LinhaCampo rotulo={t(`${C}preferred`)}>{contactoPreferido ? t(`${C}preferred.${contactoPreferido}`) : semIndicacao}</LinhaCampo>
            <LinhaCampo rotulo={t(`${C}time`)}>{horaPreferida ? t(`${C}time.${horaPreferida}`) : semIndicacao}</LinhaCampo>
            <LinhaCampo rotulo={t(`${C}language`)}>{linguaAtual ? nomeLingua(linguaAtual) : semIndicacao}</LinhaCampo>
          </ListaCampos>
          {podeEditar && (
            <Button ref={botaoEditar} type="button" variant="outline" className={cn("mt-3 min-h-11", FOCO)} onClick={abrir}>{t(`${C}edit`)}</Button>
          )}
        </>
      ) : (
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); if (!executar.aGuardar) guardar(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id={`${id}-telefone`} rotulo={t(`${C}phone`)}>
              {/* Com o seletor do indicativo do país: o valor é «+<indicativo><número>». */}
              <TelefoneNovaLead
                id={`${id}-telefone`} idRotulo={`${id}-telefone-rotulo`} campoRef={campoTelefone} maxLength={30}
                valor={form.telefone} aoMudar={(telefone) => mudar({ telefone })}
                invalido={invalido === "telefone"} idDescricao={ligar("telefone")["aria-describedby"]}
              />
            </Campo>
            <Campo id={`${id}-email`} rotulo={t(`${C}email`)}>
              <Input
                id={`${id}-email`} ref={campoEmail} type="email" autoComplete="off" className="min-h-11" maxLength={254}
                value={form.email} onChange={(e) => mudar({ email: e.target.value })} {...ligar("email")}
              />
            </Campo>
          </div>
          <p id={idDica} className="text-sm text-muted-foreground">{t(`${C}hint`)}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo id={`${id}-preferido`} rotulo={t(`${C}preferred`)}>
              <select
                id={`${id}-preferido`} className={cn(CLASSE_SELECT, FOCO)} value={form.contacto}
                onChange={(e) => mudar({ contacto: e.target.value as ContactoPreferido | "" })}
              >
                <option value="">{t(`${C}preferred.none`)}</option>
                {CONTACTOS_PREFERIDOS.map((c) => <option key={c} value={c}>{t(`${C}preferred.${c}`)}</option>)}
              </select>
            </Campo>
            <Campo id={`${id}-hora`} rotulo={t(`${C}time`)}>
              <select
                id={`${id}-hora`} className={cn(CLASSE_SELECT, FOCO)} value={form.hora}
                onChange={(e) => mudar({ hora: e.target.value as HoraPreferida | "" })}
              >
                <option value="">{t(`${C}time.none`)}</option>
                {HORAS_PREFERIDAS.map((h) => <option key={h} value={h}>{t(`${C}time.${h}`)}</option>)}
              </select>
            </Campo>
            <Campo id={`${id}-lingua`} rotulo={t(`${C}language`)}>
              <select id={`${id}-lingua`} className={cn(CLASSE_SELECT, FOCO)} value={form.lingua} onChange={(e) => mudar({ lingua: e.target.value })}>
                {linguaAtual === "" && <option value="">{semIndicacao}</option>}
                {opcoesDeLingua(linguaAtual).map((l) => <option key={l} value={l}>{nomeLingua(l)}</option>)}
              </select>
            </Campo>
          </div>
          {faltaChave && <p id={idErro} role="alert" className="text-sm font-medium text-destructive">{t(faltaChave)}</p>}
          <ErroAcao id={idErroBase} chave={executar.erro} chaveExtra={executar.erroExtra} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit" className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
              aria-disabled={executar.aGuardar || undefined} aria-busy={executar.aGuardar || undefined}
            >
              {t(executar.aGuardar ? "pessoasPagina.real.ficha.saving" : `${C}save`)}
            </Button>
            <Button
              type="button" variant="outline" className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
              onClick={() => { if (!executar.aGuardar) fechar(); }} aria-disabled={executar.aGuardar || undefined}
            >
              {t(`${C}cancel`)}
            </Button>
          </div>
        </form>
      )}
    </Seccao>
  );
}
