import re
import subprocess

TRANS_PATH = "src/translations/index.ts"
HR_TYPES_PATH = "src/types/hr.ts"

with open(TRANS_PATH, encoding="utf-8") as f:
    trans_text = f.read()

anchor_positions = [m.start() for m in re.finditer(r"'hr\.contrato\.activoTitulo':", trans_text)]
assert len(anchor_positions) == 5, anchor_positions

lang_starts = [(m.start(), m.group(1)) for m in re.finditer(r"^\s{2}(\w+):\s*\{", trans_text, re.MULTILINE)]
print("lang blocks found:", lang_starts)

key_pattern = re.compile(r"'([^']+)':\s*[\"']")
keys_per_block = {}
starts = [s for s, _ in lang_starts] + [len(trans_text)]
for i, (start, lang) in enumerate(lang_starts):
    end = starts[i + 1]
    region = trans_text[start:end]
    keys = set(key_pattern.findall(region))
    keys_per_block[lang] = keys

for lang, keys in keys_per_block.items():
    print(lang, len(keys))

base_lang = list(keys_per_block.keys())[0]
base_keys = keys_per_block[base_lang]
for lang, keys in keys_per_block.items():
    missing = base_keys - keys
    extra = keys - base_keys
    if missing or extra:
        print(f"MISMATCH lang={lang} missing={len(missing)} extra={len(extra)}")
        if missing:
            print("  missing sample:", list(missing)[:10])
        if extra:
            print("  extra sample:", list(extra)[:10])

all_defined_keys = base_keys

# ---------- (a) literal keys check ----------
result = subprocess.run(["git", "ls-files", "src"], capture_output=True, text=True)
if result.returncode != 0 or not result.stdout.strip():
    import glob
    src_files = glob.glob("src/**/*.ts", recursive=True) + glob.glob("src/**/*.tsx", recursive=True)
else:
    src_files = [l for l in result.stdout.splitlines() if l.endswith((".ts", ".tsx"))]

literal_pattern = re.compile(
    r'(?:\bt\(\s*|labelKey:\s*|mensagemKey:\s*|rotuloKey:\s*|tituloKey:\s*)"(hr\.[^"$]*)"'
)
literal_used = set()
for fp in src_files:
    if fp == TRANS_PATH:
        continue
    try:
        with open(fp, encoding="utf-8") as f:
            content = f.read()
    except Exception:
        continue
    for m in literal_pattern.finditer(content):
        literal_used.add(m.group(1))

missing_literal = sorted(k for k in literal_used if k not in all_defined_keys)
print("\n=== (a) LITERAL KEYS ===")
print("literal keys referenced:", len(literal_used))
print("missing literal keys:", len(missing_literal))
for k in missing_literal:
    print("  MISSING:", k)

# ---------- (b) dynamic keys check ----------
with open(HR_TYPES_PATH, encoding="utf-8") as f:
    hr_types_text = f.read()


def read_const_array(name):
    m = re.search(rf"export const {name}[^=]*=\s*\[(.*?)\]", hr_types_text, re.DOTALL)
    if not m:
        return None
    return re.findall(r'"([^"]+)"', m.group(1))


const_names = [
    "DIAS_SEMANA", "GENEROS", "ESTADOS_CIVIS", "TIPOS_DOCUMENTO",
    "CONJUGE_SITUACOES_PROFISSIONAIS", "HABILITACOES_ACADEMICAS",
    "TAMANHOS_FARDAMENTO", "ESTADOS_VINCULO", "TIPOS_CONTRATO",
    "REGIMES_TRABALHO", "CATEGORIAS_FUNCAO", "TIPOS_TRABALHO",
    "HORAS_FREQUENCIAS", "POLITICAS_FERIADOS", "PERIODICIDADES",
    "FORMATOS_CONTA", "TIPOS_LOCAL", "TIPOS_DOCUMENTO_RH",
    "ESTADOS_DOCUMENTO_RH",
]
consts = {}
for name in const_names:
    vals = read_const_array(name)
    if vals is None:
        print(f"WARNING: could not parse {name}")
    consts[name] = vals or []

prefix_to_const = {
    "hr.dias": "DIAS_SEMANA",
    "hr.genero": "GENEROS",
    "hr.estadoCivil": "ESTADOS_CIVIS",
    "hr.tipoDocumento": "TIPOS_DOCUMENTO",
    "hr.conjugeSituacaoProfissional": "CONJUGE_SITUACOES_PROFISSIONAIS",
    "hr.habilitacaoAcademica": "HABILITACOES_ACADEMICAS",
    "hr.tamanhoFardamento": "TAMANHOS_FARDAMENTO",
    "hr.estadoVinculo": "ESTADOS_VINCULO",
    "hr.tipoContrato": "TIPOS_CONTRATO",
    "hr.regime": "REGIMES_TRABALHO",
    "hr.categoriaFuncao": "CATEGORIAS_FUNCAO",
    "hr.tipoTrabalho": "TIPOS_TRABALHO",
    "hr.horasFrequencia": "HORAS_FREQUENCIAS",
    "hr.politicaFeriados": "POLITICAS_FERIADOS",
    "hr.periodicidade": "PERIODICIDADES",
    "hr.formatoConta": "FORMATOS_CONTA",
    "hr.locais.tipos": "TIPOS_LOCAL",
    "hr.tipoDocumentoRH": "TIPOS_DOCUMENTO_RH",
    "hr.estadoDocumentoRH": "ESTADOS_DOCUMENTO_RH",
}

