/**
 * A zona de anexos do dialogo "Nova pessoa": cartao de cidadao (ate 2),
 * comprovativo de IBAN (1) e fotografia (1), 4 ficheiros no total. Os ficheiros
 * ficam em memoria e SO sao enviados depois de a ficha ser criada (so entao ha
 * `pessoa_id`); se algum falhar, a ficha fica criada e o aviso diz "Anexos".
 *
 * PRESENTACIONAL: recebe o resultado de `useAnexosNovaPessoa` e as permissoes de
 * escrita. Desenha uma linha por tipo que quem cria pode escrever; sem nenhuma
 * das tres permissoes nao desenha nada. `desactivado` (durante a criacao) fecha
 * os seletores e os botoes de retirar.
 */
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MiniaturaLocal } from "@/components/hr/anexos/Miniaturas";
import { SeletorFicheiroAnexo } from "@/components/hr/anexos/SeletorFicheiroAnexo";
import { useTranslation } from "@/hooks/useTranslation";
import type { ResultadoAnexosNovaPessoa } from "@/hooks/useAnexosNovaPessoa";
import {
  LIMITES_ANEXOS,
  chaveDeErroAnexoRh,
  formatarTamanho,
  podeAnexarTipo,
  type PermissoesEscritaAnexos,
  type TipoAnexoRh,
} from "@/lib/hr/anexosRh";
import { TIPOS_ANEXO_CONVITE } from "@/lib/hr/conviteAnexos";

type EstadoZona = Pick<
  ResultadoAnexosNovaPessoa,
  "ficheiros" | "erroEscolha" | "aEnviar" | "envios" | "escolher" | "retirar"
>;

interface ZonaAnexosNovaPessoaProps {
  estado: EstadoZona;
  permissoes: PermissoesEscritaAnexos;
  /** A ficha esta a ser criada: nada se escolhe nem se retira. */
  desactivado: boolean;
}

export function ZonaAnexosNovaPessoa({ estado, permissoes, desactivado }: ZonaAnexosNovaPessoaProps) {
  const { t, language } = useTranslation();
  const tipos = TIPOS_ANEXO_CONVITE.filter((tipo) => podeAnexarTipo(tipo, permissoes));
  if (tipos.length === 0) return null;

  const total = TIPOS_ANEXO_CONVITE.reduce((soma, tipo) => soma + estado.ficheiros[tipo].length, 0);

  return (
    <section aria-labelledby="hr-novo-anexos-titulo" className="space-y-2 border-t px-5 py-3">
      <div>
        <h3 id="hr-novo-anexos-titulo" className="text-sm font-medium">
          {t("hr.anexos.novaPessoa.titulo")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("hr.anexos.novaPessoa.ajuda")}</p>
      </div>
      <ul className="max-h-40 divide-y overflow-y-auto">
        {tipos.map((tipo) => (
          <LinhaNova
            key={tipo}
            tipo={tipo}
            estado={estado}
            desactivado={desactivado}
            cheio={
              estado.ficheiros[tipo].length >= LIMITES_ANEXOS.porTipo[tipo] ||
              total >= LIMITES_ANEXOS.maxActivos
            }
            idioma={language as "pt" | "en" | "es" | "fr" | "de"}
          />
        ))}
      </ul>
    </section>
  );
}

interface LinhaNovaProps {
  tipo: TipoAnexoRh;
  estado: EstadoZona;
  desactivado: boolean;
  cheio: boolean;
  idioma: "pt" | "en" | "es" | "fr" | "de";
}

function LinhaNova({ tipo, estado, desactivado, cheio, idioma }: LinhaNovaProps) {
  const { t } = useTranslation();
  const rotulo = t(`hr.anexos.tipo.${tipo}`);
  const idAjuda = `hr-novo-anexo-ajuda-${tipo}`;
  const itens = estado.ficheiros[tipo];
  const enviosEmCurso = Object.entries(estado.envios).filter(([, e]) => e.tipo === tipo && e.fase !== "erro");
  const erroEscolha = estado.erroEscolha?.tipo === tipo ? estado.erroEscolha.codigo : null;

  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="w-44 shrink-0 font-medium">{rotulo}</span>
        <span id={idAjuda} className="min-w-0 flex-1 text-xs text-muted-foreground">
          {t(tipo === "fotografia" ? "hr.anexos.ajudaFotografia" : "hr.anexos.ajudaFicheiros")}
        </span>
        <SeletorFicheiroAnexo
          tipo={tipo}
          accao="anexar"
          alvo={rotulo}
          idAlvo={tipo}
          desactivado={desactivado || cheio}
          descritoPor={idAjuda}
          onEscolher={(file) => estado.escolher(tipo, file)}
        />
      </div>

      {erroEscolha && (
        <p role="alert" className="text-xs text-destructive">
          {t(chaveDeErroAnexoRh(erroEscolha))}
        </p>
      )}

      {itens.map((item, indice) => (
        <div key={item.id} className="flex items-center gap-2">
          <MiniaturaLocal file={item.file} alt={rotulo} />
          <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatarTamanho(item.file.size, idioma)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={desactivado}
            aria-label={`${t("hr.anexos.retirar")}: ${item.file.name}`}
            onClick={() => estado.retirar(tipo, indice)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
          {item.codigoErro && (
            <p role="alert" className="basis-full text-xs text-destructive">
              {t(chaveDeErroAnexoRh(item.codigoErro))}
            </p>
          )}
        </div>
      ))}

      {enviosEmCurso.map(([id, envio]) => (
        <div key={id} className="space-y-1">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{envio.nome}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {envio.fase === "a_verificar" ? t("hr.anexos.aVerificar") : t("hr.anexos.aEnviar")}
            </span>
          </div>
          {envio.fase === "a_enviar" && (
            <Progress
              value={envio.progresso}
              className="h-2"
              aria-label={t("hr.anexos.progresso", { nome: envio.nome })}
            />
          )}
        </div>
      ))}
    </li>
  );
}
