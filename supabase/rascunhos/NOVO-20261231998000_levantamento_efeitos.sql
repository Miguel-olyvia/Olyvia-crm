-- RASCUNHO, NADA APLICADO. Base RH. Nao e uma migration ate ser revista (ecc:database-reviewer e ecc:security-reviewer) e passar para supabase/migrations.
-- Levantamento configuravel com efeito no orcamento: cada pergunta e cada opcao declaram se afetam o orcamento e como.
--
-- ESTADO: INCOMPLETO. Esta parte so acrescenta as colunas e as verificacoes de forma. FALTA reescrever, a partir da versao MAIS RECENTE de cada uma
-- (supabase/migrations/20261231100000_qualificacao_negocio_e_contacto.sql, confirmar no remoto antes), estas tres funcoes, para aceitarem, validarem e devolverem
-- as chaves novas (hoje recusam chaves desconhecidas: NG009):
--   fn_neg_questionario_normalizar  - aceitar campo_emylia, efeito_modo, efeito (pergunta) e valor_emylia, efeito (opcao); recusar o resto como hoje;
--   neg_guardar_questionario        - gravar as colunas novas; mudar so o efeito TEM de subir a versao do questionario;
--   neg_questionario_levantamento   - devolver as colunas novas (a visita precisa delas para a nota ao vivo e para o orcamento).
-- Ausente na entrada = valor neutro (campo_emylia nulo, efeito_modo nulo, efeito vazio): o que o editor nao envia fica limpo.
--
-- O CODIGO QUE USA ISTO JA ESTA ESCRITO e entra no mesmo dia que a migration (ver 'Mudar um lado da fronteira'): src/hooks/pessoas/workflow/questionario.ts
-- (editor), src/components/negocio-metas/questionarioForm.ts (leitura) e src/components/pessoas/negocioEmylia/visitaConfiguravel/. Enquanto a migration nao existir,
-- o editor so manda estas chaves quando alguem as preenche (e a base devolve NG009, que se mostra), e a visita nao tem nada configurado.
-- Mudelar: so colunas novas com omissao neutra, sem mudanca de comportamento. Testes ANTES do db push, contra o remoto ainda por corrigir.

ALTER TABLE public.levantamento_perguntas
  ADD COLUMN IF NOT EXISTS campo_emylia text,
  ADD COLUMN IF NOT EXISTS efeito_modo  text,
  ADD COLUMN IF NOT EXISTS efeito       jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.levantamento_opcoes
  ADD COLUMN IF NOT EXISTS valor_emylia text,
  ADD COLUMN IF NOT EXISTS efeito       jsonb NOT NULL DEFAULT '[]'::jsonb;

-- efeito_modo nulo = omissao (o efeito que a Emylia ja tem no campo ligado, se o tiver; senao nenhum).
ALTER TABLE public.levantamento_perguntas
  ADD CONSTRAINT levantamento_perguntas_efeito_modo_chk CHECK (efeito_modo IS NULL OR efeito_modo IN ('nenhum', 'emylia', 'proprio')),
  ADD CONSTRAINT levantamento_perguntas_campo_emylia_chk CHECK (campo_emylia IS NULL OR (length(campo_emylia) BETWEEN 1 AND 60 AND campo_emylia ~ '^[a-z0-9_]+$'));

-- A forma de um efeito: lista de ate 5 objetos {tipo, descricao, ...numeros}. A validacao fina (tipos, limites) fica na funcao de normalizar.
CREATE OR REPLACE FUNCTION public.fn_levantamento_efeito_valido(p_efeito jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT jsonb_typeof(p_efeito) = 'array' AND jsonb_array_length(p_efeito) <= 5
$$;

ALTER TABLE public.levantamento_perguntas ADD CONSTRAINT levantamento_perguntas_efeito_chk CHECK (public.fn_levantamento_efeito_valido(efeito));
ALTER TABLE public.levantamento_opcoes    ADD CONSTRAINT levantamento_opcoes_efeito_chk    CHECK (public.fn_levantamento_efeito_valido(efeito));

-- Um campo da Emylia liga-se a uma so pergunta por questionario (nunca duas respostas ao mesmo campo): indice unico parcial. Confirmar no remoto o nome da
-- coluna do questionario em levantamento_perguntas (aqui assumido questionario_id) antes de escrever a versao final.
-- CREATE UNIQUE INDEX levantamento_perguntas_campo_emylia_uq ON public.levantamento_perguntas (questionario_id, campo_emylia) WHERE campo_emylia IS NOT NULL AND activa;