# Extra prefixes whose possible values do NOT come from src/types/hr.ts constants.
# Sourced by hand from src/lib/hr/estadoContrato.ts, src/types/hrAusencias.ts,
# src/types/hrAssiduidade.ts and src/lib/hr/novaPessoa.ts.
extra_prefix_values = {
    "hr.estadoAcesso": ["ativo", "convidado", "semConta"],
    "hr.estadoContrato": ["sem_contrato", "em_curso", "por_iniciar", "suspenso", "terminado"],
    "hr.ausencias.estado": ["pendente_chefia", "pendente_rh", "aprovado", "recusado", "cancelado"],
    "hr.ausencias.estadoDia": ["pendente", "aprovado", "recusado", "cancelado"],
    "hr.ausencias.passo": ["chefia", "rh"],
    "hr.ausencias.situacao": [
        "aberto", "dispensado", "aprovado", "recusado", "ajustado", "devolvido", "porChegar",
    ],
    "hr.ausencias.motivoAjuste": [
        "correccao", "transporte_periodo_anterior", "troca_por_dinheiro",
        "premio", "acerto_admissao", "acerto_cessacao", "outro",
    ],
    "hr.assiduidade.motivoFalta": [
        "doenca", "assuntos_pessoais", "atraso", "saida_antecipada",
        "ausencia_nao_comunicada", "greve", "formacao", "luto", "outro",
    ],
    "hr.assiduidade.tipoDocumento": [
        "atestado_medico", "declaracao_medica", "convocatoria", "obito",
        "declaracao_entidade", "declaracao_propria", "outro",
    ],
    "hr.assiduidade.desvios.tipo": [
        "planeado_sem_realizado", "realizado_sem_planeado", "pendente_par",
        "falta_coberta_por_ausencia",
    ],
    "hr.assiduidade.justificacao.estado": [
        "sem_justificacao", "pendente_documento", "justificada", "recusada",
    ],
    "hr.assiduidade.situacao": ["coberto", "parcial", "emFalta", "semHoras"],
    "hr.assiduidade.sentido": ["entrada", "saida"],
    "hr.assiduidade.origem": ["app", "web", "importacao", "manual_rh"],
    "hr.assiduidade.tipoCorreccao": [
        "hora_errada", "sentido_errado", "local_errado", "duplicada", "esquecida", "outro",
    ],
    "hr.horario.origens": ["manual", "picagem", "importacao"],
    "hr.horario.estados": ["registado", "validado", "rejeitado"],
    "hr.form.seccoes": ["geral", "pessoais", "laborais", "contrato", "acesso"],
    "hr.assiduidade.motivo": None,  # special-cased below: <tipo>.titulo / <tipo>.descricao
}

print("\n=== (b) DYNAMIC KEYS (from types/hr.ts constants) ===")
missing_dynamic = []
for prefix, const_name in prefix_to_const.items():
    for v in consts[const_name]:
        key = f"{prefix}.{v}"
        if key not in all_defined_keys:
            missing_dynamic.append(key)
print("expanded keys checked:", sum(len(v) for v in consts.values()))
print("missing:", len(missing_dynamic))
for k in missing_dynamic:
    print("  MISSING:", k)

print("\n=== (b-extra) DYNAMIC KEYS (values found outside types/hr.ts) ===")
missing_extra = []
for prefix, values in extra_prefix_values.items():
    if values is None:
        for tipo in ["anularPicagem", "anularFalta", "rejeitarRealizado", "recusarJustificacao"]:
            for suffix in ["titulo", "descricao"]:
                key = f"{prefix}.{tipo}.{suffix}"
                if key not in all_defined_keys:
                    missing_extra.append(key)
        continue
    for v in values:
        key = f"{prefix}.{v}"
        if key not in all_defined_keys:
            missing_extra.append(key)
print("missing:", len(missing_extra))
for k in missing_extra:
    print("  MISSING:", k)

print("\n=== SUMMARY ===")
print("literal missing:", len(missing_literal))
print("dynamic (hr.ts consts) missing:", len(missing_dynamic))
print("dynamic (extra) missing:", len(missing_extra))
