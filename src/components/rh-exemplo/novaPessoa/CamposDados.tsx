// A aba "Dados pessoais" do painel "Nova pessoa": identificação, contactos e morada. Todos os campos ficam por baixo de uma
// linha fina (a secção das fichas); só o nome e o apelido são obrigatórios.
import { Seccao } from "@/components/ficha-comum/Seccao";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { GENEROS } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";
import { idCampo, type CamposNovaProps } from "./tiposCampos";
import type { CampoNova } from "./valores";

const GRELHA = "grid gap-4 sm:grid-cols-2";

function Texto({ campo, props, tipo, ajuda, obrigatorio, placeholder }: {
  campo: Exclude<CampoNova, "localId" | "cargoId" | "papelId">;
  props: CamposNovaProps;
  tipo?: "text" | "email" | "date" | "tel";
  ajuda?: string;
  obrigatorio?: boolean;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  return (
    <CampoTexto
      id={idCampo(campo)} label={t(`rhForm.nova.f.${campo}`)} valor={props.valores[campo]} tipo={tipo}
      onChange={(valor) => props.definir({ [campo]: valor })} erro={props.erro(campo)} ajuda={ajuda}
      obrigatorio={obrigatorio} placeholder={placeholder}
    />
  );
}

export function CamposDados(props: CamposNovaProps) {
  const { t } = useTranslation();
  const { valores, definir } = props;
  return (
    <div className="space-y-4">
      <Seccao titulo={t("rhForm.nova.sec.identificacao")}>
        <div className={GRELHA}>
          <Texto campo="nome" props={props} obrigatorio />
          <Texto campo="apelido" props={props} obrigatorio />
          <Texto campo="dataNascimento" props={props} tipo="date" />
          <CampoSelect
            id="rh-nova-genero" label={t("rhForm.nova.f.genero")} valor={valores.genero} vazioLabel={t("rhForm.nova.semGenero")}
            opcoes={GENEROS.map((g) => ({ value: g, label: t(`hr.genero.${g}`) }))}
            onChange={(valor) => definir({ genero: valor as typeof valores.genero })}
          />
          <Texto campo="nif" props={props} ajuda={t("rhForm.nova.h.nif")} />
          <Texto campo="niss" props={props} ajuda={t("rhForm.nova.h.niss")} />
        </div>
      </Seccao>
      <Seccao titulo={t("rhForm.nova.sec.contactos")}>
        <div className={GRELHA}>
          <Texto campo="emailPessoal" props={props} tipo="email" />
          <Texto campo="telefonePessoal" props={props} tipo="tel" />
        </div>
      </Seccao>
      <Seccao titulo={t("rhForm.nova.sec.morada")}>
        <div className={GRELHA}>
          <Texto campo="moradaLinha1" props={props} />
          <Texto campo="moradaCodigoPostal" props={props} ajuda={t("rhForm.nova.h.moradaCodigoPostal")} placeholder="0000-000" />
          <Texto campo="moradaLocalidade" props={props} />
          <Texto campo="moradaDistrito" props={props} />
        </div>
      </Seccao>
    </div>
  );
}
