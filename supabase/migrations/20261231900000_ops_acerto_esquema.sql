-- Acerto das Operações: o esquema ops_* que existe na base RH (uetjghdkwbywbftedtth) e não estava em nenhuma migration.
-- Gerado a 27/10/2026 a partir do catálogo da base (só leitura). Só cria o que falta: na base RH não muda nada;
-- numa base sem as Operações, cria-as tal como estão na RH. Não apaga, não renomeia, não altera objetos existentes.
-- 53 tabelas, 565 colunas, 225 restrições, 56 índices,
-- 212 funções, 20 vistas, 14 gatilhos, 85 políticas.

SET check_function_bodies = off;
SET lock_timeout = '5s';

-- 1. Tabelas
DO $do$ BEGIN
  IF to_regclass('public.ops_anexo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_anexo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  ordem_id uuid,
  ordem_tarefa_id uuid,
  ativo_id uuid,
  nome text NOT NULL,
  ficheiro_url text,
  mime text,
  tamanho integer,
  carregado_por uuid,
  carregado_em timestamp with time zone DEFAULT now() NOT NULL,
  caminho text,
  legenda text,
  privado boolean DEFAULT false NOT NULL
)$tb$;
    ALTER TABLE public.ops_anexo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_anexo FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_anexo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_anexo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_area') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_area (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  nome text NOT NULL,
  posicao integer DEFAULT 0 NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_area ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_area FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_area TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_area TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_area_tipo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_area_tipo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  area_id uuid NOT NULL,
  nome text NOT NULL,
  posicao integer DEFAULT 0 NOT NULL,
  ativo boolean DEFAULT true NOT NULL
)$tb$;
    ALTER TABLE public.ops_area_tipo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_area_tipo FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_area_tipo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_area_tipo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_assinatura') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_assinatura (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  ordem_id uuid NOT NULL,
  nome text NOT NULL,
  qualidade text,
  caminho text NOT NULL,
  recolhida_por uuid,
  assinada_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_assinatura ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_assinatura FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_assinatura TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_assinatura TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_ativo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_ativo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  local_id uuid NOT NULL,
  categoria_id uuid,
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  marca text,
  modelo text,
  num_serie text,
  criticidade text DEFAULT 'normal'::text NOT NULL,
  data_instalacao date,
  garantia_ate date,
  foto_url text,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  centro_custo_id uuid
)$tb$;
    ALTER TABLE public.ops_ativo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_ativo FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_ativo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_ativo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_categoria_ativo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_categoria_ativo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  parent_id uuid,
  codigo text NOT NULL,
  nome text NOT NULL
)$tb$;
    ALTER TABLE public.ops_categoria_ativo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_categoria_ativo FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_categoria_ativo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_categoria_ativo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_centro_custo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_centro_custo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  codigo text NOT NULL,
  nome text NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_centro_custo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_centro_custo FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_centro_custo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_centro_custo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_checklist') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_checklist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  codigo text NOT NULL,
  nome text NOT NULL,
  versao integer DEFAULT 1 NOT NULL,
  estado text DEFAULT 'rascunho'::text NOT NULL,
  criada_em timestamp with time zone DEFAULT now() NOT NULL,
  publicada_em timestamp with time zone
)$tb$;
    ALTER TABLE public.ops_checklist ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_checklist FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_checklist TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_checklist TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_checklist_tarefa') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_checklist_tarefa (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  checklist_id uuid NOT NULL,
  posicao integer DEFAULT 0 NOT NULL,
  codigo text,
  nome text NOT NULL,
  descricao text,
  tipo text DEFAULT 'inspecao'::text NOT NULL,
  unidade text,
  limite_min numeric(12,3),
  limite_max numeric(12,3),
  obrigatoria boolean DEFAULT true NOT NULL,
  foto_obrigatoria boolean DEFAULT false NOT NULL,
  tempo_estimado integer DEFAULT 0 NOT NULL,
  skill_id uuid,
  privada boolean DEFAULT false NOT NULL
)$tb$;
    ALTER TABLE public.ops_checklist_tarefa ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_checklist_tarefa FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_checklist_tarefa TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_checklist_tarefa TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_checklist_tarefa_medicao') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_checklist_tarefa_medicao (
  checklist_tarefa_id uuid NOT NULL,
  medicao_def_id uuid NOT NULL,
  posicao integer DEFAULT 0 NOT NULL
)$tb$;
    ALTER TABLE public.ops_checklist_tarefa_medicao ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_checklist_tarefa_medicao FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_checklist_tarefa_medicao TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_checklist_tarefa_medicao TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_custo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_custo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ordem_id uuid NOT NULL,
  tipo text NOT NULL,
  descricao text NOT NULL,
  quantidade numeric(12,3) DEFAULT 1 NOT NULL,
  valor_unit numeric(12,2) DEFAULT 0 NOT NULL,
  total numeric(12,2) DEFAULT 0 NOT NULL,
  origem text DEFAULT 'manual'::text NOT NULL,
  produto_id uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  catalog_item_id uuid,
  compra_linha_id uuid,
  unidade text,
  criado_por uuid
)$tb$;
    ALTER TABLE public.ops_custo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_custo FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_custo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_custo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_definicao') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_definicao (
  organization_id uuid NOT NULL,
  chave text NOT NULL,
  valor text NOT NULL,
  atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizada_por uuid
)$tb$;
    ALTER TABLE public.ops_definicao ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_definicao FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_definicao TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_definicao TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_entrar_como_log') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_entrar_como_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  alvo_id uuid NOT NULL,
  inicio timestamp with time zone DEFAULT now() NOT NULL,
  fim timestamp with time zone,
  user_agent text
)$tb$;
    ALTER TABLE public.ops_entrar_como_log ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_entrar_como_log FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.ops_entrar_como_log TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_entrar_como_log TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_evento') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_evento (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  entidade text NOT NULL,
  entidade_id uuid NOT NULL,
  tipo text NOT NULL,
  descricao text,
  autor_id uuid,
  antes jsonb,
  depois jsonb,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_evento ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_evento FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_evento TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_evento TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_horario') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_horario (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  nome text NOT NULL,
  horas_semana numeric(5,2) DEFAULT 40 NOT NULL,
  horas_dia numeric(4,2) DEFAULT 8 NOT NULL
)$tb$;
    ALTER TABLE public.ops_horario ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_horario FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_horario TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_horario TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_local') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_local (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  parent_id uuid,
  codigo text NOT NULL,
  nome text NOT NULL,
  tipo text DEFAULT 'morada'::text NOT NULL,
  morada text,
  cidade text,
  cod_postal text,
  zona text,
  notas text,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  address_id uuid,
  latitude numeric(10,8),
  longitude numeric(11,8)
)$tb$;
    ALTER TABLE public.ops_local ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_local FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_local TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_local TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_medicao_def') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_medicao_def (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  categoria_ativo_id uuid,
  nome text NOT NULL,
  tipo text DEFAULT 'gama'::text NOT NULL,
  unidade text,
  limite_min numeric(12,3),
  limite_max numeric(12,3),
  documentacao_obrigatoria boolean DEFAULT false NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_medicao_def ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_medicao_def FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_medicao_def TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_medicao_def TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_medicao_opcao') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_medicao_opcao (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  medicao_def_id uuid NOT NULL,
  nome text NOT NULL,
  posicao integer DEFAULT 0 NOT NULL,
  cria_corretiva boolean DEFAULT false NOT NULL,
  e_nao_conforme boolean DEFAULT false NOT NULL
)$tb$;
    ALTER TABLE public.ops_medicao_opcao ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_medicao_opcao FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_medicao_opcao TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_medicao_opcao TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_mensagem') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_mensagem (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ordem_id uuid NOT NULL,
  canal text DEFAULT 'interno'::text NOT NULL,
  autor_id uuid,
  texto text NOT NULL,
  criada_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_mensagem ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_mensagem FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_mensagem TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_mensagem TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_motivo_pausa') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_motivo_pausa (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  nome text NOT NULL,
  posicao integer DEFAULT 0 NOT NULL,
  funcoes text[] DEFAULT ARRAY['admin'::text, 'gestor'::text, 'operador'::text, 'tecnico'::text] NOT NULL,
  exige_retoma boolean DEFAULT true NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_motivo_pausa ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_motivo_pausa FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_motivo_pausa TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_motivo_pausa TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  codigo text NOT NULL,
  cliente_id uuid,
  orcamento_id uuid,
  contrato_id uuid,
  modelo_id uuid,
  titulo text NOT NULL,
  morada text,
  notas text,
  estado text DEFAULT 'planeada'::text NOT NULL,
  data_inicio_prevista date,
  iniciada_em timestamp with time zone,
  concluida_em timestamp with time zone,
  motivo_estado text,
  gestor_id uuid,
  supervisor_id uuid,
  tolerancia_percent integer DEFAULT 10 NOT NULL,
  minutos_por_dia integer DEFAULT 480 NOT NULL,
  criada_por uuid,
  criada_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
  hora_inicio_dia time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
  inicio_auto boolean
)$tb$;
    ALTER TABLE public.ops_obra ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_obra TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_aviso') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_aviso (
  obra_id uuid NOT NULL,
  tipo text NOT NULL,
  organization_id uuid NOT NULL,
  chave text NOT NULL,
  enviado_em timestamp with time zone DEFAULT now() NOT NULL,
  destinatarios uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  sem_especialidade boolean DEFAULT false NOT NULL,
  detalhe jsonb DEFAULT '{}'::jsonb NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_aviso ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_aviso FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.ops_obra_aviso TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_aviso TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_extra') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_extra (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  obra_id uuid NOT NULL,
  tarefa_id uuid,
  descricao text NOT NULL,
  valor_estimado numeric(12,2),
  fotos text[] DEFAULT '{}'::text[] NOT NULL,
  estado text DEFAULT 'registado'::text NOT NULL,
  motivo_recusa text,
  registado_por uuid,
  registado_em timestamp with time zone DEFAULT now() NOT NULL,
  decidido_por uuid,
  decidido_em timestamp with time zone,
  enviado_em timestamp with time zone
)$tb$;
    ALTER TABLE public.ops_obra_extra ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_extra FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_obra_extra TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_extra TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_fase') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_fase (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  obra_id uuid NOT NULL,
  ordem smallint NOT NULL,
  nome text NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_fase ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_fase FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_obra_fase TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_fase TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_modelo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_modelo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  tipo_servico text,
  catalog_item_id uuid,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  por_defeito boolean DEFAULT false NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_modelo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_modelo FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_obra_modelo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_modelo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_modelo_fase') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_modelo_fase (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  modelo_id uuid NOT NULL,
  ordem smallint NOT NULL,
  nome text NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_modelo_fase ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_modelo_fase FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_obra_modelo_fase TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_modelo_fase TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_modelo_tarefa') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_modelo_tarefa (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  modelo_id uuid NOT NULL,
  modelo_fase_id uuid NOT NULL,
  ordem integer DEFAULT 0 NOT NULL,
  nome text NOT NULL,
  procedimento text,
  materiais text,
  ferramentas text,
  minutos_previstos integer DEFAULT 60 NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_modelo_tarefa ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_modelo_tarefa FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_obra_modelo_tarefa TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_modelo_tarefa TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_registo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_registo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  obra_id uuid NOT NULL,
  tarefa_id uuid NOT NULL,
  utilizador_id uuid NOT NULL,
  inicio timestamp with time zone DEFAULT now() NOT NULL,
  fim timestamp with time zone
)$tb$;
    ALTER TABLE public.ops_obra_registo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_registo FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_obra_registo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_registo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_ritmo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_ritmo (
  organization_id uuid NOT NULL,
  servico_tarefa_id uuid NOT NULL,
  fatores_chave text DEFAULT ''::text NOT NULL,
  n integer NOT NULL,
  minutos_fixos numeric(10,2) NOT NULL,
  minutos_por_unidade numeric(10,3) NOT NULL,
  padrao_fixos numeric(10,2) NOT NULL,
  padrao_por_unidade numeric(10,3) NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_ritmo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_ritmo FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.ops_obra_ritmo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_ritmo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_ritmo_historico') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_ritmo_historico (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  servico_tarefa_id uuid NOT NULL,
  fatores_chave text DEFAULT ''::text NOT NULL,
  tarefa_id uuid,
  n integer NOT NULL,
  antes_fixos numeric(10,2),
  antes_por_unidade numeric(10,3),
  depois_fixos numeric(10,2) NOT NULL,
  depois_por_unidade numeric(10,3) NOT NULL,
  em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_ritmo_historico ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_ritmo_historico FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.ops_obra_ritmo_historico TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_ritmo_historico TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_servico_perfil') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_servico_perfil (
  organization_id uuid NOT NULL,
  servico_id uuid NOT NULL,
  tipo text,
  medidas jsonb DEFAULT '{}'::jsonb NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_por uuid,
  planear boolean DEFAULT true NOT NULL,
  medida_para text
)$tb$;
    ALTER TABLE public.ops_obra_servico_perfil ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_servico_perfil FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.ops_obra_servico_perfil TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_servico_perfil TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_servico_tarefa') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_servico_tarefa (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  servico_id uuid NOT NULL,
  ordem integer NOT NULL,
  nome text NOT NULL,
  fase smallint DEFAULT 3 NOT NULL,
  minutos_por_unidade numeric(10,2) DEFAULT 0 NOT NULL,
  minutos_fixos integer DEFAULT 0 NOT NULL,
  pessoas smallint DEFAULT 1 NOT NULL,
  skill_id uuid,
  depende_ordem integer,
  procedimento text,
  materiais text,
  ferramentas text,
  origem text DEFAULT 'manual'::text NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_por uuid,
  chave text,
  depende_chaves text[] DEFAULT '{}'::text[] NOT NULL,
  espera_antes_horas numeric(6,1) DEFAULT 0 NOT NULL,
  medida text DEFAULT 'qt'::text NOT NULL,
  condicao jsonb,
  encaixe jsonb,
  fatores text[] DEFAULT '{}'::text[] NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_servico_tarefa ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_servico_tarefa FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_obra_servico_tarefa TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_servico_tarefa TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_tarefa') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_tarefa (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  obra_id uuid NOT NULL,
  fase_id uuid NOT NULL,
  modelo_tarefa_id uuid,
  ordem integer DEFAULT 0 NOT NULL,
  nome text NOT NULL,
  procedimento text,
  materiais text,
  ferramentas text,
  minutos_previstos integer DEFAULT 60 NOT NULL,
  inicio_planeado date,
  fim_planeado date,
  depende_de uuid,
  estado text DEFAULT 'por_fazer'::text NOT NULL,
  iniciada_em timestamp with time zone,
  terminada_em timestamp with time zone,
  motivo_desvio text,
  nota_desvio text,
  validada_por uuid,
  validada_em timestamp with time zone,
  motivo_rejeicao text,
  rejeitada_em timestamp with time zone,
  criada_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
  orcamento_linha_id uuid,
  servico_id uuid,
  pessoas_previstas smallint DEFAULT 1 NOT NULL,
  servico_tarefa_id uuid,
  skill_id uuid,
  materiais_crm jsonb DEFAULT '[]'::jsonb NOT NULL,
  inicio_original date,
  fim_original date,
  minutos_estimativa integer,
  chave text,
  espera_antes_horas numeric(6,1) DEFAULT 0 NOT NULL,
  medida text,
  medida_qt numeric(10,2),
  medida_real numeric(10,2),
  fatores jsonb DEFAULT '{}'::jsonb NOT NULL,
  fatores_chave text DEFAULT ''::text NOT NULL,
  minutos_origem text,
  ritmo_n integer DEFAULT 0 NOT NULL,
  minutos_juntos integer DEFAULT 0 NOT NULL,
  material_chega_em date,
  material_chega_origem text,
  material_chega_nota text
)$tb$;
    ALTER TABLE public.ops_obra_tarefa ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_tarefa FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_obra_tarefa TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_tarefa TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_tarefa_atraso') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_tarefa_atraso (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  obra_id uuid NOT NULL,
  tarefa_id uuid NOT NULL,
  motivo text NOT NULL,
  contexto text NOT NULL,
  minutos_extra integer,
  novo_fim date,
  fim_anterior date,
  registado_por uuid,
  registado_em timestamp with time zone DEFAULT now() NOT NULL,
  cliente_avisado boolean DEFAULT false NOT NULL,
  cliente_avisado_em timestamp with time zone,
  cliente_avisado_por uuid,
  nota_cliente text
)$tb$;
    ALTER TABLE public.ops_obra_tarefa_atraso ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_tarefa_atraso FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.ops_obra_tarefa_atraso TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_tarefa_atraso TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_tarefa_dependencia') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_tarefa_dependencia (
  tarefa_id uuid NOT NULL,
  depende_de_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  obra_id uuid NOT NULL,
  criada_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_tarefa_dependencia ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_tarefa_dependencia FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.ops_obra_tarefa_dependencia TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_tarefa_dependencia TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_tarefa_foto') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_tarefa_foto (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  obra_id uuid NOT NULL,
  tarefa_id uuid NOT NULL,
  caminho text NOT NULL,
  nome text NOT NULL,
  mime text,
  tamanho integer,
  legenda text,
  carregado_por uuid,
  carregado_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_tarefa_foto ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_tarefa_foto FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.ops_obra_tarefa_foto TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_tarefa_foto TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_obra_tarefa_pessoa') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_obra_tarefa_pessoa (
  tarefa_id uuid NOT NULL,
  utilizador_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  obra_id uuid NOT NULL,
  atribuida_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_obra_tarefa_pessoa ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_obra_tarefa_pessoa FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_obra_tarefa_pessoa TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_obra_tarefa_pessoa TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_ordem') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_ordem (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  codigo text NOT NULL,
  origem text NOT NULL,
  estado text DEFAULT 'agendada'::text NOT NULL,
  prioridade text DEFAULT 'normal'::text NOT NULL,
  area text,
  tipo text,
  plano_id uuid,
  cliente_id uuid NOT NULL,
  local_id uuid,
  titulo text NOT NULL,
  descricao text,
  contacto_nome text,
  contacto_telefone text,
  janela_inicio timestamp with time zone,
  janela_fim timestamp with time zone,
  responsavel_id uuid,
  agendada_para timestamp with time zone,
  aprovada_em timestamp with time zone,
  aprovada_por uuid,
  iniciada_em timestamp with time zone,
  fechada_em timestamp with time zone,
  confirmada_em timestamp with time zone,
  cancelada_em timestamp with time zone,
  motivo_cancelamento text,
  pausa_motivo text,
  pausa_retoma_prevista timestamp with time zone,
  gerada_por_tarefa_id uuid,
  criada_por uuid,
  criada_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
  orcamento_id uuid,
  tipo_trabalho_id uuid,
  centro_custo_id uuid,
  fornecedor_id uuid,
  fecha_automatico boolean DEFAULT false NOT NULL,
  pausa_motivo_id uuid,
  area_id uuid,
  area_tipo_id uuid
)$tb$;
    ALTER TABLE public.ops_ordem ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_ordem FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_ordem TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_ordem TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_ordem_alvo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_ordem_alvo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ordem_id uuid NOT NULL,
  ativo_id uuid,
  local_id uuid,
  checklist_id uuid,
  checklist_versao integer,
  posicao integer DEFAULT 0 NOT NULL
)$tb$;
    ALTER TABLE public.ops_ordem_alvo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_ordem_alvo FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_ordem_alvo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_ordem_alvo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_ordem_pessoa') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_ordem_pessoa (
  ordem_id uuid NOT NULL,
  utilizador_id uuid NOT NULL,
  papel text DEFAULT 'executante'::text NOT NULL
)$tb$;
    ALTER TABLE public.ops_ordem_pessoa ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_ordem_pessoa FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_ordem_pessoa TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_ordem_pessoa TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_ordem_previsto') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_ordem_previsto (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ordem_id uuid NOT NULL,
  quote_line_id uuid,
  posicao integer DEFAULT 0 NOT NULL,
  categoria text,
  descricao text NOT NULL,
  unidade text,
  quantidade numeric(12,3) DEFAULT 1 NOT NULL,
  custo_material numeric(12,2) DEFAULT 0 NOT NULL,
  custo_mao_obra numeric(12,2) DEFAULT 0 NOT NULL,
  total_sem_iva numeric(12,2) DEFAULT 0 NOT NULL,
  congelado_em timestamp with time zone DEFAULT now() NOT NULL,
  catalog_item_id uuid
)$tb$;
    ALTER TABLE public.ops_ordem_previsto ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_ordem_previsto FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_ordem_previsto TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_ordem_previsto TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_ordem_tarefa') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_ordem_tarefa (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ordem_id uuid NOT NULL,
  ordem_alvo_id uuid,
  posicao integer DEFAULT 0 NOT NULL,
  codigo text,
  nome text NOT NULL,
  tipo text DEFAULT 'inspecao'::text NOT NULL,
  estado text DEFAULT 'pendente'::text NOT NULL,
  valor_num numeric(12,3),
  valor_texto text,
  unidade text,
  limite_min numeric(12,3),
  limite_max numeric(12,3),
  obrigatoria boolean DEFAULT true NOT NULL,
  observacoes text,
  executada_por uuid,
  inicio timestamp with time zone,
  fim timestamp with time zone,
  tempo_estimado integer DEFAULT 0 NOT NULL,
  skill_id uuid,
  privada boolean DEFAULT false NOT NULL,
  checklist_tarefa_id uuid
)$tb$;
    ALTER TABLE public.ops_ordem_tarefa ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_ordem_tarefa FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_ordem_tarefa TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_ordem_tarefa TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_ordem_tarefa_medicao') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_ordem_tarefa_medicao (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ordem_tarefa_id uuid NOT NULL,
  medicao_def_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL,
  unidade text,
  limite_min numeric(12,3),
  limite_max numeric(12,3),
  valor_num numeric(12,3),
  valor_texto text,
  opcao_id uuid,
  conforme boolean,
  lida_em timestamp with time zone,
  lida_por uuid,
  corretiva_ordem_id uuid
)$tb$;
    ALTER TABLE public.ops_ordem_tarefa_medicao ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_ordem_tarefa_medicao FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_ordem_tarefa_medicao TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_ordem_tarefa_medicao TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_plano') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_plano (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  codigo text NOT NULL,
  nome text NOT NULL,
  cliente_id uuid NOT NULL,
  estado text DEFAULT 'ativo'::text NOT NULL,
  regra_recorrencia text,
  hora_prevista time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
  duracao_estimada integer DEFAULT 0 NOT NULL,
  responsavel_id uuid,
  inicio_em date DEFAULT CURRENT_DATE NOT NULL,
  fim_em date,
  materializado_ate date,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  tipo_recorrencia text DEFAULT 'calendario'::text NOT NULL,
  intervalo_horas integer,
  horario_id uuid
)$tb$;
    ALTER TABLE public.ops_plano ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_plano FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_plano TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_plano TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_plano_alvo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_plano_alvo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  plano_id uuid NOT NULL,
  local_id uuid,
  ativo_id uuid,
  checklist_id uuid
)$tb$;
    ALTER TABLE public.ops_plano_alvo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_plano_alvo FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_plano_alvo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_plano_alvo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_rotulo') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_rotulo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  lista text NOT NULL,
  valor text NOT NULL,
  nome text NOT NULL,
  ordem integer DEFAULT 0 NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_rotulo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_rotulo FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.ops_rotulo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_rotulo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_sequencia') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_sequencia (
  organization_id uuid NOT NULL,
  chave text NOT NULL,
  valor integer DEFAULT 0 NOT NULL
)$tb$;
    ALTER TABLE public.ops_sequencia ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_sequencia FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_sequencia TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_sequencia TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_sessao_trabalho') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_sessao_trabalho (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ordem_id uuid NOT NULL,
  utilizador_id uuid NOT NULL,
  inicio timestamp with time zone NOT NULL,
  fim timestamp with time zone,
  origem text DEFAULT 'web'::text NOT NULL,
  ordem_tarefa_id uuid,
  motivo_fim text
)$tb$;
    ALTER TABLE public.ops_sessao_trabalho ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_sessao_trabalho FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_sessao_trabalho TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_sessao_trabalho TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_skill') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_skill (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  nome text NOT NULL,
  ativo boolean DEFAULT true NOT NULL
)$tb$;
    ALTER TABLE public.ops_skill ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_skill FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.ops_skill TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_skill TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_tipo_trabalho') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_tipo_trabalho (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  codigo text NOT NULL,
  nome text NOT NULL,
  posicao integer DEFAULT 0 NOT NULL,
  fecha_automatico boolean DEFAULT false NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL
)$tb$;
    ALTER TABLE public.ops_tipo_trabalho ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_tipo_trabalho FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_tipo_trabalho TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_tipo_trabalho TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_utilizador_cliente') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_utilizador_cliente (
  utilizador_id uuid NOT NULL,
  cliente_id uuid NOT NULL
)$tb$;
    ALTER TABLE public.ops_utilizador_cliente ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_utilizador_cliente FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_utilizador_cliente TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_utilizador_cliente TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_utilizador_perfil') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_utilizador_perfil (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  utilizador_id uuid NOT NULL,
  funcao text DEFAULT 'tecnico'::text NOT NULL,
  custo_hora numeric(8,2),
  zona_base text,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  horario_id uuid
)$tb$;
    ALTER TABLE public.ops_utilizador_perfil ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_utilizador_perfil FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER ON public.ops_utilizador_perfil TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_utilizador_perfil TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_utilizador_skill') IS NULL THEN
    EXECUTE $tb$CREATE TABLE public.ops_utilizador_skill (
  utilizador_id uuid NOT NULL,
  skill_id uuid NOT NULL
)$tb$;
    ALTER TABLE public.ops_utilizador_skill ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ops_utilizador_skill FROM PUBLIC, anon, authenticated;
    GRANT REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.ops_utilizador_skill TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_utilizador_skill TO service_role;
  END IF;
END $do$;

-- 1b. Colunas que possam faltar numa tabela que já exista
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS ordem_id uuid;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS ordem_tarefa_id uuid;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS ativo_id uuid;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS ficheiro_url text;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS mime text;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS tamanho integer;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS carregado_por uuid;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS carregado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS caminho text;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS legenda text;
ALTER TABLE public.ops_anexo ADD COLUMN IF NOT EXISTS privado boolean DEFAULT false;
ALTER TABLE public.ops_area ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_area ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_area ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_area ADD COLUMN IF NOT EXISTS posicao integer DEFAULT 0;
ALTER TABLE public.ops_area ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_area ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_area_tipo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_area_tipo ADD COLUMN IF NOT EXISTS area_id uuid;
ALTER TABLE public.ops_area_tipo ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_area_tipo ADD COLUMN IF NOT EXISTS posicao integer DEFAULT 0;
ALTER TABLE public.ops_area_tipo ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_assinatura ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_assinatura ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_assinatura ADD COLUMN IF NOT EXISTS ordem_id uuid;
ALTER TABLE public.ops_assinatura ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_assinatura ADD COLUMN IF NOT EXISTS qualidade text;
ALTER TABLE public.ops_assinatura ADD COLUMN IF NOT EXISTS caminho text;
ALTER TABLE public.ops_assinatura ADD COLUMN IF NOT EXISTS recolhida_por uuid;
ALTER TABLE public.ops_assinatura ADD COLUMN IF NOT EXISTS assinada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS local_id uuid;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS categoria_id uuid;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS modelo text;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS num_serie text;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS criticidade text DEFAULT 'normal'::text;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS data_instalacao date;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS garantia_ate date;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS foto_url text;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_ativo ADD COLUMN IF NOT EXISTS centro_custo_id uuid;
ALTER TABLE public.ops_categoria_ativo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_categoria_ativo ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_categoria_ativo ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE public.ops_categoria_ativo ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_categoria_ativo ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_centro_custo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_centro_custo ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_centro_custo ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_centro_custo ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_centro_custo ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_centro_custo ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_centro_custo ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_checklist ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_checklist ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_checklist ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_checklist ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_checklist ADD COLUMN IF NOT EXISTS versao integer DEFAULT 1;
ALTER TABLE public.ops_checklist ADD COLUMN IF NOT EXISTS estado text DEFAULT 'rascunho'::text;
ALTER TABLE public.ops_checklist ADD COLUMN IF NOT EXISTS criada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_checklist ADD COLUMN IF NOT EXISTS publicada_em timestamp with time zone;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS checklist_id uuid;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS posicao integer DEFAULT 0;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'inspecao'::text;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS limite_min numeric(12,3);
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS limite_max numeric(12,3);
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS obrigatoria boolean DEFAULT true;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS foto_obrigatoria boolean DEFAULT false;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS tempo_estimado integer DEFAULT 0;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS skill_id uuid;
ALTER TABLE public.ops_checklist_tarefa ADD COLUMN IF NOT EXISTS privada boolean DEFAULT false;
ALTER TABLE public.ops_checklist_tarefa_medicao ADD COLUMN IF NOT EXISTS checklist_tarefa_id uuid;
ALTER TABLE public.ops_checklist_tarefa_medicao ADD COLUMN IF NOT EXISTS medicao_def_id uuid;
ALTER TABLE public.ops_checklist_tarefa_medicao ADD COLUMN IF NOT EXISTS posicao integer DEFAULT 0;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS ordem_id uuid;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS quantidade numeric(12,3) DEFAULT 1;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS valor_unit numeric(12,2) DEFAULT 0;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS total numeric(12,2) DEFAULT 0;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS origem text DEFAULT 'manual'::text;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS produto_id uuid;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS catalog_item_id uuid;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS compra_linha_id uuid;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.ops_custo ADD COLUMN IF NOT EXISTS criado_por uuid;
ALTER TABLE public.ops_definicao ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_definicao ADD COLUMN IF NOT EXISTS chave text;
ALTER TABLE public.ops_definicao ADD COLUMN IF NOT EXISTS valor text;
ALTER TABLE public.ops_definicao ADD COLUMN IF NOT EXISTS atualizada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_definicao ADD COLUMN IF NOT EXISTS atualizada_por uuid;
ALTER TABLE public.ops_entrar_como_log ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_entrar_como_log ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_entrar_como_log ADD COLUMN IF NOT EXISTS admin_id uuid;
ALTER TABLE public.ops_entrar_como_log ADD COLUMN IF NOT EXISTS alvo_id uuid;
ALTER TABLE public.ops_entrar_como_log ADD COLUMN IF NOT EXISTS inicio timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_entrar_como_log ADD COLUMN IF NOT EXISTS fim timestamp with time zone;
ALTER TABLE public.ops_entrar_como_log ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.ops_evento ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_evento ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_evento ADD COLUMN IF NOT EXISTS entidade text;
ALTER TABLE public.ops_evento ADD COLUMN IF NOT EXISTS entidade_id uuid;
ALTER TABLE public.ops_evento ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.ops_evento ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.ops_evento ADD COLUMN IF NOT EXISTS autor_id uuid;
ALTER TABLE public.ops_evento ADD COLUMN IF NOT EXISTS antes jsonb;
ALTER TABLE public.ops_evento ADD COLUMN IF NOT EXISTS depois jsonb;
ALTER TABLE public.ops_evento ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_horario ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_horario ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_horario ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_horario ADD COLUMN IF NOT EXISTS horas_semana numeric(5,2) DEFAULT 40;
ALTER TABLE public.ops_horario ADD COLUMN IF NOT EXISTS horas_dia numeric(4,2) DEFAULT 8;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS cliente_id uuid;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'morada'::text;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS morada text;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS cod_postal text;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS zona text;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS notas text;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS address_id uuid;
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS latitude numeric(10,8);
ALTER TABLE public.ops_local ADD COLUMN IF NOT EXISTS longitude numeric(11,8);
ALTER TABLE public.ops_medicao_def ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_medicao_def ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_medicao_def ADD COLUMN IF NOT EXISTS categoria_ativo_id uuid;
ALTER TABLE public.ops_medicao_def ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_medicao_def ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'gama'::text;
ALTER TABLE public.ops_medicao_def ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.ops_medicao_def ADD COLUMN IF NOT EXISTS limite_min numeric(12,3);
ALTER TABLE public.ops_medicao_def ADD COLUMN IF NOT EXISTS limite_max numeric(12,3);
ALTER TABLE public.ops_medicao_def ADD COLUMN IF NOT EXISTS documentacao_obrigatoria boolean DEFAULT false;
ALTER TABLE public.ops_medicao_def ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_medicao_opcao ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_medicao_opcao ADD COLUMN IF NOT EXISTS medicao_def_id uuid;
ALTER TABLE public.ops_medicao_opcao ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_medicao_opcao ADD COLUMN IF NOT EXISTS posicao integer DEFAULT 0;
ALTER TABLE public.ops_medicao_opcao ADD COLUMN IF NOT EXISTS cria_corretiva boolean DEFAULT false;
ALTER TABLE public.ops_medicao_opcao ADD COLUMN IF NOT EXISTS e_nao_conforme boolean DEFAULT false;
ALTER TABLE public.ops_mensagem ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_mensagem ADD COLUMN IF NOT EXISTS ordem_id uuid;
ALTER TABLE public.ops_mensagem ADD COLUMN IF NOT EXISTS canal text DEFAULT 'interno'::text;
ALTER TABLE public.ops_mensagem ADD COLUMN IF NOT EXISTS autor_id uuid;
ALTER TABLE public.ops_mensagem ADD COLUMN IF NOT EXISTS texto text;
ALTER TABLE public.ops_mensagem ADD COLUMN IF NOT EXISTS criada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_motivo_pausa ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_motivo_pausa ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_motivo_pausa ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_motivo_pausa ADD COLUMN IF NOT EXISTS posicao integer DEFAULT 0;
ALTER TABLE public.ops_motivo_pausa ADD COLUMN IF NOT EXISTS funcoes text[] DEFAULT ARRAY['admin'::text, 'gestor'::text, 'operador'::text, 'tecnico'::text];
ALTER TABLE public.ops_motivo_pausa ADD COLUMN IF NOT EXISTS exige_retoma boolean DEFAULT true;
ALTER TABLE public.ops_motivo_pausa ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_motivo_pausa ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS cliente_id uuid;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS orcamento_id uuid;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS contrato_id uuid;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS modelo_id uuid;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS titulo text;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS morada text;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS notas text;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS estado text DEFAULT 'planeada'::text;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS data_inicio_prevista date;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS iniciada_em timestamp with time zone;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS concluida_em timestamp with time zone;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS motivo_estado text;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS gestor_id uuid;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS supervisor_id uuid;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS tolerancia_percent integer DEFAULT 10;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS minutos_por_dia integer DEFAULT 480;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS criada_por uuid;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS criada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS atualizada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS hora_inicio_dia time without time zone DEFAULT '08:00:00'::time without time zone;
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS inicio_auto boolean;
ALTER TABLE public.ops_obra_aviso ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.ops_obra_aviso ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.ops_obra_aviso ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_aviso ADD COLUMN IF NOT EXISTS chave text;
ALTER TABLE public.ops_obra_aviso ADD COLUMN IF NOT EXISTS enviado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_aviso ADD COLUMN IF NOT EXISTS destinatarios uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE public.ops_obra_aviso ADD COLUMN IF NOT EXISTS sem_especialidade boolean DEFAULT false;
ALTER TABLE public.ops_obra_aviso ADD COLUMN IF NOT EXISTS detalhe jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS tarefa_id uuid;
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS valor_estimado numeric(12,2);
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS fotos text[] DEFAULT '{}'::text[];
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS estado text DEFAULT 'registado'::text;
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS motivo_recusa text;
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS registado_por uuid;
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS registado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS decidido_por uuid;
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS decidido_em timestamp with time zone;
ALTER TABLE public.ops_obra_extra ADD COLUMN IF NOT EXISTS enviado_em timestamp with time zone;
ALTER TABLE public.ops_obra_fase ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_fase ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_fase ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.ops_obra_fase ADD COLUMN IF NOT EXISTS ordem smallint;
ALTER TABLE public.ops_obra_fase ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS tipo_servico text;
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS catalog_item_id uuid;
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS por_defeito boolean DEFAULT false;
ALTER TABLE public.ops_obra_modelo_fase ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_modelo_fase ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_modelo_fase ADD COLUMN IF NOT EXISTS modelo_id uuid;
ALTER TABLE public.ops_obra_modelo_fase ADD COLUMN IF NOT EXISTS ordem smallint;
ALTER TABLE public.ops_obra_modelo_fase ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_obra_modelo_tarefa ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_modelo_tarefa ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_modelo_tarefa ADD COLUMN IF NOT EXISTS modelo_id uuid;
ALTER TABLE public.ops_obra_modelo_tarefa ADD COLUMN IF NOT EXISTS modelo_fase_id uuid;
ALTER TABLE public.ops_obra_modelo_tarefa ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;
ALTER TABLE public.ops_obra_modelo_tarefa ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_obra_modelo_tarefa ADD COLUMN IF NOT EXISTS procedimento text;
ALTER TABLE public.ops_obra_modelo_tarefa ADD COLUMN IF NOT EXISTS materiais text;
ALTER TABLE public.ops_obra_modelo_tarefa ADD COLUMN IF NOT EXISTS ferramentas text;
ALTER TABLE public.ops_obra_modelo_tarefa ADD COLUMN IF NOT EXISTS minutos_previstos integer DEFAULT 60;
ALTER TABLE public.ops_obra_registo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_registo ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_registo ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.ops_obra_registo ADD COLUMN IF NOT EXISTS tarefa_id uuid;
ALTER TABLE public.ops_obra_registo ADD COLUMN IF NOT EXISTS utilizador_id uuid;
ALTER TABLE public.ops_obra_registo ADD COLUMN IF NOT EXISTS inicio timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_registo ADD COLUMN IF NOT EXISTS fim timestamp with time zone;
ALTER TABLE public.ops_obra_ritmo ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_ritmo ADD COLUMN IF NOT EXISTS servico_tarefa_id uuid;
ALTER TABLE public.ops_obra_ritmo ADD COLUMN IF NOT EXISTS fatores_chave text DEFAULT ''::text;
ALTER TABLE public.ops_obra_ritmo ADD COLUMN IF NOT EXISTS n integer;
ALTER TABLE public.ops_obra_ritmo ADD COLUMN IF NOT EXISTS minutos_fixos numeric(10,2);
ALTER TABLE public.ops_obra_ritmo ADD COLUMN IF NOT EXISTS minutos_por_unidade numeric(10,3);
ALTER TABLE public.ops_obra_ritmo ADD COLUMN IF NOT EXISTS padrao_fixos numeric(10,2);
ALTER TABLE public.ops_obra_ritmo ADD COLUMN IF NOT EXISTS padrao_por_unidade numeric(10,3);
ALTER TABLE public.ops_obra_ritmo ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS servico_tarefa_id uuid;
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS fatores_chave text DEFAULT ''::text;
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS tarefa_id uuid;
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS n integer;
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS antes_fixos numeric(10,2);
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS antes_por_unidade numeric(10,3);
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS depois_fixos numeric(10,2);
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS depois_por_unidade numeric(10,3);
ALTER TABLE public.ops_obra_ritmo_historico ADD COLUMN IF NOT EXISTS em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_servico_perfil ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_servico_perfil ADD COLUMN IF NOT EXISTS servico_id uuid;
ALTER TABLE public.ops_obra_servico_perfil ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.ops_obra_servico_perfil ADD COLUMN IF NOT EXISTS medidas jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.ops_obra_servico_perfil ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_servico_perfil ADD COLUMN IF NOT EXISTS atualizado_por uuid;
ALTER TABLE public.ops_obra_servico_perfil ADD COLUMN IF NOT EXISTS planear boolean DEFAULT true;
ALTER TABLE public.ops_obra_servico_perfil ADD COLUMN IF NOT EXISTS medida_para text;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS servico_id uuid;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS ordem integer;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS fase smallint DEFAULT 3;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS minutos_por_unidade numeric(10,2) DEFAULT 0;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS minutos_fixos integer DEFAULT 0;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS pessoas smallint DEFAULT 1;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS skill_id uuid;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS depende_ordem integer;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS procedimento text;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS materiais text;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS ferramentas text;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS origem text DEFAULT 'manual'::text;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS atualizado_por uuid;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS chave text;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS depende_chaves text[] DEFAULT '{}'::text[];
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS espera_antes_horas numeric(6,1) DEFAULT 0;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS medida text DEFAULT 'qt'::text;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS condicao jsonb;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS encaixe jsonb;
ALTER TABLE public.ops_obra_servico_tarefa ADD COLUMN IF NOT EXISTS fatores text[] DEFAULT '{}'::text[];
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS fase_id uuid;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS modelo_tarefa_id uuid;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS procedimento text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS materiais text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS ferramentas text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS minutos_previstos integer DEFAULT 60;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS inicio_planeado date;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS fim_planeado date;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS depende_de uuid;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS estado text DEFAULT 'por_fazer'::text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS iniciada_em timestamp with time zone;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS terminada_em timestamp with time zone;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS motivo_desvio text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS nota_desvio text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS validada_por uuid;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS validada_em timestamp with time zone;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS motivo_rejeicao text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS rejeitada_em timestamp with time zone;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS criada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS atualizada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS orcamento_linha_id uuid;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS servico_id uuid;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS pessoas_previstas smallint DEFAULT 1;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS servico_tarefa_id uuid;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS skill_id uuid;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS materiais_crm jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS inicio_original date;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS fim_original date;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS minutos_estimativa integer;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS chave text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS espera_antes_horas numeric(6,1) DEFAULT 0;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS medida text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS medida_qt numeric(10,2);
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS medida_real numeric(10,2);
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS fatores jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS fatores_chave text DEFAULT ''::text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS minutos_origem text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS ritmo_n integer DEFAULT 0;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS minutos_juntos integer DEFAULT 0;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS material_chega_em date;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS material_chega_origem text;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS material_chega_nota text;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS tarefa_id uuid;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS contexto text;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS minutos_extra integer;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS novo_fim date;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS fim_anterior date;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS registado_por uuid;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS registado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS cliente_avisado boolean DEFAULT false;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS cliente_avisado_em timestamp with time zone;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS cliente_avisado_por uuid;
ALTER TABLE public.ops_obra_tarefa_atraso ADD COLUMN IF NOT EXISTS nota_cliente text;
ALTER TABLE public.ops_obra_tarefa_dependencia ADD COLUMN IF NOT EXISTS tarefa_id uuid;
ALTER TABLE public.ops_obra_tarefa_dependencia ADD COLUMN IF NOT EXISTS depende_de_id uuid;
ALTER TABLE public.ops_obra_tarefa_dependencia ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_tarefa_dependencia ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.ops_obra_tarefa_dependencia ADD COLUMN IF NOT EXISTS criada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS tarefa_id uuid;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS caminho text;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS mime text;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS tamanho integer;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS legenda text;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS carregado_por uuid;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS carregado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_obra_tarefa_pessoa ADD COLUMN IF NOT EXISTS tarefa_id uuid;
ALTER TABLE public.ops_obra_tarefa_pessoa ADD COLUMN IF NOT EXISTS utilizador_id uuid;
ALTER TABLE public.ops_obra_tarefa_pessoa ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_obra_tarefa_pessoa ADD COLUMN IF NOT EXISTS obra_id uuid;
ALTER TABLE public.ops_obra_tarefa_pessoa ADD COLUMN IF NOT EXISTS atribuida_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS estado text DEFAULT 'agendada'::text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS prioridade text DEFAULT 'normal'::text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS plano_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS cliente_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS local_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS titulo text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS contacto_nome text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS contacto_telefone text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS janela_inicio timestamp with time zone;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS janela_fim timestamp with time zone;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS responsavel_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS agendada_para timestamp with time zone;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS aprovada_em timestamp with time zone;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS aprovada_por uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS iniciada_em timestamp with time zone;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS fechada_em timestamp with time zone;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS confirmada_em timestamp with time zone;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS cancelada_em timestamp with time zone;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS motivo_cancelamento text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS pausa_motivo text;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS pausa_retoma_prevista timestamp with time zone;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS gerada_por_tarefa_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS criada_por uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS criada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS atualizada_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS orcamento_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS tipo_trabalho_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS centro_custo_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS fornecedor_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS fecha_automatico boolean DEFAULT false;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS pausa_motivo_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS area_id uuid;
ALTER TABLE public.ops_ordem ADD COLUMN IF NOT EXISTS area_tipo_id uuid;
ALTER TABLE public.ops_ordem_alvo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_ordem_alvo ADD COLUMN IF NOT EXISTS ordem_id uuid;
ALTER TABLE public.ops_ordem_alvo ADD COLUMN IF NOT EXISTS ativo_id uuid;
ALTER TABLE public.ops_ordem_alvo ADD COLUMN IF NOT EXISTS local_id uuid;
ALTER TABLE public.ops_ordem_alvo ADD COLUMN IF NOT EXISTS checklist_id uuid;
ALTER TABLE public.ops_ordem_alvo ADD COLUMN IF NOT EXISTS checklist_versao integer;
ALTER TABLE public.ops_ordem_alvo ADD COLUMN IF NOT EXISTS posicao integer DEFAULT 0;
ALTER TABLE public.ops_ordem_pessoa ADD COLUMN IF NOT EXISTS ordem_id uuid;
ALTER TABLE public.ops_ordem_pessoa ADD COLUMN IF NOT EXISTS utilizador_id uuid;
ALTER TABLE public.ops_ordem_pessoa ADD COLUMN IF NOT EXISTS papel text DEFAULT 'executante'::text;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS ordem_id uuid;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS quote_line_id uuid;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS posicao integer DEFAULT 0;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS quantidade numeric(12,3) DEFAULT 1;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS custo_material numeric(12,2) DEFAULT 0;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS custo_mao_obra numeric(12,2) DEFAULT 0;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS total_sem_iva numeric(12,2) DEFAULT 0;
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS congelado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_ordem_previsto ADD COLUMN IF NOT EXISTS catalog_item_id uuid;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS ordem_id uuid;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS ordem_alvo_id uuid;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS posicao integer DEFAULT 0;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'inspecao'::text;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS estado text DEFAULT 'pendente'::text;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS valor_num numeric(12,3);
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS valor_texto text;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS limite_min numeric(12,3);
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS limite_max numeric(12,3);
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS obrigatoria boolean DEFAULT true;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS observacoes text;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS executada_por uuid;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS inicio timestamp with time zone;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS fim timestamp with time zone;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS tempo_estimado integer DEFAULT 0;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS skill_id uuid;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS privada boolean DEFAULT false;
ALTER TABLE public.ops_ordem_tarefa ADD COLUMN IF NOT EXISTS checklist_tarefa_id uuid;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS ordem_tarefa_id uuid;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS medicao_def_id uuid;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS limite_min numeric(12,3);
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS limite_max numeric(12,3);
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS valor_num numeric(12,3);
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS valor_texto text;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS opcao_id uuid;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS conforme boolean;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS lida_em timestamp with time zone;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS lida_por uuid;
ALTER TABLE public.ops_ordem_tarefa_medicao ADD COLUMN IF NOT EXISTS corretiva_ordem_id uuid;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS cliente_id uuid;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ativo'::text;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS regra_recorrencia text;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS hora_prevista time without time zone DEFAULT '09:00:00'::time without time zone;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS duracao_estimada integer DEFAULT 0;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS responsavel_id uuid;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS inicio_em date DEFAULT CURRENT_DATE;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS fim_em date;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS materializado_ate date;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS tipo_recorrencia text DEFAULT 'calendario'::text;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS intervalo_horas integer;
ALTER TABLE public.ops_plano ADD COLUMN IF NOT EXISTS horario_id uuid;
ALTER TABLE public.ops_plano_alvo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_plano_alvo ADD COLUMN IF NOT EXISTS plano_id uuid;
ALTER TABLE public.ops_plano_alvo ADD COLUMN IF NOT EXISTS local_id uuid;
ALTER TABLE public.ops_plano_alvo ADD COLUMN IF NOT EXISTS ativo_id uuid;
ALTER TABLE public.ops_plano_alvo ADD COLUMN IF NOT EXISTS checklist_id uuid;
ALTER TABLE public.ops_rotulo ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_rotulo ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_rotulo ADD COLUMN IF NOT EXISTS lista text;
ALTER TABLE public.ops_rotulo ADD COLUMN IF NOT EXISTS valor text;
ALTER TABLE public.ops_rotulo ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_rotulo ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;
ALTER TABLE public.ops_rotulo ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_rotulo ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_sequencia ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_sequencia ADD COLUMN IF NOT EXISTS chave text;
ALTER TABLE public.ops_sequencia ADD COLUMN IF NOT EXISTS valor integer DEFAULT 0;
ALTER TABLE public.ops_sessao_trabalho ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_sessao_trabalho ADD COLUMN IF NOT EXISTS ordem_id uuid;
ALTER TABLE public.ops_sessao_trabalho ADD COLUMN IF NOT EXISTS utilizador_id uuid;
ALTER TABLE public.ops_sessao_trabalho ADD COLUMN IF NOT EXISTS inicio timestamp with time zone;
ALTER TABLE public.ops_sessao_trabalho ADD COLUMN IF NOT EXISTS fim timestamp with time zone;
ALTER TABLE public.ops_sessao_trabalho ADD COLUMN IF NOT EXISTS origem text DEFAULT 'web'::text;
ALTER TABLE public.ops_sessao_trabalho ADD COLUMN IF NOT EXISTS ordem_tarefa_id uuid;
ALTER TABLE public.ops_sessao_trabalho ADD COLUMN IF NOT EXISTS motivo_fim text;
ALTER TABLE public.ops_skill ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_skill ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_skill ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_skill ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_tipo_trabalho ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_tipo_trabalho ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_tipo_trabalho ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.ops_tipo_trabalho ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.ops_tipo_trabalho ADD COLUMN IF NOT EXISTS posicao integer DEFAULT 0;
ALTER TABLE public.ops_tipo_trabalho ADD COLUMN IF NOT EXISTS fecha_automatico boolean DEFAULT false;
ALTER TABLE public.ops_tipo_trabalho ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_tipo_trabalho ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_tipo_trabalho ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_utilizador_cliente ADD COLUMN IF NOT EXISTS utilizador_id uuid;
ALTER TABLE public.ops_utilizador_cliente ADD COLUMN IF NOT EXISTS cliente_id uuid;
ALTER TABLE public.ops_utilizador_perfil ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.ops_utilizador_perfil ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ops_utilizador_perfil ADD COLUMN IF NOT EXISTS utilizador_id uuid;
ALTER TABLE public.ops_utilizador_perfil ADD COLUMN IF NOT EXISTS funcao text DEFAULT 'tecnico'::text;
ALTER TABLE public.ops_utilizador_perfil ADD COLUMN IF NOT EXISTS custo_hora numeric(8,2);
ALTER TABLE public.ops_utilizador_perfil ADD COLUMN IF NOT EXISTS zona_base text;
ALTER TABLE public.ops_utilizador_perfil ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE public.ops_utilizador_perfil ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_utilizador_perfil ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone DEFAULT now();
ALTER TABLE public.ops_utilizador_perfil ADD COLUMN IF NOT EXISTS horario_id uuid;
ALTER TABLE public.ops_utilizador_skill ADD COLUMN IF NOT EXISTS utilizador_id uuid;
ALTER TABLE public.ops_utilizador_skill ADD COLUMN IF NOT EXISTS skill_id uuid;

-- 2. Restrições
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_anexo_pkey' AND conrelid = 'public.ops_anexo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_anexo ADD CONSTRAINT ops_anexo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_area_pkey' AND conrelid = 'public.ops_area'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_area ADD CONSTRAINT ops_area_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_area_tipo_pkey' AND conrelid = 'public.ops_area_tipo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_area_tipo ADD CONSTRAINT ops_area_tipo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_assinatura_pkey' AND conrelid = 'public.ops_assinatura'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_assinatura ADD CONSTRAINT ops_assinatura_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ativo_pkey' AND conrelid = 'public.ops_ativo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ativo ADD CONSTRAINT ops_ativo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_categoria_ativo_pkey' AND conrelid = 'public.ops_categoria_ativo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_categoria_ativo ADD CONSTRAINT ops_categoria_ativo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_centro_custo_pkey' AND conrelid = 'public.ops_centro_custo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_centro_custo ADD CONSTRAINT ops_centro_custo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_checklist_pkey' AND conrelid = 'public.ops_checklist'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_checklist ADD CONSTRAINT ops_checklist_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_checklist_tarefa_pkey' AND conrelid = 'public.ops_checklist_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_checklist_tarefa ADD CONSTRAINT ops_checklist_tarefa_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_checklist_tarefa_medicao_pkey' AND conrelid = 'public.ops_checklist_tarefa_medicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_checklist_tarefa_medicao ADD CONSTRAINT ops_checklist_tarefa_medicao_pkey PRIMARY KEY (checklist_tarefa_id, medicao_def_id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_custo_pkey' AND conrelid = 'public.ops_custo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_custo ADD CONSTRAINT ops_custo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_definicao_pkey' AND conrelid = 'public.ops_definicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_definicao ADD CONSTRAINT ops_definicao_pkey PRIMARY KEY (organization_id, chave)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_entrar_como_log_pkey' AND conrelid = 'public.ops_entrar_como_log'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_entrar_como_log ADD CONSTRAINT ops_entrar_como_log_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_evento_pkey' AND conrelid = 'public.ops_evento'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_evento ADD CONSTRAINT ops_evento_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_horario_pkey' AND conrelid = 'public.ops_horario'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_horario ADD CONSTRAINT ops_horario_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_local_pkey' AND conrelid = 'public.ops_local'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_local ADD CONSTRAINT ops_local_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_medicao_def_pkey' AND conrelid = 'public.ops_medicao_def'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_medicao_def ADD CONSTRAINT ops_medicao_def_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_medicao_opcao_pkey' AND conrelid = 'public.ops_medicao_opcao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_medicao_opcao ADD CONSTRAINT ops_medicao_opcao_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_mensagem_pkey' AND conrelid = 'public.ops_mensagem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_mensagem ADD CONSTRAINT ops_mensagem_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_motivo_pausa_pkey' AND conrelid = 'public.ops_motivo_pausa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_motivo_pausa ADD CONSTRAINT ops_motivo_pausa_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_pkey' AND conrelid = 'public.ops_obra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra ADD CONSTRAINT ops_obra_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_aviso_pkey' AND conrelid = 'public.ops_obra_aviso'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_aviso ADD CONSTRAINT ops_obra_aviso_pkey PRIMARY KEY (obra_id, tipo)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_extra_pkey' AND conrelid = 'public.ops_obra_extra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_extra ADD CONSTRAINT ops_obra_extra_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_fase_pkey' AND conrelid = 'public.ops_obra_fase'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_fase ADD CONSTRAINT ops_obra_fase_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_pkey' AND conrelid = 'public.ops_obra_modelo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_modelo ADD CONSTRAINT ops_obra_modelo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_fase_pkey' AND conrelid = 'public.ops_obra_modelo_fase'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_modelo_fase ADD CONSTRAINT ops_obra_modelo_fase_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_tarefa_pkey' AND conrelid = 'public.ops_obra_modelo_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_modelo_tarefa ADD CONSTRAINT ops_obra_modelo_tarefa_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_registo_pkey' AND conrelid = 'public.ops_obra_registo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_registo ADD CONSTRAINT ops_obra_registo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_ritmo_pkey' AND conrelid = 'public.ops_obra_ritmo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_ritmo ADD CONSTRAINT ops_obra_ritmo_pkey PRIMARY KEY (servico_tarefa_id, fatores_chave)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_ritmo_historico_pkey' AND conrelid = 'public.ops_obra_ritmo_historico'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_ritmo_historico ADD CONSTRAINT ops_obra_ritmo_historico_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_perfil_pkey' AND conrelid = 'public.ops_obra_servico_perfil'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_perfil ADD CONSTRAINT ops_obra_servico_perfil_pkey PRIMARY KEY (organization_id, servico_id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_pkey' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_pkey' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_atraso_pkey' AND conrelid = 'public.ops_obra_tarefa_atraso'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_atraso ADD CONSTRAINT ops_obra_tarefa_atraso_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_dependencia_pkey' AND conrelid = 'public.ops_obra_tarefa_dependencia'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_dependencia ADD CONSTRAINT ops_obra_tarefa_dependencia_pkey PRIMARY KEY (tarefa_id, depende_de_id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_foto_pkey' AND conrelid = 'public.ops_obra_tarefa_foto'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_foto ADD CONSTRAINT ops_obra_tarefa_foto_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_pessoa_pkey' AND conrelid = 'public.ops_obra_tarefa_pessoa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_pessoa ADD CONSTRAINT ops_obra_tarefa_pessoa_pkey PRIMARY KEY (tarefa_id, utilizador_id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_pkey' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_alvo_pkey' AND conrelid = 'public.ops_ordem_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_alvo ADD CONSTRAINT ops_ordem_alvo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_pessoa_pkey' AND conrelid = 'public.ops_ordem_pessoa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_pessoa ADD CONSTRAINT ops_ordem_pessoa_pkey PRIMARY KEY (ordem_id, utilizador_id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_previsto_pkey' AND conrelid = 'public.ops_ordem_previsto'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_previsto ADD CONSTRAINT ops_ordem_previsto_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_pkey' AND conrelid = 'public.ops_ordem_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa ADD CONSTRAINT ops_ordem_tarefa_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_medicao_pkey' AND conrelid = 'public.ops_ordem_tarefa_medicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa_medicao ADD CONSTRAINT ops_ordem_tarefa_medicao_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_pkey' AND conrelid = 'public.ops_plano'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano ADD CONSTRAINT ops_plano_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_alvo_pkey' AND conrelid = 'public.ops_plano_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano_alvo ADD CONSTRAINT ops_plano_alvo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_rotulo_pkey' AND conrelid = 'public.ops_rotulo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_rotulo ADD CONSTRAINT ops_rotulo_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_sequencia_pkey' AND conrelid = 'public.ops_sequencia'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_sequencia ADD CONSTRAINT ops_sequencia_pkey PRIMARY KEY (organization_id, chave)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_sessao_trabalho_pkey' AND conrelid = 'public.ops_sessao_trabalho'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_sessao_trabalho ADD CONSTRAINT ops_sessao_trabalho_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_skill_pkey' AND conrelid = 'public.ops_skill'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_skill ADD CONSTRAINT ops_skill_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_tipo_trabalho_pkey' AND conrelid = 'public.ops_tipo_trabalho'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_tipo_trabalho ADD CONSTRAINT ops_tipo_trabalho_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_utilizador_cliente_pkey' AND conrelid = 'public.ops_utilizador_cliente'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_utilizador_cliente ADD CONSTRAINT ops_utilizador_cliente_pkey PRIMARY KEY (utilizador_id, cliente_id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_utilizador_perfil_pkey' AND conrelid = 'public.ops_utilizador_perfil'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_utilizador_perfil ADD CONSTRAINT ops_utilizador_perfil_pkey PRIMARY KEY (id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_utilizador_skill_pkey' AND conrelid = 'public.ops_utilizador_skill'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_utilizador_skill ADD CONSTRAINT ops_utilizador_skill_pkey PRIMARY KEY (utilizador_id, skill_id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_anexo_caminho_unico' AND conrelid = 'public.ops_anexo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_anexo ADD CONSTRAINT ops_anexo_caminho_unico UNIQUE (caminho)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_area_organization_id_nome_key' AND conrelid = 'public.ops_area'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_area ADD CONSTRAINT ops_area_organization_id_nome_key UNIQUE (organization_id, nome)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_area_tipo_area_id_nome_key' AND conrelid = 'public.ops_area_tipo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_area_tipo ADD CONSTRAINT ops_area_tipo_area_id_nome_key UNIQUE (area_id, nome)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_assinatura_ordem_id_key' AND conrelid = 'public.ops_assinatura'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_assinatura ADD CONSTRAINT ops_assinatura_ordem_id_key UNIQUE (ordem_id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ativo_organization_id_codigo_key' AND conrelid = 'public.ops_ativo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ativo ADD CONSTRAINT ops_ativo_organization_id_codigo_key UNIQUE (organization_id, codigo)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_categoria_ativo_organization_id_codigo_key' AND conrelid = 'public.ops_categoria_ativo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_categoria_ativo ADD CONSTRAINT ops_categoria_ativo_organization_id_codigo_key UNIQUE (organization_id, codigo)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_centro_custo_organization_id_codigo_key' AND conrelid = 'public.ops_centro_custo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_centro_custo ADD CONSTRAINT ops_centro_custo_organization_id_codigo_key UNIQUE (organization_id, codigo)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_checklist_organization_id_codigo_versao_key' AND conrelid = 'public.ops_checklist'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_checklist ADD CONSTRAINT ops_checklist_organization_id_codigo_versao_key UNIQUE (organization_id, codigo, versao)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_horario_organization_id_nome_key' AND conrelid = 'public.ops_horario'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_horario ADD CONSTRAINT ops_horario_organization_id_nome_key UNIQUE (organization_id, nome)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_local_organization_id_codigo_key' AND conrelid = 'public.ops_local'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_local ADD CONSTRAINT ops_local_organization_id_codigo_key UNIQUE (organization_id, codigo)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_medicao_opcao_medicao_def_id_nome_key' AND conrelid = 'public.ops_medicao_opcao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_medicao_opcao ADD CONSTRAINT ops_medicao_opcao_medicao_def_id_nome_key UNIQUE (medicao_def_id, nome)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_motivo_pausa_organization_id_nome_key' AND conrelid = 'public.ops_motivo_pausa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_motivo_pausa ADD CONSTRAINT ops_motivo_pausa_organization_id_nome_key UNIQUE (organization_id, nome)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_organization_id_codigo_key' AND conrelid = 'public.ops_obra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra ADD CONSTRAINT ops_obra_organization_id_codigo_key UNIQUE (organization_id, codigo)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_fase_obra_id_ordem_key' AND conrelid = 'public.ops_obra_fase'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_fase ADD CONSTRAINT ops_obra_fase_obra_id_ordem_key UNIQUE (obra_id, ordem)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_organization_id_nome_key' AND conrelid = 'public.ops_obra_modelo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_modelo ADD CONSTRAINT ops_obra_modelo_organization_id_nome_key UNIQUE (organization_id, nome)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_fase_modelo_id_ordem_key' AND conrelid = 'public.ops_obra_modelo_fase'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_modelo_fase ADD CONSTRAINT ops_obra_modelo_fase_modelo_id_ordem_key UNIQUE (modelo_id, ordem)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_organization_id_servico_id_ordem_key' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_organization_id_servico_id_ordem_key UNIQUE (organization_id, servico_id, ordem)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_foto_caminho_key' AND conrelid = 'public.ops_obra_tarefa_foto'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_foto ADD CONSTRAINT ops_obra_tarefa_foto_caminho_key UNIQUE (caminho)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_organization_id_codigo_key' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_organization_id_codigo_key UNIQUE (organization_id, codigo)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_medicao_ordem_tarefa_id_medicao_def_id_key' AND conrelid = 'public.ops_ordem_tarefa_medicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa_medicao ADD CONSTRAINT ops_ordem_tarefa_medicao_ordem_tarefa_id_medicao_def_id_key UNIQUE (ordem_tarefa_id, medicao_def_id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_organization_id_codigo_key' AND conrelid = 'public.ops_plano'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano ADD CONSTRAINT ops_plano_organization_id_codigo_key UNIQUE (organization_id, codigo)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_rotulo_organization_id_lista_valor_key' AND conrelid = 'public.ops_rotulo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_rotulo ADD CONSTRAINT ops_rotulo_organization_id_lista_valor_key UNIQUE (organization_id, lista, valor)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_skill_organization_id_nome_key' AND conrelid = 'public.ops_skill'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_skill ADD CONSTRAINT ops_skill_organization_id_nome_key UNIQUE (organization_id, nome)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_tipo_trabalho_organization_id_nome_key' AND conrelid = 'public.ops_tipo_trabalho'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_tipo_trabalho ADD CONSTRAINT ops_tipo_trabalho_organization_id_nome_key UNIQUE (organization_id, nome)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_utilizador_perfil_organization_id_utilizador_id_key' AND conrelid = 'public.ops_utilizador_perfil'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_utilizador_perfil ADD CONSTRAINT ops_utilizador_perfil_organization_id_utilizador_id_key UNIQUE (organization_id, utilizador_id)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ativo_criticidade_check' AND conrelid = 'public.ops_ativo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ativo ADD CONSTRAINT ops_ativo_criticidade_check CHECK ((criticidade = ANY (ARRAY[''baixa''::text, ''normal''::text, ''alta''::text, ''critica''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_checklist_estado_check' AND conrelid = 'public.ops_checklist'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_checklist ADD CONSTRAINT ops_checklist_estado_check CHECK ((estado = ANY (ARRAY[''rascunho''::text, ''publicada''::text, ''arquivada''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_checklist_tarefa_tipo_check' AND conrelid = 'public.ops_checklist_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_checklist_tarefa ADD CONSTRAINT ops_checklist_tarefa_tipo_check CHECK ((tipo = ANY (ARRAY[''inspecao''::text, ''correcao''::text, ''limpeza''::text, ''proacao''::text, ''substituicao''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_custo_origem_check' AND conrelid = 'public.ops_custo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_custo ADD CONSTRAINT ops_custo_origem_check CHECK ((origem = ANY (ARRAY[''calculado''::text, ''manual''::text, ''inventario''::text, ''catalogo''::text, ''compra''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_custo_tipo_check' AND conrelid = 'public.ops_custo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_custo ADD CONSTRAINT ops_custo_tipo_check CHECK ((tipo = ANY (ARRAY[''mao_obra''::text, ''material''::text, ''servico''::text, ''outro''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_definicao_chave_check' AND conrelid = 'public.ops_definicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_definicao ADD CONSTRAINT ops_definicao_chave_check CHECK ((chave = ''relatorio_automatico''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_local_coordenadas_validas' AND conrelid = 'public.ops_local'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_local ADD CONSTRAINT ops_local_coordenadas_validas CHECK ((((latitude IS NULL) AND (longitude IS NULL)) OR ((latitude IS NOT NULL) AND (longitude IS NOT NULL) AND ((latitude >= (''-90''::integer)::numeric) AND (latitude <= (90)::numeric)) AND ((longitude >= (''-180''::integer)::numeric) AND (longitude <= (180)::numeric)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_local_nao_e_pai_de_si' AND conrelid = 'public.ops_local'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_local ADD CONSTRAINT ops_local_nao_e_pai_de_si CHECK (((parent_id IS NULL) OR (parent_id <> id)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_local_tipo_check' AND conrelid = 'public.ops_local'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_local ADD CONSTRAINT ops_local_tipo_check CHECK ((tipo = ANY (ARRAY[''morada''::text, ''edificio''::text, ''piso''::text, ''espaco''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_medicao_def_tipo_check' AND conrelid = 'public.ops_medicao_def'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_medicao_def ADD CONSTRAINT ops_medicao_def_tipo_check CHECK ((tipo = ANY (ARRAY[''gama''::text, ''acumulado''::text, ''escolha''::text, ''texto''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_mensagem_canal_check' AND conrelid = 'public.ops_mensagem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_mensagem ADD CONSTRAINT ops_mensagem_canal_check CHECK ((canal = ANY (ARRAY[''interno''::text, ''cliente''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_estado_check' AND conrelid = 'public.ops_obra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra ADD CONSTRAINT ops_obra_estado_check CHECK ((estado = ANY (ARRAY[''planeada''::text, ''em_curso''::text, ''suspensa''::text, ''concluida''::text, ''cancelada''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_minutos_por_dia_check' AND conrelid = 'public.ops_obra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra ADD CONSTRAINT ops_obra_minutos_por_dia_check CHECK (((minutos_por_dia >= 60) AND (minutos_por_dia <= 1440)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tolerancia_percent_check' AND conrelid = 'public.ops_obra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra ADD CONSTRAINT ops_obra_tolerancia_percent_check CHECK (((tolerancia_percent >= 0) AND (tolerancia_percent <= 100)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_aviso_tipo_check' AND conrelid = 'public.ops_obra_aviso'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_aviso ADD CONSTRAINT ops_obra_aviso_tipo_check CHECK ((tipo = ''bancada''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_extra_estado_check' AND conrelid = 'public.ops_obra_extra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_extra ADD CONSTRAINT ops_obra_extra_estado_check CHECK ((estado = ANY (ARRAY[''registado''::text, ''aprovado''::text, ''enviado''::text, ''recusado''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_extra_valor_estimado_check' AND conrelid = 'public.ops_obra_extra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_extra ADD CONSTRAINT ops_obra_extra_valor_estimado_check CHECK (((valor_estimado IS NULL) OR (valor_estimado >= (0)::numeric)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_fase_ordem_check' AND conrelid = 'public.ops_obra_fase'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_fase ADD CONSTRAINT ops_obra_fase_ordem_check CHECK (((ordem >= 1) AND (ordem <= 9)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_fase_ordem_check' AND conrelid = 'public.ops_obra_modelo_fase'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_modelo_fase ADD CONSTRAINT ops_obra_modelo_fase_ordem_check CHECK (((ordem >= 1) AND (ordem <= 9)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_tarefa_minutos_previstos_check' AND conrelid = 'public.ops_obra_modelo_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_modelo_tarefa ADD CONSTRAINT ops_obra_modelo_tarefa_minutos_previstos_check CHECK ((minutos_previstos > 0))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_registo_check' AND conrelid = 'public.ops_obra_registo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_registo ADD CONSTRAINT ops_obra_registo_check CHECK (((fim IS NULL) OR (fim >= inicio)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_ritmo_minutos_fixos_check' AND conrelid = 'public.ops_obra_ritmo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_ritmo ADD CONSTRAINT ops_obra_ritmo_minutos_fixos_check CHECK ((minutos_fixos >= (0)::numeric))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_ritmo_minutos_por_unidade_check' AND conrelid = 'public.ops_obra_ritmo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_ritmo ADD CONSTRAINT ops_obra_ritmo_minutos_por_unidade_check CHECK ((minutos_por_unidade >= (0)::numeric))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_ritmo_n_check' AND conrelid = 'public.ops_obra_ritmo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_ritmo ADD CONSTRAINT ops_obra_ritmo_n_check CHECK ((n > 0))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_perfil_medida_para_chk' AND conrelid = 'public.ops_obra_servico_perfil'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_perfil ADD CONSTRAINT ops_obra_servico_perfil_medida_para_chk CHECK (((medida_para IS NULL) OR (medida_para = ANY (ARRAY[''m2_pavimento''::text, ''m2_parede''::text, ''pontos_agua''::text, ''pontos_eletricos''::text, ''pecas_sanitarias''::text, ''acessorios''::text, ''modulos''::text, ''eletrodomesticos''::text, ''ml_bancada''::text]))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_perfil_tipo_check' AND conrelid = 'public.ops_obra_servico_perfil'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_perfil ADD CONSTRAINT ops_obra_servico_perfil_tipo_check CHECK (((tipo IS NULL) OR (tipo = ANY (ARRAY[''casa_banho''::text, ''cozinha''::text]))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_chave_check' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_chave_check CHECK (((chave IS NULL) OR (chave ~ ''^[0-9A-Za-z._-]{1,12}$''::text)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_check' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_check CHECK (((minutos_por_unidade > (0)::numeric) OR (minutos_fixos > 0)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_check1' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_check1 CHECK (((depende_ordem IS NULL) OR (depende_ordem <> ordem)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_espera_antes_horas_check' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_espera_antes_horas_check CHECK (((espera_antes_horas >= (0)::numeric) AND (espera_antes_horas <= (2000)::numeric)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_fase_check' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_fase_check CHECK (((fase >= 1) AND (fase <= 9)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_medida_chk' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_medida_chk CHECK ((medida = ANY (ARRAY[''qt''::text, ''fixo''::text, ''m2_pavimento''::text, ''m2_parede''::text, ''m2_total''::text, ''pontos_agua''::text, ''pontos_eletricos''::text, ''pecas_sanitarias''::text, ''acessorios''::text, ''modulos''::text, ''eletrodomesticos''::text, ''ml_bancada''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_minutos_fixos_check' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_minutos_fixos_check CHECK ((minutos_fixos >= 0))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_minutos_por_unidade_check' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_minutos_por_unidade_check CHECK ((minutos_por_unidade >= (0)::numeric))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_origem_check' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_origem_check CHECK ((origem = ANY (ARRAY[''manual''::text, ''sugerida''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_pessoas_check' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_pessoas_check CHECK (((pessoas >= 1) AND (pessoas <= 20)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_check CHECK (((fim_planeado IS NULL) OR (inicio_planeado IS NULL) OR (fim_planeado >= inicio_planeado)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_check1' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_check1 CHECK (((depende_de IS NULL) OR (depende_de <> id)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_espera_antes_horas_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_espera_antes_horas_check CHECK (((espera_antes_horas >= (0)::numeric) AND (espera_antes_horas <= (2000)::numeric)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_estado_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_estado_check CHECK ((estado = ANY (ARRAY[''por_fazer''::text, ''em_curso''::text, ''feita''::text, ''validada''::text, ''rejeitada''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_material_chega_origem_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_material_chega_origem_check CHECK (((material_chega_origem IS NULL) OR (material_chega_origem = ANY (ARRAY[''crm''::text, ''manual''::text]))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_medida_qt_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_medida_qt_check CHECK (((medida_qt IS NULL) OR (medida_qt >= (0)::numeric)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_medida_real_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_medida_real_check CHECK (((medida_real IS NULL) OR (medida_real >= (0)::numeric)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_minutos_estimativa_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_minutos_estimativa_check CHECK (((minutos_estimativa IS NULL) OR (minutos_estimativa > 0)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_minutos_juntos_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_minutos_juntos_check CHECK ((minutos_juntos >= 0))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_minutos_origem_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_minutos_origem_check CHECK (((minutos_origem IS NULL) OR (minutos_origem = ANY (ARRAY[''padrao''::text, ''aprendido''::text, ''ficha''::text, ''manual''::text]))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_minutos_previstos_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_minutos_previstos_check CHECK ((minutos_previstos > 0))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_motivo_desvio_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_motivo_desvio_check CHECK (((motivo_desvio IS NULL) OR (motivo_desvio = ANY (ARRAY[''secagem''::text, ''condicoes_edificio''::text, ''material_em_falta''::text, ''trabalho_imprevisto''::text, ''acesso_cliente''::text, ''outro''::text]))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_pessoas_previstas_check' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_pessoas_previstas_check CHECK (((pessoas_previstas >= 1) AND (pessoas_previstas <= 20)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_atraso_contexto_check' AND conrelid = 'public.ops_obra_tarefa_atraso'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_atraso ADD CONSTRAINT ops_obra_tarefa_atraso_contexto_check CHECK ((length(btrim(contexto)) >= 5))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_atraso_minutos_extra_check' AND conrelid = 'public.ops_obra_tarefa_atraso'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_atraso ADD CONSTRAINT ops_obra_tarefa_atraso_minutos_extra_check CHECK (((minutos_extra IS NULL) OR (minutos_extra > 0)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_atraso_motivo_check' AND conrelid = 'public.ops_obra_tarefa_atraso'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_atraso ADD CONSTRAINT ops_obra_tarefa_atraso_motivo_check CHECK ((motivo = ANY (ARRAY[''secagem''::text, ''condicoes_edificio''::text, ''material_em_falta''::text, ''trabalho_imprevisto''::text, ''acesso_cliente''::text, ''meteorologia''::text, ''equipa''::text, ''outro''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_dependencia_check' AND conrelid = 'public.ops_obra_tarefa_dependencia'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_dependencia ADD CONSTRAINT ops_obra_tarefa_dependencia_check CHECK ((tarefa_id <> depende_de_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_estado_check' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_estado_check CHECK ((estado = ANY (ARRAY[''por_aprovar''::text, ''agendada''::text, ''em_curso''::text, ''pausada''::text, ''fechada''::text, ''confirmada''::text, ''cancelada''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_origem_check' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_origem_check CHECK ((origem = ANY (ARRAY[''preventiva''::text, ''corretiva''::text, ''obra''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_pausa_completa' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_pausa_completa CHECK (((estado <> ''pausada''::text) OR ((pausa_motivo IS NOT NULL) AND (pausa_retoma_prevista IS NOT NULL))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_prioridade_check' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_prioridade_check CHECK ((prioridade = ANY (ARRAY[''baixa''::text, ''normal''::text, ''alta''::text, ''urgente''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_alvo_tem_conteudo' AND conrelid = 'public.ops_ordem_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_alvo ADD CONSTRAINT ops_ordem_alvo_tem_conteudo CHECK (((ativo_id IS NOT NULL) OR (local_id IS NOT NULL) OR (checklist_id IS NOT NULL)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_estado_check' AND conrelid = 'public.ops_ordem_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa ADD CONSTRAINT ops_ordem_tarefa_estado_check CHECK ((estado = ANY (ARRAY[''pendente''::text, ''feita''::text, ''nao_conforme''::text, ''nao_aplicavel''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_tipo_check' AND conrelid = 'public.ops_ordem_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa ADD CONSTRAINT ops_ordem_tarefa_tipo_check CHECK ((tipo = ANY (ARRAY[''inspecao''::text, ''correcao''::text, ''limpeza''::text, ''proacao''::text, ''substituicao''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_estado_check' AND conrelid = 'public.ops_plano'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano ADD CONSTRAINT ops_plano_estado_check CHECK ((estado = ANY (ARRAY[''ativo''::text, ''suspenso''::text, ''terminado''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_recorrencia_coerente' AND conrelid = 'public.ops_plano'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano ADD CONSTRAINT ops_plano_recorrencia_coerente CHECK ((((tipo_recorrencia = ''calendario''::text) AND (regra_recorrencia IS NOT NULL)) OR ((tipo_recorrencia = ''dinamica''::text) AND (intervalo_horas IS NOT NULL) AND (intervalo_horas > 0))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_tipo_recorrencia_check' AND conrelid = 'public.ops_plano'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano ADD CONSTRAINT ops_plano_tipo_recorrencia_check CHECK ((tipo_recorrencia = ANY (ARRAY[''calendario''::text, ''dinamica''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_alvo_tem_conteudo' AND conrelid = 'public.ops_plano_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano_alvo ADD CONSTRAINT ops_plano_alvo_tem_conteudo CHECK (((local_id IS NOT NULL) OR (ativo_id IS NOT NULL)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_rotulo_lista_check' AND conrelid = 'public.ops_rotulo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_rotulo ADD CONSTRAINT ops_rotulo_lista_check CHECK ((lista = ANY (ARRAY[''prioridade''::text, ''criticidade''::text, ''tipo_tarefa''::text, ''tipo_local''::text, ''origem''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_rotulo_nome_check' AND conrelid = 'public.ops_rotulo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_rotulo ADD CONSTRAINT ops_rotulo_nome_check CHECK ((btrim(nome) <> ''''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_sessao_fim_depois_do_inicio' AND conrelid = 'public.ops_sessao_trabalho'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_sessao_trabalho ADD CONSTRAINT ops_sessao_fim_depois_do_inicio CHECK (((fim IS NULL) OR (fim >= inicio)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_sessao_motivo_fim_check' AND conrelid = 'public.ops_sessao_trabalho'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_sessao_trabalho ADD CONSTRAINT ops_sessao_motivo_fim_check CHECK (((motivo_fim IS NULL) OR (motivo_fim = ANY (ARRAY[''pessoa''::text, ''troca''::text, ''tarefa''::text, ''pausa''::text, ''fecho''::text, ''cancelamento''::text]))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_sessao_trabalho_origem_check' AND conrelid = 'public.ops_sessao_trabalho'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_sessao_trabalho ADD CONSTRAINT ops_sessao_trabalho_origem_check CHECK ((origem = ANY (ARRAY[''web''::text, ''app''::text, ''whatsapp''::text, ''manual''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_utilizador_perfil_funcao_check' AND conrelid = 'public.ops_utilizador_perfil'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_utilizador_perfil ADD CONSTRAINT ops_utilizador_perfil_funcao_check CHECK ((funcao = ANY (ARRAY[''admin''::text, ''gestor''::text, ''supervisor''::text, ''operador''::text, ''tecnico''::text])))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_anexo_ativo_id_fkey' AND conrelid = 'public.ops_anexo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_anexo ADD CONSTRAINT ops_anexo_ativo_id_fkey FOREIGN KEY (ativo_id) REFERENCES ops_ativo(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_anexo_ordem_id_fkey' AND conrelid = 'public.ops_anexo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_anexo ADD CONSTRAINT ops_anexo_ordem_id_fkey FOREIGN KEY (ordem_id) REFERENCES ops_ordem(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_anexo_ordem_tarefa_id_fkey' AND conrelid = 'public.ops_anexo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_anexo ADD CONSTRAINT ops_anexo_ordem_tarefa_id_fkey FOREIGN KEY (ordem_tarefa_id) REFERENCES ops_ordem_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_area_tipo_area_id_fkey' AND conrelid = 'public.ops_area_tipo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_area_tipo ADD CONSTRAINT ops_area_tipo_area_id_fkey FOREIGN KEY (area_id) REFERENCES ops_area(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_assinatura_ordem_id_fkey' AND conrelid = 'public.ops_assinatura'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_assinatura ADD CONSTRAINT ops_assinatura_ordem_id_fkey FOREIGN KEY (ordem_id) REFERENCES ops_ordem(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ativo_categoria_id_fkey' AND conrelid = 'public.ops_ativo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ativo ADD CONSTRAINT ops_ativo_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES ops_categoria_ativo(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ativo_centro_custo_id_fkey' AND conrelid = 'public.ops_ativo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ativo ADD CONSTRAINT ops_ativo_centro_custo_id_fkey FOREIGN KEY (centro_custo_id) REFERENCES ops_centro_custo(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ativo_local_id_fkey' AND conrelid = 'public.ops_ativo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ativo ADD CONSTRAINT ops_ativo_local_id_fkey FOREIGN KEY (local_id) REFERENCES ops_local(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_categoria_ativo_parent_id_fkey' AND conrelid = 'public.ops_categoria_ativo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_categoria_ativo ADD CONSTRAINT ops_categoria_ativo_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES ops_categoria_ativo(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_checklist_tarefa_checklist_id_fkey' AND conrelid = 'public.ops_checklist_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_checklist_tarefa ADD CONSTRAINT ops_checklist_tarefa_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES ops_checklist(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_checklist_tarefa_skill_id_fkey' AND conrelid = 'public.ops_checklist_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_checklist_tarefa ADD CONSTRAINT ops_checklist_tarefa_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES ops_skill(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_checklist_tarefa_medicao_checklist_tarefa_id_fkey' AND conrelid = 'public.ops_checklist_tarefa_medicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_checklist_tarefa_medicao ADD CONSTRAINT ops_checklist_tarefa_medicao_checklist_tarefa_id_fkey FOREIGN KEY (checklist_tarefa_id) REFERENCES ops_checklist_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_checklist_tarefa_medicao_medicao_def_id_fkey' AND conrelid = 'public.ops_checklist_tarefa_medicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_checklist_tarefa_medicao ADD CONSTRAINT ops_checklist_tarefa_medicao_medicao_def_id_fkey FOREIGN KEY (medicao_def_id) REFERENCES ops_medicao_def(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_custo_ordem_id_fkey' AND conrelid = 'public.ops_custo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_custo ADD CONSTRAINT ops_custo_ordem_id_fkey FOREIGN KEY (ordem_id) REFERENCES ops_ordem(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_local_parent_id_fkey' AND conrelid = 'public.ops_local'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_local ADD CONSTRAINT ops_local_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES ops_local(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_medicao_def_categoria_ativo_id_fkey' AND conrelid = 'public.ops_medicao_def'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_medicao_def ADD CONSTRAINT ops_medicao_def_categoria_ativo_id_fkey FOREIGN KEY (categoria_ativo_id) REFERENCES ops_categoria_ativo(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_medicao_opcao_medicao_def_id_fkey' AND conrelid = 'public.ops_medicao_opcao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_medicao_opcao ADD CONSTRAINT ops_medicao_opcao_medicao_def_id_fkey FOREIGN KEY (medicao_def_id) REFERENCES ops_medicao_def(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_mensagem_ordem_id_fkey' AND conrelid = 'public.ops_mensagem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_mensagem ADD CONSTRAINT ops_mensagem_ordem_id_fkey FOREIGN KEY (ordem_id) REFERENCES ops_ordem(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_id_fkey' AND conrelid = 'public.ops_obra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra ADD CONSTRAINT ops_obra_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES ops_obra_modelo(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_aviso_obra_id_fkey' AND conrelid = 'public.ops_obra_aviso'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_aviso ADD CONSTRAINT ops_obra_aviso_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES ops_obra(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_extra_obra_id_fkey' AND conrelid = 'public.ops_obra_extra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_extra ADD CONSTRAINT ops_obra_extra_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES ops_obra(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_extra_tarefa_id_fkey' AND conrelid = 'public.ops_obra_extra'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_extra ADD CONSTRAINT ops_obra_extra_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES ops_obra_tarefa(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_fase_obra_id_fkey' AND conrelid = 'public.ops_obra_fase'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_fase ADD CONSTRAINT ops_obra_fase_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES ops_obra(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_fase_modelo_id_fkey' AND conrelid = 'public.ops_obra_modelo_fase'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_modelo_fase ADD CONSTRAINT ops_obra_modelo_fase_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES ops_obra_modelo(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_tarefa_modelo_fase_id_fkey' AND conrelid = 'public.ops_obra_modelo_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_modelo_tarefa ADD CONSTRAINT ops_obra_modelo_tarefa_modelo_fase_id_fkey FOREIGN KEY (modelo_fase_id) REFERENCES ops_obra_modelo_fase(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_modelo_tarefa_modelo_id_fkey' AND conrelid = 'public.ops_obra_modelo_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_modelo_tarefa ADD CONSTRAINT ops_obra_modelo_tarefa_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES ops_obra_modelo(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_registo_obra_id_fkey' AND conrelid = 'public.ops_obra_registo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_registo ADD CONSTRAINT ops_obra_registo_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES ops_obra(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_registo_tarefa_id_fkey' AND conrelid = 'public.ops_obra_registo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_registo ADD CONSTRAINT ops_obra_registo_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES ops_obra_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_ritmo_servico_tarefa_id_fkey' AND conrelid = 'public.ops_obra_ritmo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_ritmo ADD CONSTRAINT ops_obra_ritmo_servico_tarefa_id_fkey FOREIGN KEY (servico_tarefa_id) REFERENCES ops_obra_servico_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_ritmo_historico_servico_tarefa_id_fkey' AND conrelid = 'public.ops_obra_ritmo_historico'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_ritmo_historico ADD CONSTRAINT ops_obra_ritmo_historico_servico_tarefa_id_fkey FOREIGN KEY (servico_tarefa_id) REFERENCES ops_obra_servico_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_servico_tarefa_skill_id_fkey' AND conrelid = 'public.ops_obra_servico_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_servico_tarefa ADD CONSTRAINT ops_obra_servico_tarefa_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES ops_skill(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_depende_de_fkey' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_depende_de_fkey FOREIGN KEY (depende_de) REFERENCES ops_obra_tarefa(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_fase_id_fkey' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES ops_obra_fase(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_modelo_tarefa_id_fkey' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_modelo_tarefa_id_fkey FOREIGN KEY (modelo_tarefa_id) REFERENCES ops_obra_modelo_tarefa(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_obra_id_fkey' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES ops_obra(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_servico_tarefa_id_fkey' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_servico_tarefa_id_fkey FOREIGN KEY (servico_tarefa_id) REFERENCES ops_obra_servico_tarefa(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_skill_id_fkey' AND conrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa ADD CONSTRAINT ops_obra_tarefa_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES ops_skill(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_atraso_obra_id_fkey' AND conrelid = 'public.ops_obra_tarefa_atraso'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_atraso ADD CONSTRAINT ops_obra_tarefa_atraso_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES ops_obra(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_atraso_tarefa_id_fkey' AND conrelid = 'public.ops_obra_tarefa_atraso'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_atraso ADD CONSTRAINT ops_obra_tarefa_atraso_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES ops_obra_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_dependencia_depende_de_id_fkey' AND conrelid = 'public.ops_obra_tarefa_dependencia'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_dependencia ADD CONSTRAINT ops_obra_tarefa_dependencia_depende_de_id_fkey FOREIGN KEY (depende_de_id) REFERENCES ops_obra_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_dependencia_obra_id_fkey' AND conrelid = 'public.ops_obra_tarefa_dependencia'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_dependencia ADD CONSTRAINT ops_obra_tarefa_dependencia_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES ops_obra(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_dependencia_tarefa_id_fkey' AND conrelid = 'public.ops_obra_tarefa_dependencia'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_dependencia ADD CONSTRAINT ops_obra_tarefa_dependencia_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES ops_obra_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_foto_obra_id_fkey' AND conrelid = 'public.ops_obra_tarefa_foto'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_foto ADD CONSTRAINT ops_obra_tarefa_foto_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES ops_obra(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_foto_tarefa_id_fkey' AND conrelid = 'public.ops_obra_tarefa_foto'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_foto ADD CONSTRAINT ops_obra_tarefa_foto_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES ops_obra_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_pessoa_obra_id_fkey' AND conrelid = 'public.ops_obra_tarefa_pessoa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_pessoa ADD CONSTRAINT ops_obra_tarefa_pessoa_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES ops_obra(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_pessoa_tarefa_id_fkey' AND conrelid = 'public.ops_obra_tarefa_pessoa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_obra_tarefa_pessoa ADD CONSTRAINT ops_obra_tarefa_pessoa_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES ops_obra_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_area_id_fkey' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_area_id_fkey FOREIGN KEY (area_id) REFERENCES ops_area(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_area_tipo_id_fkey' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_area_tipo_id_fkey FOREIGN KEY (area_tipo_id) REFERENCES ops_area_tipo(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_centro_custo_id_fkey' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_centro_custo_id_fkey FOREIGN KEY (centro_custo_id) REFERENCES ops_centro_custo(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_gerada_por_tarefa_fkey' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_gerada_por_tarefa_fkey FOREIGN KEY (gerada_por_tarefa_id) REFERENCES ops_ordem_tarefa(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_local_id_fkey' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_local_id_fkey FOREIGN KEY (local_id) REFERENCES ops_local(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_pausa_motivo_id_fkey' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_pausa_motivo_id_fkey FOREIGN KEY (pausa_motivo_id) REFERENCES ops_motivo_pausa(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_plano_id_fkey' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_plano_id_fkey FOREIGN KEY (plano_id) REFERENCES ops_plano(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tipo_trabalho_id_fkey' AND conrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem ADD CONSTRAINT ops_ordem_tipo_trabalho_id_fkey FOREIGN KEY (tipo_trabalho_id) REFERENCES ops_tipo_trabalho(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_alvo_ativo_id_fkey' AND conrelid = 'public.ops_ordem_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_alvo ADD CONSTRAINT ops_ordem_alvo_ativo_id_fkey FOREIGN KEY (ativo_id) REFERENCES ops_ativo(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_alvo_checklist_id_fkey' AND conrelid = 'public.ops_ordem_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_alvo ADD CONSTRAINT ops_ordem_alvo_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES ops_checklist(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_alvo_local_id_fkey' AND conrelid = 'public.ops_ordem_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_alvo ADD CONSTRAINT ops_ordem_alvo_local_id_fkey FOREIGN KEY (local_id) REFERENCES ops_local(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_alvo_ordem_id_fkey' AND conrelid = 'public.ops_ordem_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_alvo ADD CONSTRAINT ops_ordem_alvo_ordem_id_fkey FOREIGN KEY (ordem_id) REFERENCES ops_ordem(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_pessoa_ordem_id_fkey' AND conrelid = 'public.ops_ordem_pessoa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_pessoa ADD CONSTRAINT ops_ordem_pessoa_ordem_id_fkey FOREIGN KEY (ordem_id) REFERENCES ops_ordem(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_previsto_ordem_id_fkey' AND conrelid = 'public.ops_ordem_previsto'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_previsto ADD CONSTRAINT ops_ordem_previsto_ordem_id_fkey FOREIGN KEY (ordem_id) REFERENCES ops_ordem(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_checklist_tarefa_id_fkey' AND conrelid = 'public.ops_ordem_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa ADD CONSTRAINT ops_ordem_tarefa_checklist_tarefa_id_fkey FOREIGN KEY (checklist_tarefa_id) REFERENCES ops_checklist_tarefa(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_ordem_alvo_id_fkey' AND conrelid = 'public.ops_ordem_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa ADD CONSTRAINT ops_ordem_tarefa_ordem_alvo_id_fkey FOREIGN KEY (ordem_alvo_id) REFERENCES ops_ordem_alvo(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_ordem_id_fkey' AND conrelid = 'public.ops_ordem_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa ADD CONSTRAINT ops_ordem_tarefa_ordem_id_fkey FOREIGN KEY (ordem_id) REFERENCES ops_ordem(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_skill_id_fkey' AND conrelid = 'public.ops_ordem_tarefa'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa ADD CONSTRAINT ops_ordem_tarefa_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES ops_skill(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_medicao_corretiva_ordem_id_fkey' AND conrelid = 'public.ops_ordem_tarefa_medicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa_medicao ADD CONSTRAINT ops_ordem_tarefa_medicao_corretiva_ordem_id_fkey FOREIGN KEY (corretiva_ordem_id) REFERENCES ops_ordem(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_medicao_medicao_def_id_fkey' AND conrelid = 'public.ops_ordem_tarefa_medicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa_medicao ADD CONSTRAINT ops_ordem_tarefa_medicao_medicao_def_id_fkey FOREIGN KEY (medicao_def_id) REFERENCES ops_medicao_def(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_medicao_opcao_id_fkey' AND conrelid = 'public.ops_ordem_tarefa_medicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa_medicao ADD CONSTRAINT ops_ordem_tarefa_medicao_opcao_id_fkey FOREIGN KEY (opcao_id) REFERENCES ops_medicao_opcao(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_ordem_tarefa_medicao_ordem_tarefa_id_fkey' AND conrelid = 'public.ops_ordem_tarefa_medicao'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_ordem_tarefa_medicao ADD CONSTRAINT ops_ordem_tarefa_medicao_ordem_tarefa_id_fkey FOREIGN KEY (ordem_tarefa_id) REFERENCES ops_ordem_tarefa(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_horario_id_fkey' AND conrelid = 'public.ops_plano'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano ADD CONSTRAINT ops_plano_horario_id_fkey FOREIGN KEY (horario_id) REFERENCES ops_horario(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_alvo_ativo_id_fkey' AND conrelid = 'public.ops_plano_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano_alvo ADD CONSTRAINT ops_plano_alvo_ativo_id_fkey FOREIGN KEY (ativo_id) REFERENCES ops_ativo(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_alvo_checklist_id_fkey' AND conrelid = 'public.ops_plano_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano_alvo ADD CONSTRAINT ops_plano_alvo_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES ops_checklist(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_alvo_local_id_fkey' AND conrelid = 'public.ops_plano_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano_alvo ADD CONSTRAINT ops_plano_alvo_local_id_fkey FOREIGN KEY (local_id) REFERENCES ops_local(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_plano_alvo_plano_id_fkey' AND conrelid = 'public.ops_plano_alvo'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_plano_alvo ADD CONSTRAINT ops_plano_alvo_plano_id_fkey FOREIGN KEY (plano_id) REFERENCES ops_plano(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_sessao_trabalho_ordem_id_fkey' AND conrelid = 'public.ops_sessao_trabalho'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_sessao_trabalho ADD CONSTRAINT ops_sessao_trabalho_ordem_id_fkey FOREIGN KEY (ordem_id) REFERENCES ops_ordem(id) ON DELETE CASCADE';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_sessao_trabalho_ordem_tarefa_id_fkey' AND conrelid = 'public.ops_sessao_trabalho'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_sessao_trabalho ADD CONSTRAINT ops_sessao_trabalho_ordem_tarefa_id_fkey FOREIGN KEY (ordem_tarefa_id) REFERENCES ops_ordem_tarefa(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_utilizador_perfil_horario_id_fkey' AND conrelid = 'public.ops_utilizador_perfil'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_utilizador_perfil ADD CONSTRAINT ops_utilizador_perfil_horario_id_fkey FOREIGN KEY (horario_id) REFERENCES ops_horario(id) ON DELETE SET NULL';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_utilizador_skill_skill_id_fkey' AND conrelid = 'public.ops_utilizador_skill'::regclass) THEN
    EXECUTE 'ALTER TABLE public.ops_utilizador_skill ADD CONSTRAINT ops_utilizador_skill_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES ops_skill(id) ON DELETE CASCADE';
  END IF;
END $do$;

-- 3. Índices
CREATE INDEX IF NOT EXISTS ops_anexo_ordem_data_idx ON public.ops_anexo USING btree (ordem_id, carregado_em DESC);
CREATE INDEX IF NOT EXISTS ops_anexo_ordem_idx ON public.ops_anexo USING btree (ordem_id);
CREATE INDEX IF NOT EXISTS ops_anexo_tarefa_idx ON public.ops_anexo USING btree (ordem_tarefa_id) WHERE (ordem_tarefa_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ops_assinatura_ordem ON public.ops_assinatura USING btree (ordem_id);
CREATE INDEX IF NOT EXISTS ops_ativo_local_idx ON public.ops_ativo USING btree (organization_id, local_id);
CREATE INDEX IF NOT EXISTS ops_custo_catalogo_idx ON public.ops_custo USING btree (catalog_item_id) WHERE (catalog_item_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ops_custo_ordem_idx ON public.ops_custo USING btree (ordem_id, tipo);
CREATE INDEX IF NOT EXISTS ops_entrar_como_log_org_idx ON public.ops_entrar_como_log USING btree (organization_id, inicio DESC);
CREATE INDEX IF NOT EXISTS ops_evento_entidade_idx ON public.ops_evento USING btree (entidade, entidade_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ops_local_address_idx ON public.ops_local USING btree (address_id) WHERE (address_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ops_local_cliente_idx ON public.ops_local USING btree (organization_id, cliente_id);
CREATE INDEX IF NOT EXISTS ops_local_parent_idx ON public.ops_local USING btree (organization_id, parent_id);
CREATE INDEX IF NOT EXISTS ops_medicao_cat_idx ON public.ops_medicao_def USING btree (organization_id, categoria_ativo_id);
CREATE INDEX IF NOT EXISTS ops_mensagem_ordem_idx ON public.ops_mensagem USING btree (ordem_id, criada_em);
CREATE UNIQUE INDEX IF NOT EXISTS ops_obra_contrato_uidx ON public.ops_obra USING btree (contrato_id) WHERE ((contrato_id IS NOT NULL) AND (estado <> 'cancelada'::text));
CREATE UNIQUE INDEX IF NOT EXISTS ops_obra_orcamento_uidx ON public.ops_obra USING btree (orcamento_id) WHERE ((orcamento_id IS NOT NULL) AND (estado <> 'cancelada'::text));
CREATE INDEX IF NOT EXISTS ops_obra_org_idx ON public.ops_obra USING btree (organization_id, estado);
CREATE INDEX IF NOT EXISTS ops_obra_extra_obra_idx ON public.ops_obra_extra USING btree (obra_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS ops_obra_modelo_defeito_uidx ON public.ops_obra_modelo USING btree (organization_id) WHERE por_defeito;
CREATE INDEX IF NOT EXISTS ops_obra_modelo_tarefa_idx ON public.ops_obra_modelo_tarefa USING btree (modelo_id, modelo_fase_id, ordem);
CREATE UNIQUE INDEX IF NOT EXISTS ops_obra_registo_aberto_uidx ON public.ops_obra_registo USING btree (utilizador_id) WHERE (fim IS NULL);
CREATE INDEX IF NOT EXISTS ops_obra_registo_tarefa_idx ON public.ops_obra_registo USING btree (tarefa_id, utilizador_id);
CREATE INDEX IF NOT EXISTS ops_obra_ritmo_org_idx ON public.ops_obra_ritmo USING btree (organization_id);
CREATE INDEX IF NOT EXISTS ops_obra_ritmo_historico_idx ON public.ops_obra_ritmo_historico USING btree (servico_tarefa_id, em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ops_obra_servico_tarefa_chave_uidx ON public.ops_obra_servico_tarefa USING btree (organization_id, servico_id, chave) WHERE (chave IS NOT NULL);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_datas_idx ON public.ops_obra_tarefa USING btree (organization_id, inicio_planeado, fim_planeado);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_modelo_idx ON public.ops_obra_tarefa USING btree (modelo_tarefa_id) WHERE (modelo_tarefa_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_obra_idx ON public.ops_obra_tarefa USING btree (obra_id, fase_id, ordem);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_atraso_avisar_idx ON public.ops_obra_tarefa_atraso USING btree (organization_id, obra_id) WHERE (NOT cliente_avisado);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_atraso_tarefa_idx ON public.ops_obra_tarefa_atraso USING btree (tarefa_id, registado_em DESC);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_dependencia_dep_idx ON public.ops_obra_tarefa_dependencia USING btree (depende_de_id);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_dependencia_obra_idx ON public.ops_obra_tarefa_dependencia USING btree (obra_id);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_foto_tarefa_idx ON public.ops_obra_tarefa_foto USING btree (tarefa_id, carregado_em);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_pessoa_obra_idx ON public.ops_obra_tarefa_pessoa USING btree (obra_id);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_pessoa_tarefa_idx ON public.ops_obra_tarefa_pessoa USING btree (tarefa_id);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_pessoa_util_idx ON public.ops_obra_tarefa_pessoa USING btree (organization_id, utilizador_id);
CREATE INDEX IF NOT EXISTS ops_ordem_area_idx ON public.ops_ordem USING btree (organization_id, area_id);
CREATE INDEX IF NOT EXISTS ops_ordem_centro_custo_idx ON public.ops_ordem USING btree (organization_id, centro_custo_id);
CREATE INDEX IF NOT EXISTS ops_ordem_cliente_idx ON public.ops_ordem USING btree (organization_id, cliente_id, estado);
CREATE INDEX IF NOT EXISTS ops_ordem_estado_idx ON public.ops_ordem USING btree (organization_id, estado, agendada_para);
CREATE INDEX IF NOT EXISTS ops_ordem_local_idx ON public.ops_ordem USING btree (local_id, estado);
CREATE INDEX IF NOT EXISTS ops_ordem_orcamento_idx ON public.ops_ordem USING btree (orcamento_id) WHERE (orcamento_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ops_ordem_plano_idx ON public.ops_ordem USING btree (plano_id, agendada_para);
CREATE INDEX IF NOT EXISTS ops_ordem_responsavel_idx ON public.ops_ordem USING btree (organization_id, responsavel_id, estado);
CREATE INDEX IF NOT EXISTS ops_ordem_tipo_trabalho_idx ON public.ops_ordem USING btree (organization_id, tipo_trabalho_id);
CREATE INDEX IF NOT EXISTS ops_ordem_alvo_idx ON public.ops_ordem_alvo USING btree (ordem_id, posicao);
CREATE INDEX IF NOT EXISTS ops_previsto_ordem_idx ON public.ops_ordem_previsto USING btree (ordem_id, posicao);
CREATE INDEX IF NOT EXISTS ops_ordem_tarefa_idx ON public.ops_ordem_tarefa USING btree (ordem_id, ordem_alvo_id, posicao);
CREATE INDEX IF NOT EXISTS ops_medicao_def_idx ON public.ops_ordem_tarefa_medicao USING btree (medicao_def_id, lida_em DESC);
CREATE INDEX IF NOT EXISTS ops_medicao_tarefa_idx ON public.ops_ordem_tarefa_medicao USING btree (ordem_tarefa_id);
CREATE INDEX IF NOT EXISTS ops_rotulo_org_idx ON public.ops_rotulo USING btree (organization_id, lista, ordem);
CREATE INDEX IF NOT EXISTS ops_sessao_ordem_idx ON public.ops_sessao_trabalho USING btree (ordem_id);
CREATE INDEX IF NOT EXISTS ops_sessao_tarefa_idx ON public.ops_sessao_trabalho USING btree (ordem_tarefa_id) WHERE (ordem_tarefa_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ops_sessao_uma_aberta ON public.ops_sessao_trabalho USING btree (ordem_id, utilizador_id) WHERE (fim IS NULL);
CREATE INDEX IF NOT EXISTS ops_sessao_util_idx ON public.ops_sessao_trabalho USING btree (utilizador_id, inicio);
CREATE INDEX IF NOT EXISTS ops_skill_org_idx ON public.ops_skill USING btree (organization_id);

-- 4. Funções
DO $do$ BEGIN
  IF to_regprocedure('public.ops_agendar_relatorio(uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_agendar_relatorio(_ordem_id uuid, _autor_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o     record;
  v_email text;
  v_html  text;
  v_autor uuid;
BEGIN
  IF to_regclass('public.scheduled_emails') IS NULL THEN RETURN false; END IF;

  SELECT id, organization_id, cliente_id, codigo, titulo
    INTO v_o
    FROM public.ops_ordem
   WHERE id = _ordem_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Desligado à nascença. Ninguém escreve a um cliente por engano.
  IF public.ops_definicao_de(v_o.organization_id, 'relatorio_automatico') <> 'sim' THEN
    RETURN false;
  END IF;

  SELECT m.email INTO v_email
    FROM public.anew_clients cl
    JOIN public.anew_entity_emails m ON m.entity_id = cl.entity_id
   WHERE cl.id = v_o.cliente_id
   ORDER BY m.is_primary DESC NULLS LAST, m.created_at
   LIMIT 1;

  -- Sem email na ficha não há a quem escrever. Não é erro: é uma ficha por
  -- preencher, e quem a preencher passa a receber os relatórios seguintes.
  IF nullif(btrim(COALESCE(v_email, '')), '') IS NULL THEN RETURN false; END IF;

  -- Reabrir e voltar a confirmar não manda o relatório outra vez. Sem isto, um
  -- cliente recebia o mesmo email duas vezes por causa de uma correção interna.
  IF EXISTS (
    SELECT 1 FROM public.scheduled_emails
     WHERE entity_type = 'ops_ordem' AND entity_id = _ordem_id
       AND status IN ('pending', 'sent')
  ) THEN
    RETURN false;
  END IF;

  v_html := public.ops_relatorio_html(_ordem_id);
  IF v_html IS NULL THEN RETURN false; END IF;

  -- `scheduled_emails.user_id` serve para descobrir o SMTP de saída, e o
  -- resolvedor do CRM aceita tanto o id de autenticação como o de negócio.
  SELECT COALESCE(u.auth_user_id, u.id) INTO v_autor
    FROM public.anew_users u
   WHERE u.id = _autor_id;

  -- Sem autor não se sabe por que SMTP havia de sair. Acontece se a ordem for
  -- confirmada por um processo e não por uma pessoa.
  IF v_autor IS NULL THEN RETURN false; END IF;

  INSERT INTO public.scheduled_emails
    (user_id, organization_id, entity_type, entity_id,
     to_email, subject, body_html, scheduled_for, status)
  VALUES
    (v_autor, v_o.organization_id, 'ops_ordem', _ordem_id,
     btrim(v_email),
     v_o.codigo || ' — ' || v_o.titulo,
     v_html,
     now(), 'pending');

  -- Fica na ficha da ordem. Uma pessoa que abra a ordem daqui a um ano tem de
  -- poder ver que o cliente recebeu, para onde, e quando — sem ir procurar a
  -- uma tabela do CRM que ela nem sabe que existe.
  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', _ordem_id, 'relatorio_enviado',
     'Relatório enviado ao cliente para ' || btrim(v_email),
     _autor_id, NULL,
     jsonb_build_object('para', btrim(v_email), 'automatico', true));

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Relatório não agendado para %: %', _ordem_id, SQLERRM;
  RETURN false;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_agendar_relatorio(uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_agendar_relatorio(uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_ao_confirmar_ordem()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_ao_confirmar_ordem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.entidade = 'ordem' AND NEW.tipo = 'confirmar' THEN
    PERFORM public.ops_agendar_relatorio(NEW.entidade_id, NEW.autor_id);
  END IF;
  RETURN NULL;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_ao_confirmar_ordem() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_ao_confirmar_ordem() TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_ao_confirmar_ordem() TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_ao_confirmar_ordem() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_ao_confirmar_ordem() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_avaliar_leitura(text, numeric, numeric, numeric, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_avaliar_leitura(_tipo text, _valor_num numeric, _min numeric, _max numeric, "_opcao_má" boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE _tipo
    WHEN 'escolha' THEN NOT coalesce(_opcao_má, false)
    WHEN 'gama' THEN CASE
      WHEN _valor_num IS NULL THEN NULL
      WHEN _min IS NULL AND _max IS NULL THEN NULL
      WHEN _min IS NOT NULL AND _valor_num < _min THEN false
      WHEN _max IS NOT NULL AND _valor_num > _max THEN false
      ELSE true
    END
    -- Um contador não é conforme nem não conforme: é um número que sobe.
    -- O que interessa nele é a diferença, e essa lê-se no histórico.
    ELSE NULL
  END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_avaliar_leitura(text, numeric, numeric, numeric, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_avaliar_leitura(text, numeric, numeric, numeric, boolean) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_avaliar_leitura(text, numeric, numeric, numeric, boolean) TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_avaliar_leitura(text, numeric, numeric, numeric, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_avaliar_leitura(text, numeric, numeric, numeric, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_avaliar_medicao(numeric, numeric, numeric)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_avaliar_medicao(_valor numeric, _min numeric, _max numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN _valor IS NULL THEN NULL
    WHEN _min IS NOT NULL AND _valor < _min THEN 'nao_conforme'
    WHEN _max IS NOT NULL AND _valor > _max THEN 'nao_conforme'
    ELSE 'feita'
  END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_avaliar_medicao(numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_avaliar_medicao(numeric, numeric, numeric) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_avaliar_medicao(numeric, numeric, numeric) TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_avaliar_medicao(numeric, numeric, numeric) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_avaliar_medicao(numeric, numeric, numeric) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_avisar_atrasos()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_avisar_atrasos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o record;
  v_n integer := 0;
BEGIN
  -- Passou a hora e não começou.
  FOR v_o IN
    SELECT id, organization_id, codigo, titulo, responsavel_id, agendada_para
      FROM public.ops_ordem
     WHERE estado = 'agendada'
       AND agendada_para IS NOT NULL
       AND agendada_para < now()
  LOOP
    IF v_o.responsavel_id IS NOT NULL THEN
      IF public.ops_notificar(
           v_o.organization_id, v_o.responsavel_id, 'operacoes_ordem_atrasada',
           v_o.codigo || ' está atrasada',
           'Estava marcada para ' || to_char(v_o.agendada_para, 'DD/MM às HH24:MI')
             || ' e ainda não foi iniciada. ' || v_o.titulo,
           '/operacao/ordens/' || v_o.codigo, v_o.id, 'high') THEN
        v_n := v_n + 1;
      END IF;
    ELSE
      -- Sem responsável, o atraso é de quem devia ter distribuído.
      v_n := v_n + public.ops_notificar_coordenacao(
        v_o.organization_id, 'operacoes_ordem_atrasada',
        v_o.codigo || ' está atrasada e sem responsável',
        'Estava marcada para ' || to_char(v_o.agendada_para, 'DD/MM às HH24:MI')
          || ' e não tem ninguém atribuído. ' || v_o.titulo,
        '/operacao/ordens/' || v_o.codigo, v_o.id, 'high');
    END IF;
  END LOOP;

  -- Em pausa, e a data de retoma já passou.
  FOR v_o IN
    SELECT id, organization_id, codigo, titulo, responsavel_id,
           pausa_motivo, pausa_retoma_prevista
      FROM public.ops_ordem
     WHERE estado = 'pausada'
       AND pausa_retoma_prevista IS NOT NULL
       AND pausa_retoma_prevista < now()
  LOOP
    IF public.ops_notificar(
         v_o.organization_id, v_o.responsavel_id, 'operacoes_pausa_expirada',
         v_o.codigo || ' devia ter sido retomada',
         'Em pausa: ' || COALESCE(v_o.pausa_motivo, 'sem motivo registado')
           || '. A retoma estava prevista para '
           || to_char(v_o.pausa_retoma_prevista, 'DD/MM') || '.',
         '/operacao/ordens/' || v_o.codigo, v_o.id, 'high') THEN
      v_n := v_n + 1;
    END IF;

    v_n := v_n + public.ops_notificar_coordenacao(
      v_o.organization_id, 'operacoes_pausa_expirada',
      v_o.codigo || ' devia ter sido retomada',
      'A retoma estava prevista para '
        || to_char(v_o.pausa_retoma_prevista, 'DD/MM') || '. ' || v_o.titulo,
      '/operacao/ordens/' || v_o.codigo, v_o.id, 'high', v_o.responsavel_id);
  END LOOP;

  RETURN v_n;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_avisar_atrasos() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_avisar_atrasos() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_avisar_atrasos() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_caminho_da_ordem(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_caminho_da_ordem(_ordem_id uuid, _ficheiro text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.organization_id::text || '/' || o.id::text || '/' || _ficheiro
    FROM public.ops_ordem o
   WHERE o.id = _ordem_id
     AND ((SELECT auth.uid()) IS NULL
          OR public.ops_pode_ver_ordem((SELECT auth.uid()), o.id))
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_caminho_da_ordem(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_caminho_da_ordem(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_caminho_da_ordem(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_clientes_no_ambito(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_clientes_no_ambito(_auth_uid uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT uc.cliente_id
    FROM public.ops_utilizador_cliente uc
    JOIN public.anew_users au ON au.id = uc.utilizador_id
   WHERE au.auth_user_id = _auth_uid
     AND ((SELECT auth.uid()) IS NULL OR _auth_uid = (SELECT auth.uid()))
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_clientes_no_ambito(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_clientes_no_ambito(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_clientes_no_ambito(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_conflitos_de_agenda(uuid, timestamp with time zone, timestamp with time zone, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_conflitos_de_agenda(_utilizador_id uuid, _inicio timestamp with time zone, _fim timestamp with time zone, _excluir_ordem uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ordem_id uuid, codigo text, titulo text, agendada_para timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.codigo, o.titulo, o.agendada_para
    FROM public.ops_ordem o
   WHERE o.agendada_para IS NOT NULL
     AND o.estado IN ('agendada','em_curso','pausada')
     AND (_excluir_ordem IS NULL OR o.id <> _excluir_ordem)
     AND (o.responsavel_id = _utilizador_id
          OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa p
                      WHERE p.ordem_id = o.id AND p.utilizador_id = _utilizador_id))
     -- Sem janela declarada, assume-se uma hora. É melhor do que assumir zero,
     -- que faria duas visitas à mesma hora nunca chocarem.
     AND tstzrange(COALESCE(o.janela_inicio, o.agendada_para),
                   COALESCE(o.janela_fim, o.agendada_para + interval '1 hour'), '[)')
         && tstzrange(_inicio, COALESCE(_fim, _inicio + interval '1 hour'), '[)')
   ORDER BY o.agendada_para
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_conflitos_de_agenda(uuid, timestamp with time zone, timestamp with time zone, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_conflitos_de_agenda(uuid, timestamp with time zone, timestamp with time zone, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_contexto_de_execucao(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_contexto_de_execucao(_ordem_id uuid)
 RETURNS TABLE(utilizador_id uuid, funcao text, organization_id uuid, estado text, atribuido boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o      record;
  v_user   uuid;
  v_funcao text;
  v_atr    boolean;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = _ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF NOT public.ops_pode(v_o.organization_id, 'operations.orders.execute') THEN
    RAISE EXCEPTION 'Sem permissão para executar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_atr := COALESCE(v_o.responsavel_id = v_user, false)
    OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa op
                WHERE op.ordem_id = _ordem_id AND op.utilizador_id = v_user);

  IF v_funcao = 'tecnico' AND NOT v_atr THEN
    RAISE EXCEPTION 'Só quem está na ordem conta tempo nela.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY SELECT v_user, v_funcao, v_o.organization_id, v_o.estado, v_atr;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_contexto_de_execucao(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_contexto_de_execucao(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_contrato_orcamento(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_contrato_orcamento(_contrato_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote    uuid;
  v_proposta uuid;
BEGIN
  IF _contrato_id IS NULL OR to_regclass('public.client_contracts') IS NULL THEN
    RETURN NULL;
  END IF;

  EXECUTE 'SELECT quote_id, ' ||
          CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                             WHERE table_schema = 'public' AND table_name = 'client_contracts'
                               AND column_name = 'proposal_id')
               THEN 'proposal_id' ELSE 'NULL::uuid' END ||
          ' FROM public.client_contracts WHERE id = $1'
     INTO v_quote, v_proposta USING _contrato_id;

  IF v_quote IS NOT NULL OR v_proposta IS NULL THEN
    RETURN v_quote;
  END IF;

  IF to_regclass('public.proposal_quote_selections') IS NOT NULL THEN
    EXECUTE 'SELECT quote_id FROM public.proposal_quote_selections
              WHERE proposal_id = $1 AND selected AND quote_id IS NOT NULL LIMIT 1'
       INTO v_quote USING v_proposta;
    IF v_quote IS NOT NULL THEN RETURN v_quote; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'proposal_id') THEN
    EXECUTE 'SELECT id FROM public.quotes WHERE proposal_id = $1
              ORDER BY accepted_at DESC NULLS LAST, created_at DESC LIMIT 1'
       INTO v_quote USING v_proposta;
    IF v_quote IS NOT NULL THEN RETURN v_quote; END IF;
  END IF;

  IF to_regclass('public.pipeline_links') IS NOT NULL THEN
    EXECUTE 'SELECT q.id FROM public.pipeline_links pl JOIN public.quotes q ON q.id = pl.quote_id
              WHERE pl.proposal_id = $1 ORDER BY q.created_at DESC LIMIT 1'
       INTO v_quote USING v_proposta;
  END IF;

  RETURN v_quote;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_contrato_orcamento(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_contrato_orcamento(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_contrato_orcamento(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_criar_corretiva(uuid, text, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_criar_corretiva(_tarefa_id uuid, _detalhe text DEFAULT NULL::text, _autor_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t          record;
  v_o          record;
  v_ativo_id   uuid;
  v_local_id   uuid;
  v_ativo_nome text;
  v_local_nome text;
  v_onde       text;
  v_descricao  text;
  v_nova_id    uuid;
  v_nova_cod   text;
BEGIN
  SELECT * INTO v_t FROM public.ops_ordem_tarefa WHERE id = _tarefa_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = v_t.ordem_id;

  SELECT a.ativo_id, COALESCE(a.local_id, v_o.local_id)
    INTO v_ativo_id, v_local_id
    FROM public.ops_ordem_alvo a WHERE a.id = v_t.ordem_alvo_id;
  v_local_id := COALESCE(v_local_id, v_o.local_id);

  SELECT nome INTO v_ativo_nome FROM public.ops_ativo WHERE id = v_ativo_id;
  SELECT nome INTO v_local_nome FROM public.ops_local WHERE id = v_local_id;
  v_onde := nullif(concat_ws(' — ', v_ativo_nome, v_local_nome), '');

  v_descricao := 'Não conformidade detetada em "' || v_t.nome || '".';
  IF nullif(btrim(coalesce(_detalhe, '')), '') IS NOT NULL THEN
    v_descricao := v_descricao || E'
' || _detalhe;
  END IF;
  v_descricao := v_descricao || E'
' || 'Gerada a partir de ' || v_o.codigo || '.';

  v_nova_cod := public.ops_proximo_codigo_interno(v_o.organization_id, 'OT');

  INSERT INTO public.ops_ordem (
    organization_id, codigo, origem, estado, prioridade,
    area, tipo, cliente_id, local_id, titulo, descricao,
    gerada_por_tarefa_id, criada_por
  ) VALUES (
    v_o.organization_id, v_nova_cod, 'corretiva', 'por_aprovar', 'alta',
    v_o.area, v_o.tipo, v_o.cliente_id, v_local_id,
    COALESCE(v_t.nome || CASE WHEN v_onde IS NOT NULL THEN ' — ' || v_onde ELSE '' END, v_t.nome),
    v_descricao, _tarefa_id, _autor_id
  ) RETURNING id INTO v_nova_id;

  -- O ativo em causa fica como alvo da ordem nova, para quem a receber saber
  -- exatamente o que ir ver.
  IF v_ativo_id IS NOT NULL OR v_local_id IS NOT NULL THEN
    INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id, local_id)
    VALUES (v_nova_id, v_ativo_id, v_local_id);
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', v_nova_id, 'gerada_por_nao_conformidade',
     'Gerada a partir da tarefa "' || v_t.nome || '" da ordem ' || v_o.codigo,
     _autor_id, NULL, jsonb_build_object('codigo', v_nova_cod));

  RETURN v_nova_cod;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_criar_corretiva(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_criar_corretiva(uuid, text, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_criar_ordem_impl(text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_criar_ordem_impl(p_titulo text, p_cliente_id uuid, p_origem text DEFAULT 'corretiva'::text, p_prioridade text DEFAULT 'normal'::text, p_descricao text DEFAULT NULL::text, p_local_id uuid DEFAULT NULL::uuid, p_ativo_id uuid DEFAULT NULL::uuid, p_checklist_id uuid DEFAULT NULL::uuid, p_area text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_contacto_nome text DEFAULT NULL::text, p_contacto_telefone text DEFAULT NULL::text, p_agendada_para timestamp with time zone DEFAULT NULL::timestamp with time zone, p_responsavel_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid;
  v_funcao   text;
  v_org      uuid;
  v_titulo   text := nullif(btrim(coalesce(p_titulo, '')), '');
  v_codigo   text;
  v_estado   text;
  v_id       uuid;
  v_alvo     uuid;
  v_versao   integer;
  v_local    uuid := p_local_id;
BEGIN
  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'Uma ordem precisa de um título. É o que aparece na lista.';
  END IF;

  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Uma ordem precisa de um cliente.';
  END IF;

  SELECT organization_id INTO v_org FROM public.anew_clients WHERE id = p_cliente_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(v_org) q;

  IF NOT public.ops_pode(v_org, 'operations.orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_origem NOT IN ('preventiva','corretiva','obra') THEN
    RAISE EXCEPTION 'Origem inválida: %. Vale preventiva, corretiva ou obra.', p_origem;
  END IF;
  IF p_prioridade NOT IN ('baixa','normal','alta','urgente') THEN
    RAISE EXCEPTION 'Prioridade inválida: %.', p_prioridade;
  END IF;

  IF p_local_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_local WHERE id = p_local_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Esse local não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ativo_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.ops_ativo
                    WHERE id = p_ativo_id AND organization_id = v_org) THEN
      RAISE EXCEPTION 'Esse ativo não é desta organização.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_local IS NULL THEN
      SELECT local_id INTO v_local FROM public.ops_ativo WHERE id = p_ativo_id;
    END IF;
  END IF;

  IF p_checklist_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_checklist
     WHERE id = p_checklist_id AND organization_id = v_org AND estado = 'publicada') THEN
    RAISE EXCEPTION 'Essa checklist não existe, não é desta organização, ou não está publicada.';
  END IF;

  IF p_responsavel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = p_responsavel_id AND organization_id = v_org AND ativo) THEN
    RAISE EXCEPTION 'Essa pessoa não está ativa em Operações nesta organização.';
  END IF;

  v_estado := CASE WHEN v_funcao = 'tecnico' THEN 'por_aprovar' ELSE 'agendada' END;
  v_codigo := public.ops_proximo_codigo_interno(v_org, 'OT');

  INSERT INTO public.ops_ordem (
    organization_id, codigo, origem, estado, prioridade, area, tipo,
    cliente_id, local_id, titulo, descricao,
    contacto_nome, contacto_telefone, agendada_para, responsavel_id, criada_por
  ) VALUES (
    v_org, v_codigo, p_origem, v_estado, p_prioridade, p_area, p_tipo,
    p_cliente_id, v_local, v_titulo, nullif(btrim(coalesce(p_descricao,'')), ''),
    nullif(btrim(coalesce(p_contacto_nome,'')), ''),
    nullif(btrim(coalesce(p_contacto_telefone,'')), ''),
    p_agendada_para, p_responsavel_id, v_user
  ) RETURNING id INTO v_id;

  IF p_ativo_id IS NOT NULL OR v_local IS NOT NULL OR p_checklist_id IS NOT NULL THEN
    SELECT versao INTO v_versao FROM public.ops_checklist WHERE id = p_checklist_id;

    INSERT INTO public.ops_ordem_alvo
      (ordem_id, ativo_id, local_id, checklist_id, checklist_versao, posicao)
    VALUES (v_id, p_ativo_id, v_local, p_checklist_id, v_versao, 0)
    RETURNING id INTO v_alvo;

    IF p_checklist_id IS NOT NULL THEN
      INSERT INTO public.ops_ordem_tarefa (
        ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome,
        tipo, skill_id, privada, obrigatoria, tempo_estimado
      )
      SELECT v_id, v_alvo, ct.id, ct.posicao, ct.codigo, ct.nome, ct.tipo,
             ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
        FROM public.ops_checklist_tarefa ct
       WHERE ct.checklist_id = p_checklist_id
       ORDER BY ct.posicao;

      INSERT INTO public.ops_ordem_tarefa_medicao (
        ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
      SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
        FROM public.ops_ordem_tarefa ot
        JOIN public.ops_checklist_tarefa_medicao ctm
          ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
        JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
       WHERE ot.ordem_id = v_id
      ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;
    END IF;
  END IF;

  IF p_responsavel_id IS NOT NULL THEN
    INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel)
    VALUES (v_id, p_responsavel_id, 'responsavel')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_org, 'ordem', v_id, 'criada', v_titulo, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'estado', v_estado, 'origem', p_origem));

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'codigo', v_codigo,
    'estado', v_estado,
    'tarefas', (SELECT count(*) FROM public.ops_ordem_tarefa WHERE ordem_id = v_id)
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_criar_ordem_impl(text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_criar_ordem_impl(text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_definicao_de(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_definicao_de(_org_id uuid, _chave text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT valor FROM public.ops_definicao
      WHERE organization_id = _org_id AND chave = _chave),
    CASE _chave WHEN 'relatorio_automatico' THEN 'nao' ELSE NULL END
  );
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_definicao_de(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_definicao_de(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_definicao_de(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_disponibilidade(uuid, uuid, timestamp with time zone, timestamp with time zone)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_disponibilidade(_utilizador_id uuid, _org_id uuid, _inicio timestamp with time zone, _fim timestamp with time zone)
 RETURNS TABLE(tipo text, detalhe text, desde date, ate date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_recurso uuid;
  v_ini     date := _inicio::date;
  v_fim     date := COALESCE(_fim, _inicio)::date;
BEGIN
  -- Âmbito, antes de tudo. Esta função lê tabelas do CRM com os privilégios de
  -- quem a criou; sem esta linha, qualquer sessão lia a agenda de toda a gente.
  IF NOT (
    public.is_system_admin_user(v_uid)
    OR _org_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- E a pessoa tem de ser da equipa de Operações desta organização. Sem isto,
  -- daria para sondar a agenda de qualquer utilizador do CRM.
  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = _utilizador_id AND organization_id = _org_id
  ) THEN
    RETURN;
  END IF;

  IF to_regclass('public.schedule_resources') IS NULL THEN
    RETURN;
  END IF;

  SELECT sr.id INTO v_recurso
    FROM public.schedule_resources sr
   WHERE sr.user_id = _utilizador_id
     AND (sr.organization_id = _org_id OR sr.organization_id IS NULL)
     AND COALESCE(sr.is_active, true)
   LIMIT 1;

  -- ── Feriados ────────────────────────────────────────────────────────────
  -- Independentes da pessoa: um feriado é feriado para toda a gente. Ficam
  -- antes das outras verificações porque não precisam de recurso nenhum —
  -- quem ainda não está na agenda do CRM continua a ver os feriados.
  IF to_regclass('public.schedule_holidays') IS NOT NULL THEN
    RETURN QUERY
    SELECT 'feriado'::text,
           h.name::text,
           h.holiday_date,
           h.holiday_date
      FROM public.schedule_holidays h
     WHERE h.holiday_date BETWEEN v_ini AND v_fim
       AND (h.organization_id = _org_id OR h.organization_id IS NULL);
  END IF;

  IF v_recurso IS NULL THEN
    RETURN;
  END IF;

  -- ── Ausências ───────────────────────────────────────────────────────────
  -- Só as aprovadas. Um pedido de férias por aprovar não impede nada — ainda
  -- pode ser recusado, e travar o agendamento por causa dele seria decidir
  -- pelas costas de quem aprova.
  --
  -- Ver a nota de privacidade no topo: daqui só saem datas.
  IF to_regclass('public.resource_time_off') IS NOT NULL THEN
    RETURN QUERY
    SELECT 'ausente'::text,
           'Ausência marcada e aprovada'::text,
           t.start_date,
           t.end_date
      FROM public.resource_time_off t
     WHERE t.resource_id = v_recurso
       AND COALESCE(t.approved, false)
       AND daterange(t.start_date, t.end_date, '[]') && daterange(v_ini, v_fim, '[]');
  END IF;

  -- ── Fora do horário ─────────────────────────────────────────────────────
  -- Só se avisa quando a pessoa TEM horário declarado. Sem regras nenhumas,
  -- o silêncio quer dizer "não sabemos", e não "não trabalha" — avisar aí
  -- encheria o ecrã de avisos falsos para toda a gente que ainda não tem
  -- horário no CRM, e o resultado seria ninguém ler nenhum.
  IF to_regclass('public.resource_availability_rules') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.resource_availability_rules r
                  WHERE r.resource_id = v_recurso AND COALESCE(r.is_available, true))
     AND NOT EXISTS (
       SELECT 1
         FROM public.resource_availability_rules r
        WHERE r.resource_id = v_recurso
          AND COALESCE(r.is_available, true)
          AND r.day_of_week = EXTRACT(dow FROM _inicio)::int
          AND r.start_time <= _inicio::time
          AND r.end_time   >= _inicio::time
          AND (r.valid_from  IS NULL OR r.valid_from  <= v_ini)
          AND (r.valid_until IS NULL OR r.valid_until >= v_ini)
     ) THEN
    RETURN QUERY
    SELECT 'fora_de_horario'::text,
           'Fora do horário declarado desta pessoa'::text,
           v_ini,
           v_ini;
  END IF;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_disponibilidade(uuid, uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_disponibilidade(uuid, uuid, timestamp with time zone, timestamp with time zone) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_disponibilidade(uuid, uuid, timestamp with time zone, timestamp with time zone) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_entrar_como_verificar(uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_entrar_como_verificar(p_org uuid, p_alvo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu       uuid;
  v_funcao   text;
  v_alvo     record;
  v_falta    text;
BEGIN
  SELECT q.utilizador_id, q.funcao INTO v_eu, v_funcao FROM public.ops_quem_sou(p_org) q;

  IF v_funcao IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Só o admin de Operações pode entrar como outra pessoa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_alvo = v_eu THEN
    RAISE EXCEPTION 'Já estás na tua conta.';
  END IF;

  SELECT u.id, u.auth_user_id, u.email, u.name, p.funcao
    INTO v_alvo
    FROM public.anew_users u
    JOIN public.ops_utilizador_perfil p
      ON p.utilizador_id = u.id AND p.organization_id = p_org AND p.ativo
   WHERE u.id = p_alvo AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Essa pessoa não tem perfil ativo de Operações nesta organização.';
  END IF;
  IF v_alvo.auth_user_id IS NULL OR coalesce(v_alvo.email, '') = '' THEN
    RAISE EXCEPTION 'Essa pessoa não tem conta de acesso (sem email/login).';
  END IF;
  IF public.ops_nivel_funcao(v_alvo.funcao) <= public.ops_nivel_funcao('admin') THEN
    RAISE EXCEPTION 'Não se entra como outro admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF public.is_system_admin_user(v_alvo.auth_user_id) THEN
    RAISE EXCEPTION 'Não se entra como um admin de sistema.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 4. Nada que eu não tenha. O admin de sistema tem tudo.
  IF NOT public.is_system_admin_user((SELECT auth.uid())) THEN
    SELECT string_agg(DISTINCT coalesce(o.name, ma.organization_id::text), ', ')
      INTO v_falta
      FROM public.anew_memberships ma
      LEFT JOIN public.anew_organizations o ON o.id = ma.organization_id
     WHERE ma.user_id = p_alvo AND ma.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM public.anew_memberships me
          WHERE me.user_id = v_eu AND me.status = 'active'
            AND me.organization_id = ma.organization_id
            AND NOT EXISTS (
              SELECT 1 FROM public.anew_role_permissions rpa
               WHERE rpa.role_id = ma.role_id
                 AND NOT EXISTS (
                   SELECT 1 FROM public.anew_role_permissions rpe
                    WHERE rpe.role_id = me.role_id
                      AND rpe.permission_code = rpa.permission_code)));
    IF v_falta IS NOT NULL THEN
      RAISE EXCEPTION 'Essa pessoa tem acessos que tu não tens (em: %). Não podes entrar como ela.', v_falta
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'admin_id', v_eu,
    'alvo_id', v_alvo.id,
    'auth_user_id', v_alvo.auth_user_id,
    'email', v_alvo.email,
    'nome', v_alvo.name,
    'funcao', v_alvo.funcao);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_entrar_como_verificar(uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_entrar_como_verificar(uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_entrar_como_verificar(uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_escapar_html(text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_escapar_html(_t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT replace(replace(replace(replace(replace(
           COALESCE(_t, ''),
           '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_escapar_html(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_escapar_html(text) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_escapar_html(text) TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_escapar_html(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_escapar_html(text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_exige_criacao(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_exige_criacao(_org_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_funcao text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Isso é de outra organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = _org_id AND ativo;

  IF COALESCE(v_funcao, '') NOT IN ('admin', 'gestor', 'operador') THEN
    RAISE EXCEPTION 'Sem permissão para criar.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_user;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_exige_criacao(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_exige_criacao(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_exige_criacao(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_exige_gestao(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_exige_gestao(_org_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_funcao text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do teu alcance.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = _org_id AND ativo;

  IF COALESCE(v_funcao, '') NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Só quem gere é que mexe nestas listas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_user;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_exige_gestao(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_exige_gestao(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_exige_gestao(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_expandir_rrule(text, date, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_expandir_rrule(_regra text, _inicio date, _fim date)
 RETURNS SETOF date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_partes  text[];
  v_parte   text;
  v_freq    text;
  v_inter   integer := 1;
  v_byday   text[];
  v_bymday  integer[];
  v_count   integer;
  v_until   date;
  v_d       date;
  v_n       integer := 0;
  v_passo   interval;
  v_dow     text[] := ARRAY['SU','MO','TU','WE','TH','FR','SA'];
  v_tok     text;
  v_ord     integer;
  v_dia     text;
  v_base    date;
  v_cand    date;
  v_i       integer;
BEGIN
  IF _regra IS NULL OR btrim(_regra) = '' THEN RETURN; END IF;

  v_partes := string_to_array(upper(replace(btrim(_regra), 'RRULE:', '')), ';');

  FOREACH v_parte IN ARRAY v_partes LOOP
    CASE split_part(v_parte, '=', 1)
      WHEN 'FREQ'       THEN v_freq  := split_part(v_parte, '=', 2);
      WHEN 'INTERVAL'   THEN v_inter := GREATEST(split_part(v_parte, '=', 2)::integer, 1);
      WHEN 'BYDAY'      THEN v_byday := string_to_array(split_part(v_parte, '=', 2), ',');
      WHEN 'BYMONTHDAY' THEN v_bymday := string_to_array(split_part(v_parte, '=', 2), ',')::integer[];
      WHEN 'COUNT'      THEN v_count := split_part(v_parte, '=', 2)::integer;
      WHEN 'UNTIL'      THEN v_until := to_date(left(split_part(v_parte, '=', 2), 8), 'YYYYMMDD');
      WHEN 'WKST'       THEN NULL;
      WHEN ''           THEN NULL;
      ELSE
        RAISE EXCEPTION 'Parte de RRULE não suportada: %', v_parte;
    END CASE;
  END LOOP;

  IF v_freq IS NULL THEN RAISE EXCEPTION 'RRULE sem FREQ: %', _regra; END IF;
  IF v_until IS NOT NULL THEN _fim := LEAST(_fim, v_until); END IF;

  CASE v_freq
    WHEN 'DAILY'   THEN v_passo := (v_inter || ' days')::interval;
    WHEN 'WEEKLY'  THEN v_passo := (v_inter || ' weeks')::interval;
    WHEN 'MONTHLY' THEN v_passo := (v_inter || ' months')::interval;
    WHEN 'YEARLY'  THEN v_passo := (v_inter || ' years')::interval;
    ELSE RAISE EXCEPTION 'FREQ não suportada: %', v_freq;
  END CASE;

  v_d := _inicio;

  WHILE v_d <= _fim LOOP

    IF v_freq = 'WEEKLY' AND v_byday IS NOT NULL THEN
      FOR v_i IN 0..6 LOOP
        IF (v_d + v_i) BETWEEN _inicio AND _fim
           AND v_dow[EXTRACT(DOW FROM (v_d + v_i))::int + 1] = ANY (v_byday) THEN
          IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
          v_n := v_n + 1;
          RETURN NEXT (v_d + v_i);
        END IF;
      END LOOP;

    ELSIF v_freq = 'MONTHLY' AND v_byday IS NOT NULL THEN
      -- "Primeira segunda-feira", "última sexta-feira". BYDAY com ordinal.
      v_base := date_trunc('month', v_d)::date;
      FOREACH v_tok IN ARRAY v_byday LOOP
        v_ord := NULLIF(regexp_replace(v_tok, '[A-Z]', '', 'g'), '')::integer;
        v_dia := regexp_replace(v_tok, '[^A-Z]', '', 'g');

        IF v_ord IS NULL THEN
          RAISE EXCEPTION 'BYDAY sem ordinal não é suportado em FREQ=MONTHLY: %', v_tok;
        END IF;

        IF v_ord > 0 THEN
          -- Primeiro dia do mês que calha nesse dia da semana, mais (ord-1) semanas.
          v_cand := v_base;
          WHILE v_dow[EXTRACT(DOW FROM v_cand)::int + 1] <> v_dia LOOP
            v_cand := v_cand + 1;
          END LOOP;
          v_cand := v_cand + (v_ord - 1) * 7;
          -- Se transbordou para o mês seguinte, esse mês não tem esse ordinal.
          IF EXTRACT(MONTH FROM v_cand) <> EXTRACT(MONTH FROM v_base) THEN
            CONTINUE;
          END IF;
        ELSE
          -- Ordinal negativo: contar a partir do fim do mês.
          v_cand := (v_base + interval '1 month - 1 day')::date;
          WHILE v_dow[EXTRACT(DOW FROM v_cand)::int + 1] <> v_dia LOOP
            v_cand := v_cand - 1;
          END LOOP;
          v_cand := v_cand + (v_ord + 1) * 7;
          IF EXTRACT(MONTH FROM v_cand) <> EXTRACT(MONTH FROM v_base) THEN
            CONTINUE;
          END IF;
        END IF;

        IF v_cand BETWEEN _inicio AND _fim THEN
          IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
          v_n := v_n + 1;
          RETURN NEXT v_cand;
        END IF;
      END LOOP;

    ELSIF v_freq = 'MONTHLY' AND v_bymday IS NOT NULL THEN
      FOR v_i IN 1..array_length(v_bymday, 1) LOOP
        IF v_bymday[v_i] <= EXTRACT(DAY FROM (date_trunc('month', v_d) + interval '1 month - 1 day'))::int THEN
          v_cand := date_trunc('month', v_d)::date + (v_bymday[v_i] - 1);
          IF v_cand BETWEEN _inicio AND _fim THEN
            IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
            v_n := v_n + 1;
            RETURN NEXT v_cand;
          END IF;
        END IF;
      END LOOP;

    ELSE
      IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
      v_n := v_n + 1;
      RETURN NEXT v_d;
    END IF;

    v_d := (v_d + v_passo)::date;
  END LOOP;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_expandir_rrule(text, date, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_expandir_rrule(text, date, date) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_expandir_rrule(text, date, date) TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_expandir_rrule(text, date, date) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_expandir_rrule(text, date, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_funcao_atual(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_funcao_atual(_org_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.funcao
       FROM public.ops_utilizador_perfil p
      WHERE p.organization_id = _org_id
        AND p.utilizador_id = public.current_business_user_id()
        AND p.ativo
        AND _org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))),
    CASE WHEN public.is_system_admin_user((SELECT auth.uid())) THEN 'admin' END)
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_funcao_atual(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_funcao_atual(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_funcao_atual(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_gerar_proxima_dinamica(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_gerar_proxima_dinamica(_ordem_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o      record;
  v_p      record;
  v_codigo text;
  v_nova   uuid;
  v_quando timestamptz;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = _ordem_id;
  IF v_o.plano_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_p FROM public.ops_plano
   WHERE id = v_o.plano_id AND estado = 'ativo' AND tipo_recorrencia = 'dinamica';
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_p.fim_em IS NOT NULL AND v_p.fim_em < current_date THEN RETURN NULL; END IF;

  -- Só uma aberta de cada vez. É a propriedade que torna esta recorrência
  -- imune ao problema das ordens acumuladas.
  IF EXISTS (
    SELECT 1 FROM public.ops_ordem o
     WHERE o.plano_id = v_p.id
       AND o.estado IN ('por_aprovar','agendada','em_curso','pausada')
  ) THEN
    RETURN NULL;
  END IF;

  v_quando := now() + (v_p.intervalo_horas || ' hours')::interval;
  v_codigo := public.ops_proximo_codigo_interno(v_p.organization_id, 'OT');

  INSERT INTO public.ops_ordem (
    organization_id, codigo, origem, estado, cliente_id, plano_id,
    titulo, responsavel_id, agendada_para
  ) VALUES (
    v_p.organization_id, v_codigo, 'preventiva', 'agendada',
    v_p.cliente_id, v_p.id, v_p.nome, v_p.responsavel_id, v_quando
  ) RETURNING id INTO v_nova;

  INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id, local_id, checklist_id, checklist_versao)
  SELECT v_nova, pa.ativo_id, pa.local_id, pa.checklist_id, c.versao
    FROM public.ops_plano_alvo pa
    LEFT JOIN public.ops_checklist c ON c.id = pa.checklist_id
   WHERE pa.plano_id = v_p.id;

  INSERT INTO public.ops_ordem_tarefa (
    ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome, tipo,
    skill_id, privada, obrigatoria, tempo_estimado
  )
  SELECT v_nova, oa.id, ct.id, ct.posicao, ct.codigo, ct.nome, ct.tipo,
         ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
    FROM public.ops_ordem_alvo oa
    JOIN public.ops_checklist_tarefa ct ON ct.checklist_id = oa.checklist_id
   WHERE oa.ordem_id = v_nova;

  -- As medições nascem com a ordem, vazias. Congeladas aqui, como a versão da
  -- checklist: mudar os limites amanhã não reescreve o veredicto de ontem.
  INSERT INTO public.ops_ordem_tarefa_medicao (
    ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
  SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
    FROM public.ops_ordem_tarefa ot
    JOIN public.ops_checklist_tarefa_medicao ctm
      ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
    JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
   WHERE ot.ordem_id = v_nova
  ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, antes, depois)
  VALUES
    (v_p.organization_id, 'ordem', v_nova, 'gerada_por_plano_dinamico',
     'Gerada ' || v_p.intervalo_horas || 'h após o fecho de ' || v_o.codigo,
     NULL, jsonb_build_object('codigo', v_codigo));

  RETURN v_nova;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_gerar_proxima_dinamica(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_gerar_proxima_dinamica(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_gravar_plano_impl(uuid, text, uuid, text, text, integer, time without time zone, date, date, uuid, text, integer, jsonb)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_gravar_plano_impl(p_plano_id uuid, p_nome text, p_cliente_id uuid, p_tipo_recorrencia text DEFAULT 'calendario'::text, p_regra text DEFAULT NULL::text, p_intervalo_horas integer DEFAULT NULL::integer, p_hora_prevista time without time zone DEFAULT '09:00:00'::time without time zone, p_inicio_em date DEFAULT NULL::date, p_fim_em date DEFAULT NULL::date, p_responsavel_id uuid DEFAULT NULL::uuid, p_estado text DEFAULT 'ativo'::text, p_duracao integer DEFAULT 0, p_alvos jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_org    uuid;
  v_nome   text := nullif(btrim(coalesce(p_nome, '')), '');
  v_codigo text;
  v_id     uuid := p_plano_id;
  v_teste  date;
  v_alvo   jsonb;
  v_n      integer := 0;
  v_criado boolean := (p_plano_id IS NULL);
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Um plano precisa de um nome. É por ele que se encontra na lista.';
  END IF;

  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Um plano precisa de um cliente.';
  END IF;

  SELECT organization_id INTO v_org FROM public.anew_clients WHERE id = p_cliente_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(v_org) q;

  IF NOT public.ops_pode(v_org, 'operations.plans.manage') THEN
    RAISE EXCEPTION 'Sem permissão para gerir planos preventivos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tipo_recorrencia NOT IN ('calendario','dinamica') THEN
    RAISE EXCEPTION 'Tipo de recorrência inválido: %.', p_tipo_recorrencia;
  END IF;

  IF p_estado NOT IN ('ativo','suspenso','terminado') THEN
    RAISE EXCEPTION 'Estado de plano inválido: %.', p_estado;
  END IF;

  IF p_tipo_recorrencia = 'calendario' THEN
    IF nullif(btrim(coalesce(p_regra, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Um plano de calendário precisa de uma regra de recorrência.';
    END IF;

    BEGIN
      SELECT d INTO v_teste
        FROM public.ops_expandir_rrule(
               p_regra,
               COALESCE(p_inicio_em, CURRENT_DATE),
               COALESCE(p_inicio_em, CURRENT_DATE) + 365) d
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Essa regra não é suportada: %', SQLERRM;
    END;

    IF v_teste IS NULL THEN
      RAISE EXCEPTION
        'Essa regra não gera nenhuma data no próximo ano. Confirma o dia e a frequência.';
    END IF;

  ELSE
    IF p_intervalo_horas IS NULL OR p_intervalo_horas <= 0 THEN
      RAISE EXCEPTION 'Um plano dinâmico precisa de um intervalo em horas maior do que zero.';
    END IF;
  END IF;

  IF p_fim_em IS NOT NULL AND p_fim_em < COALESCE(p_inicio_em, CURRENT_DATE) THEN
    RAISE EXCEPTION 'O plano acaba antes de começar.';
  END IF;

  IF p_responsavel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = p_responsavel_id AND organization_id = v_org AND ativo) THEN
    RAISE EXCEPTION 'Essa pessoa não está ativa em Operações nesta organização.';
  END IF;

  IF v_criado THEN
    v_codigo := public.ops_proximo_codigo_interno(v_org, 'PLN');

    INSERT INTO public.ops_plano (
      organization_id, codigo, nome, cliente_id, estado, tipo_recorrencia,
      regra_recorrencia, intervalo_horas, hora_prevista, duracao_estimada,
      responsavel_id, inicio_em, fim_em)
    VALUES (
      v_org, v_codigo, v_nome, p_cliente_id, p_estado, p_tipo_recorrencia,
      CASE WHEN p_tipo_recorrencia = 'calendario' THEN p_regra END,
      CASE WHEN p_tipo_recorrencia = 'dinamica' THEN p_intervalo_horas END,
      COALESCE(p_hora_prevista, '09:00'), COALESCE(p_duracao, 0),
      p_responsavel_id, COALESCE(p_inicio_em, CURRENT_DATE), p_fim_em)
    RETURNING id INTO v_id;
  ELSE
    SELECT codigo INTO v_codigo FROM public.ops_plano
     WHERE id = v_id AND organization_id = v_org;
    IF v_codigo IS NULL THEN
      RAISE EXCEPTION 'Plano não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;

    UPDATE public.ops_plano SET
      nome              = v_nome,
      cliente_id        = p_cliente_id,
      estado            = p_estado,
      tipo_recorrencia  = p_tipo_recorrencia,
      regra_recorrencia = CASE WHEN p_tipo_recorrencia = 'calendario' THEN p_regra END,
      intervalo_horas   = CASE WHEN p_tipo_recorrencia = 'dinamica' THEN p_intervalo_horas END,
      hora_prevista     = COALESCE(p_hora_prevista, '09:00'),
      duracao_estimada  = COALESCE(p_duracao, 0),
      responsavel_id    = p_responsavel_id,
      inicio_em         = COALESCE(p_inicio_em, inicio_em),
      fim_em            = p_fim_em,
      materializado_ate = NULL,
      atualizado_em     = now()
    WHERE id = v_id;
  END IF;

  IF p_alvos IS NOT NULL THEN
    DELETE FROM public.ops_plano_alvo WHERE plano_id = v_id;

    FOR v_alvo IN SELECT * FROM jsonb_array_elements(p_alvos) LOOP
      IF (v_alvo->>'local_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ops_local
         WHERE id = (v_alvo->>'local_id')::uuid AND organization_id = v_org) THEN
        RAISE EXCEPTION 'Um dos locais não é desta organização.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF (v_alvo->>'ativo_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ops_ativo
         WHERE id = (v_alvo->>'ativo_id')::uuid AND organization_id = v_org) THEN
        RAISE EXCEPTION 'Um dos ativos não é desta organização.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF (v_alvo->>'checklist_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ops_checklist
         WHERE id = (v_alvo->>'checklist_id')::uuid AND organization_id = v_org
           AND estado = 'publicada') THEN
        RAISE EXCEPTION 'Uma das checklists não existe aqui, ou não está publicada.';
      END IF;

      INSERT INTO public.ops_plano_alvo (plano_id, ativo_id, local_id, checklist_id)
      VALUES (
        v_id,
        (v_alvo->>'ativo_id')::uuid,
        (v_alvo->>'local_id')::uuid,
        (v_alvo->>'checklist_id')::uuid);
      v_n := v_n + 1;
    END LOOP;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_org, 'plano', v_id, CASE WHEN v_criado THEN 'criado' ELSE 'editado' END,
     v_nome, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'tipo', p_tipo_recorrencia,
                        'regra', p_regra, 'alvos', v_n));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'codigo', v_codigo, 'criado', v_criado, 'alvos', v_n);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_gravar_plano_impl(uuid, text, uuid, text, text, integer, time without time zone, date, date, uuid, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_gravar_plano_impl(uuid, text, uuid, text, text, integer, time without time zone, date, date, uuid, text, integer, jsonb) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_guarda_estado()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_guarda_estado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND coalesce(current_setting('ops.transicao', true), '') <> 'autorizada' THEN
    RAISE EXCEPTION
      'O estado de uma ordem só muda através de rpc_ops_transitar_ordem(). Tentativa: % → %.',
      OLD.estado, NEW.estado
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_guarda_estado() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_estado() TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_estado() TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_estado() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_estado() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_guarda_medicao()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_guarda_medicao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(current_setting('ops.medicao', true), '') = 'autorizada' THEN
    RETURN NEW;
  END IF;

  -- Uma leitura por fazer não é um veredicto — é uma linha em branco à espera.
  -- Semeá-la é o que a materialização faz quando a ordem nasce, e não há nada
  -- a proteger nisso. O que se protege é o veredicto.
  IF TG_OP = 'INSERT' AND NEW.lida_em IS NULL AND NEW.conforme IS NULL
     AND NEW.valor_num IS NULL AND NEW.valor_texto IS NULL AND NEW.opcao_id IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Uma leitura de medição só se escreve através de rpc_ops_responder_medicao().'
    USING ERRCODE = 'insufficient_privilege';
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_guarda_medicao() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_medicao() TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_medicao() TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_medicao() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_medicao() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_guarda_tarefa()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_guarda_tarefa()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND coalesce(current_setting('ops.tarefa', true), '') <> 'autorizada' THEN
    RAISE EXCEPTION
      'O estado de uma tarefa só muda através de rpc_ops_responder_tarefa(). Tentativa: % → %.',
      OLD.estado, NEW.estado
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_guarda_tarefa() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_tarefa() TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_tarefa() TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_tarefa() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_guarda_tarefa() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_herdar_centro_custo()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_herdar_centro_custo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cc uuid;
BEGIN
  -- `NEW` é o alvo, não a ordem: o centro de custo tem de vir da ordem.
  -- Se ela já tem um, ninguém lhe toca.
  IF EXISTS (SELECT 1 FROM public.ops_ordem
              WHERE id = NEW.ordem_id AND centro_custo_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT a.centro_custo_id INTO v_cc
    FROM public.ops_ordem_alvo oa
    JOIN public.ops_ativo a ON a.id = oa.ativo_id
   WHERE oa.ordem_id = NEW.ordem_id
     AND a.centro_custo_id IS NOT NULL
   LIMIT 1;

  IF v_cc IS NOT NULL THEN
    UPDATE public.ops_ordem SET centro_custo_id = v_cc
     WHERE id = NEW.ordem_id AND centro_custo_id IS NULL;
  END IF;

  RETURN NEW;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_herdar_centro_custo() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_herdar_centro_custo() TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_herdar_centro_custo() TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_herdar_centro_custo() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_herdar_centro_custo() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_historico_do_ativo()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_historico_do_ativo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid;
  v_mudou jsonb := '{}'::jsonb;
  v_antes jsonb := '{}'::jsonb;
BEGIN
  -- Pode não haver sessão: uma importação corre sem ninguém, e o histórico
  -- fica com autor nulo em vez de não existir.
  BEGIN
    v_user := public.current_business_user_id();
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ops_evento
      (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
    VALUES
      (NEW.organization_id, 'ativo', NEW.id, 'criado',
       NEW.codigo || ' — ' || NEW.nome, v_user,
       jsonb_build_object('codigo', NEW.codigo, 'nome', NEW.nome,
                          'local_id', NEW.local_id));
    RETURN NULL;
  END IF;

  -- Só o que interessa a quem lê o histórico daqui a um ano. `atualizado_em`
  -- muda sempre e não conta nada.
  IF NEW.nome            IS DISTINCT FROM OLD.nome            THEN
    v_antes := v_antes || jsonb_build_object('nome', OLD.nome);
    v_mudou := v_mudou || jsonb_build_object('nome', NEW.nome);
  END IF;
  IF NEW.categoria_id    IS DISTINCT FROM OLD.categoria_id    THEN
    v_antes := v_antes || jsonb_build_object('categoria_id', OLD.categoria_id);
    v_mudou := v_mudou || jsonb_build_object('categoria_id', NEW.categoria_id);
  END IF;
  IF NEW.num_serie       IS DISTINCT FROM OLD.num_serie       THEN
    v_antes := v_antes || jsonb_build_object('num_serie', OLD.num_serie);
    v_mudou := v_mudou || jsonb_build_object('num_serie', NEW.num_serie);
  END IF;
  IF NEW.criticidade     IS DISTINCT FROM OLD.criticidade     THEN
    v_antes := v_antes || jsonb_build_object('criticidade', OLD.criticidade);
    v_mudou := v_mudou || jsonb_build_object('criticidade', NEW.criticidade);
  END IF;
  IF NEW.local_id        IS DISTINCT FROM OLD.local_id        THEN
    v_antes := v_antes || jsonb_build_object('local_id', OLD.local_id);
    v_mudou := v_mudou || jsonb_build_object('local_id', NEW.local_id);
  END IF;
  IF NEW.ativo           IS DISTINCT FROM OLD.ativo           THEN
    v_antes := v_antes || jsonb_build_object('ativo', OLD.ativo);
    v_mudou := v_mudou || jsonb_build_object('ativo', NEW.ativo);
  END IF;
  IF NEW.centro_custo_id IS DISTINCT FROM OLD.centro_custo_id THEN
    v_antes := v_antes || jsonb_build_object('centro_custo_id', OLD.centro_custo_id);
    v_mudou := v_mudou || jsonb_build_object('centro_custo_id', NEW.centro_custo_id);
  END IF;

  IF v_mudou = '{}'::jsonb THEN RETURN NULL; END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (NEW.organization_id, 'ativo', NEW.id,
     CASE
       WHEN NEW.ativo IS DISTINCT FROM OLD.ativo
        THEN CASE WHEN NEW.ativo THEN 'reativado' ELSE 'desativado' END
       WHEN NEW.local_id IS DISTINCT FROM OLD.local_id THEN 'mudou_de_sitio'
       ELSE 'alterado'
     END,
     NEW.codigo || ' — ' || NEW.nome, v_user, v_antes, v_mudou);

  RETURN NULL;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_historico_do_ativo() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_historico_do_ativo() TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_historico_do_ativo() TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_historico_do_ativo() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_historico_do_ativo() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_linha_info(text, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_linha_info(_rotulo text, _valor text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '<tr><td style="padding:2px 16px 2px 0;color:#64748b;vertical-align:top">'
      || public.ops_escapar_html(_rotulo)
      || '</td><td style="padding:2px 0">'
      || public.ops_escapar_html(COALESCE(nullif(btrim(_valor), ''), '—'))
      || '</td></tr>';
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_linha_info(text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_linha_info(text, text) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_linha_info(text, text) TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_linha_info(text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_linha_info(text, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_mao_obra_viva(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_mao_obra_viva(_ordem_id uuid)
 RETURNS TABLE(segundos bigint, total numeric, sessoes_abertas integer, sem_custo_hora integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org   uuid;
  v_uid   uuid := auth.uid();
  v_seg   bigint := 0;
  v_total numeric := 0;
  v_ab    integer := 0;
  v_sem   integer := 0;
  r       record;
BEGIN
  SELECT organization_id INTO v_org FROM public.ops_ordem WHERE id = _ordem_id;
  IF v_org IS NULL THEN RETURN; END IF;
  IF v_uid IS NOT NULL AND NOT public.ops_pode_ver_ordem(v_uid, _ordem_id) THEN RETURN; END IF;

  FOR r IN
    SELECT s.utilizador_id,
           sum(GREATEST(EXTRACT(EPOCH FROM (COALESCE(s.fim, now()) - s.inicio)), 0))::bigint AS seg,
           count(*) FILTER (WHERE s.fim IS NULL)::integer AS abertas,
           max(p.custo_hora) AS custo_hora
      FROM public.ops_sessao_trabalho s
      LEFT JOIN public.ops_utilizador_perfil p
             ON p.utilizador_id = s.utilizador_id AND p.organization_id = v_org
     WHERE s.ordem_id = _ordem_id
     GROUP BY s.utilizador_id
  LOOP
    v_seg := v_seg + r.seg;
    v_ab  := v_ab + r.abertas;
    IF r.custo_hora IS NULL THEN
      IF r.seg > 0 THEN v_sem := v_sem + 1; END IF;
    ELSE
      v_total := v_total + (r.seg / 3600.0) * r.custo_hora;
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    v_seg,
    CASE WHEN v_uid IS NULL OR public.ops_pode(v_org, 'operations.costs.view')
         THEN round(v_total, 2)::numeric(12,2) END,
    v_ab,
    v_sem;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_mao_obra_viva(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_mao_obra_viva(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_mao_obra_viva(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_nivel_funcao(text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_nivel_funcao(_funcao text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE _funcao
    WHEN 'admin'      THEN 0
    WHEN 'gestor'     THEN 1
    WHEN 'supervisor' THEN 2
    WHEN 'operador'   THEN 3
    WHEN 'tecnico'    THEN 4
    ELSE 99
  END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_nivel_funcao(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_nivel_funcao(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_nivel_funcao(text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_notificar(uuid, uuid, text, text, text, text, uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_notificar(_org_id uuid, _utilizador_id uuid, _tipo text, _titulo text, _mensagem text, _link text DEFAULT NULL::text, _ordem_id uuid DEFAULT NULL::uuid, _prioridade text DEFAULT 'medium'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN RETURN false; END IF;
  IF _utilizador_id IS NULL THEN RETURN false; END IF;

  SELECT auth_user_id INTO v_auth
    FROM public.anew_users
   WHERE id = _utilizador_id AND deleted_at IS NULL;

  -- Sem login não há sino. Não é erro — é uma pessoa que existe em Operações
  -- mas não entra na aplicação.
  IF v_auth IS NULL THEN RETURN false; END IF;

  -- O mesmo aviso, sobre a mesma ordem, para a mesma pessoa, ainda por ler.
  -- Sem isto, uma ordem atrasada há três dias enche o sino três vezes.
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = v_auth AND type = _tipo
       AND entity_id IS NOT DISTINCT FROM _ordem_id
       AND is_read = false AND is_dismissed = false AND is_resolved = false
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.notifications
    (user_id, organization_id, kind, type, title, message, link,
     entity_type, entity_id, priority, data)
  VALUES
    (v_auth, _org_id, 'notification', _tipo, _titulo, _mensagem, _link,
     CASE WHEN _ordem_id IS NULL THEN NULL ELSE 'ops_ordem' END,
     _ordem_id, _prioridade,
     jsonb_build_object('modulo', 'operacoes'));

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  -- Ver a nota no topo: o aviso é acessório, o trabalho não é.
  RAISE NOTICE 'Aviso não enviado (%): %', _tipo, SQLERRM;
  RETURN false;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_notificar(uuid, uuid, text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_notificar(uuid, uuid, text, text, text, text, uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_notificar_coordenacao(uuid, text, text, text, text, uuid, text, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_notificar_coordenacao(_org_id uuid, _tipo text, _titulo text, _mensagem text, _link text DEFAULT NULL::text, _ordem_id uuid DEFAULT NULL::uuid, _prioridade text DEFAULT 'medium'::text, _exceto uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p record;
  v_n integer := 0;
BEGIN
  FOR v_p IN
    SELECT utilizador_id
      FROM public.ops_utilizador_perfil
     WHERE organization_id = _org_id
       AND ativo
       AND funcao IN ('admin', 'gestor')
       AND utilizador_id IS DISTINCT FROM _exceto
  LOOP
    IF public.ops_notificar(_org_id, v_p.utilizador_id, _tipo, _titulo,
                            _mensagem, _link, _ordem_id, _prioridade) THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_notificar_coordenacao(uuid, text, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_notificar_coordenacao(uuid, text, text, text, text, uuid, text, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_num(text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_num(_t text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN replace(btrim(_t), ',', '.') ~ '^-?\d{1,12}(\.\d{1,6})?$'
              THEN replace(btrim(_t), ',', '.')::numeric END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_num(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_num(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_num(text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_numero_legivel(numeric)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_numero_legivel(_n numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN _n IS NULL THEN NULL
              ELSE replace(trim_scale(_n)::text, '.', ',') END;
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_numero_legivel(numeric) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_numero_legivel(numeric) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_numero_legivel(numeric) TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_numero_legivel(numeric) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_numero_legivel(numeric) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_alertas_lista(uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_alertas_lista(_org uuid, _obra uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tipo text, gravidade smallint, tarefa_id uuid, obra_id uuid, obra_codigo text, obra_titulo text, tarefa_nome text, pessoas uuid[], desde timestamp with time zone, minutos_atraso integer, detalhe text, atraso_id uuid, supervisor_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH agora AS (
    SELECT (now() AT TIME ZONE 'Europe/Lisbon') AS ts,
           (now() AT TIME ZONE 'Europe/Lisbon')::date AS hoje
  ),
  ta AS (
    SELECT t.id, t.obra_id, t.nome, t.estado, t.inicio_planeado, t.fim_planeado,
           t.material_chega_em AS material, t.material_chega_nota AS material_nota,
           o.codigo, o.titulo, o.supervisor_id AS sup, COALESCE(o.hora_inicio_dia, time '08:00') AS hora,
           COALESCE((SELECT array_agg(tp.utilizador_id ORDER BY tp.atribuida_em, tp.utilizador_id)
                       FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = t.id), '{}'::uuid[]) AS pessoas
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra o ON o.id = t.obra_id
     WHERE t.organization_id = _org
       AND (_obra IS NULL OR t.obra_id = _obra)
       AND o.estado IN ('planeada','em_curso')
       AND t.estado IN ('por_fazer','em_curso','rejeitada')
  )
  SELECT 'fim_ultrapassado'::text, 1::smallint, ta.id, ta.obra_id, ta.codigo, ta.titulo, ta.nome, ta.pessoas,
         ((ta.fim_planeado + 1)::timestamp AT TIME ZONE 'Europe/Lisbon'),
         GREATEST(0, floor(extract(epoch FROM (ag.ts - (ta.fim_planeado + 1)::timestamp)) / 60))::integer,
         'Devia ter acabado a ' || to_char(ta.fim_planeado, 'DD/MM') ||
           CASE ta.estado WHEN 'por_fazer' THEN ' e ainda nem começou'
                          WHEN 'rejeitada' THEN ' e voltou para refazer'
                          ELSE ' e ainda está em curso' END,
         NULL::uuid, ta.sup
    FROM ta CROSS JOIN agora ag
   WHERE ta.fim_planeado IS NOT NULL AND ta.fim_planeado < ag.hoje
  UNION ALL
  SELECT 'nao_iniciada'::text, 2::smallint, ta.id, ta.obra_id, ta.codigo, ta.titulo, ta.nome, ta.pessoas,
         ((ta.inicio_planeado + ta.hora) AT TIME ZONE 'Europe/Lisbon'),
         GREATEST(0, floor(extract(epoch FROM (ag.ts - (ta.inicio_planeado + ta.hora))) / 60))::integer,
         'Devia ter começado a ' || to_char(ta.inicio_planeado, 'DD/MM') || ' às ' || to_char(ta.hora, 'HH24:MI')
           || CASE WHEN cardinality(ta.pessoas) = 0 THEN ' · ninguém atribuído' ELSE '' END
           || COALESCE(' · à espera de "' || dep.nome || '"', ''),
         NULL::uuid, ta.sup
    FROM ta CROSS JOIN agora ag
    LEFT JOIN LATERAL (
      SELECT d.nome FROM public.ops_obra_tarefa_dependencia x
        JOIN public.ops_obra_tarefa d ON d.id = x.depende_de_id
       WHERE x.tarefa_id = ta.id AND d.estado NOT IN ('feita','validada')
       ORDER BY d.inicio_planeado NULLS LAST, d.nome LIMIT 1
    ) dep ON true
   WHERE public.ops_obra_atrasada_inicio(ta.estado, ta.inicio_planeado, ta.hora)
     AND NOT (ta.fim_planeado IS NOT NULL AND ta.fim_planeado < ag.hoje)
  UNION ALL
  SELECT 'material_tarde'::text, 2::smallint, ta.id, ta.obra_id, ta.codigo, ta.titulo, ta.nome, ta.pessoas,
         ((ta.inicio_planeado + ta.hora) AT TIME ZONE 'Europe/Lisbon'),
         (public.ops_obra_dias_uteis_entre_org(_org, ta.inicio_planeado, ta.material) * 480)::integer,
         'O material chega a ' || to_char(ta.material, 'DD/MM') || ', depois do início planeado ('
           || to_char(ta.inicio_planeado, 'DD/MM') || ')' || COALESCE(' · ' || ta.material_nota, ''),
         NULL::uuid, ta.sup
    FROM ta
   WHERE ta.estado = 'por_fazer' AND ta.material IS NOT NULL AND ta.inicio_planeado IS NOT NULL
     AND ta.material > ta.inicio_planeado
  UNION ALL
  SELECT 'cliente_por_avisar'::text, 3::smallint, a.tarefa_id, a.obra_id, o.codigo, o.titulo, t.nome,
         COALESCE((SELECT array_agg(tp.utilizador_id ORDER BY tp.atribuida_em, tp.utilizador_id)
                     FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = a.tarefa_id), '{}'::uuid[]),
         a.registado_em,
         COALESCE(a.minutos_extra,
                  public.ops_obra_dias_uteis_entre_org(a.organization_id, a.fim_anterior, a.novo_fim) * o.minutos_por_dia)::integer,
         public.ops_obra_rotulo_atraso(a.motivo) || ': ' || a.contexto
           || COALESCE(' · novo fim ' || to_char(a.novo_fim, 'DD/MM'), ''),
         a.id, o.supervisor_id
    FROM public.ops_obra_tarefa_atraso a
    JOIN public.ops_obra o ON o.id = a.obra_id
    JOIN public.ops_obra_tarefa t ON t.id = a.tarefa_id
   WHERE a.organization_id = _org
     AND (_obra IS NULL OR a.obra_id = _obra)
     AND NOT a.cliente_avisado
     AND o.estado <> 'cancelada'
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_alertas_lista(uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_alertas_lista(uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_alertas_lista(uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_atrasada_inicio(text, date, time without time zone, timestamp with time zone)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_atrasada_inicio(_estado text, _inicio date, _hora time without time zone, _agora timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    _estado = 'por_fazer' AND _inicio IS NOT NULL
    AND (_agora AT TIME ZONE 'Europe/Lisbon')
        >= (_inicio + COALESCE(_hora, time '08:00')) + interval '60 minutes',
    false)
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_atrasada_inicio(text, date, time without time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_atrasada_inicio(text, date, time without time zone, timestamp with time zone) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_atrasada_inicio(text, date, time without time zone, timestamp with time zone) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_avisar_atribuicao(uuid, uuid[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_avisar_atribuicao(_obra uuid, _pessoas uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o   record;
  v_p   uuid;
  v_eu  uuid;
  v_t   record;
  v_n   integer := 0;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN RETURN 0; END IF;
  SELECT id, organization_id, codigo, titulo, morada, estado INTO v_o FROM public.ops_obra WHERE id = _obra;
  IF NOT FOUND OR v_o.estado NOT IN ('planeada','em_curso') THEN RETURN 0; END IF;
  BEGIN
    SELECT id INTO v_eu FROM public.anew_users WHERE auth_user_id = auth.uid() LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_eu := NULL;
  END;

  FOREACH v_p IN ARRAY COALESCE(_pessoas, '{}') LOOP
    CONTINUE WHEN v_p IS NOT DISTINCT FROM v_eu;
    SELECT count(*)::int AS n,
           array_agg(t.id::text ORDER BY t.id) AS chaves,
           min(t.inicio_planeado) AS primeira,
           (array_agg(t.nome ORDER BY t.inicio_planeado NULLS LAST, t.ordem))[1:3] AS nomes
      INTO v_t
      FROM public.ops_obra_tarefa_pessoa tp
      JOIN public.ops_obra_tarefa t ON t.id = tp.tarefa_id
     WHERE tp.obra_id = _obra AND tp.utilizador_id = v_p AND t.estado IN ('por_fazer','rejeitada');
    CONTINUE WHEN COALESCE(v_t.n, 0) = 0;
    IF public.ops_obra_notificar(
         v_o.organization_id, v_p, 'operacoes_obra_tarefas', _obra,
         v_o.codigo || ': tens ' || v_t.n || CASE WHEN v_t.n = 1 THEN ' tarefa' ELSE ' tarefas' END,
         COALESCE(v_o.titulo, 'Obra')
           || COALESCE(' · ' || NULLIF(btrim(v_o.morada), ''), '')
           || COALESCE(' · a primeira a ' || to_char(v_t.primeira, 'DD/MM'), '')
           || '. ' || array_to_string(v_t.nomes, ', ')
           || CASE WHEN v_t.n > 3 THEN '…' ELSE '' END,
         '/operacao/minhas-tarefas', 'medium', v_t.chaves,
         jsonb_build_object('codigo', v_o.codigo)) IN ('novo','de_novo') THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Aviso de atribuição não enviado: %', SQLERRM;
  RETURN v_n;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_avisar_atribuicao(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_avisar_atribuicao(uuid, uuid[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_avisar_bancada(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_avisar_bancada(_obra uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o       record;
  v_skills  uuid[];
  v_t       record;
  v_chave   text;
  v_ficha   jsonb;
  v_local   text;
  v_para    uuid[];
  v_sem     boolean;
  v_med     text;
  v_msg     text;
  v_tit     text;
  v_p       uuid;
  v_ant     record;
BEGIN
  SELECT id, organization_id, codigo, titulo, morada, estado, supervisor_id INTO v_o
    FROM public.ops_obra WHERE id = _obra;
  IF NOT FOUND OR v_o.estado NOT IN ('planeada','em_curso') THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_skills
    FROM public.ops_skill WHERE organization_id = v_o.organization_id AND nome ILIKE 'marmor%';

  -- As tarefas de bancada que ainda vêm aí (medição, colocação…).
  SELECT count(*)::int AS n,
         min(t.inicio_planeado) AS primeira,
         max(COALESCE(t.fim_planeado, t.inicio_planeado)) AS ultima,
         string_agg(t.nome || ' a ' || to_char(t.inicio_planeado, 'DD/MM'), ', '
                    ORDER BY t.inicio_planeado, t.ordem) AS datas,
         string_agg(DISTINCT CASE WHEN t.medida IS NOT NULL AND t.medida_qt IS NOT NULL
                      THEN replace(t.medida, '_', ' ') || ' ' || trim(to_char(t.medida_qt, 'FM999990D0')) END, ', ') AS medidas,
         string_agg(t.id::text || '@' || t.inicio_planeado::text, ',' ORDER BY t.id) AS chave
    INTO v_t
    FROM public.ops_obra_tarefa t
   WHERE t.obra_id = _obra AND t.estado = 'por_fazer' AND t.inicio_planeado IS NOT NULL
     AND (t.skill_id = ANY (v_skills) OR t.nome ILIKE '%bancada%');

  IF COALESCE(v_t.n, 0) = 0 THEN
    -- Já não há bancada por fazer: o aviso deixa de fazer falta.
    PERFORM public.ops_obra_notificacoes_resolver(v_o.organization_id, 'operacoes_obra_bancada', '{}', _obra, 'sem_bancada');
    RETURN jsonb_build_object('bancada', false);
  END IF;

  v_chave := v_t.chave;
  SELECT COALESCE(array_agg(DISTINCT us.utilizador_id), '{}') INTO v_para
    FROM public.ops_utilizador_skill us
    JOIN public.ops_utilizador_perfil p ON p.utilizador_id = us.utilizador_id
                                       AND p.organization_id = v_o.organization_id AND p.ativo
   WHERE us.skill_id = ANY (v_skills);
  v_sem := cardinality(v_para) = 0;
  IF v_sem THEN
    v_para := public.ops_obra_coordenacao(_obra);
  ELSIF v_o.supervisor_id IS NOT NULL THEN
    v_para := v_para || v_o.supervisor_id;
  END IF;

  -- Já avisado com as mesmas datas e às mesmas pessoas → nada. Se há alguém
  -- novo (passou a ter a especialidade, mudou o supervisor…), avisa-se; quem
  -- já tinha o aviso aberto não o recebe duas vezes (ops_obra_notificar).
  SELECT * INTO v_ant FROM public.ops_obra_aviso WHERE obra_id = _obra AND tipo = 'bancada';
  IF FOUND AND v_ant.chave = v_chave AND v_para <@ COALESCE(v_ant.destinatarios, '{}') THEN
    RETURN jsonb_build_object('bancada', true, 'novo', false, 'enviado_em', v_ant.enviado_em);
  END IF;

  v_ficha := public.ops_obra_ficha_local_dados(_obra);
  v_local := public.ops_obra_local_resumo(v_ficha);
  v_med := v_t.medidas;

  v_tit := v_o.codigo || ': bancada ' || CASE WHEN v_t.primeira IS NOT NULL
             THEN 'a ' || to_char(v_t.primeira, 'DD/MM') ELSE 'por marcar' END;
  v_msg := COALESCE(v_o.titulo, 'Obra')
           || COALESCE(' · ' || NULLIF(btrim(v_o.morada), ''), '')
           || '. ' || v_t.datas || '.'
           || COALESCE(' Medidas: ' || v_med || '.', '')
           || COALESCE(' Local: ' || v_local || '.', '')
           || ' Preparar cortes e encomendar a pedra com antecedência.';

  IF v_sem THEN
    v_tit := v_tit || ' — ninguém com a especialidade Marmorista';
  END IF;

  FOREACH v_p IN ARRAY v_para LOOP
    PERFORM public.ops_obra_notificar(v_o.organization_id, v_p, 'operacoes_obra_bancada', _obra,
      v_tit, v_msg, '/operacao/obras/' || v_o.codigo, 'high', ARRAY[v_chave],
      jsonb_build_object('codigo', v_o.codigo, 'primeira', v_t.primeira, 'sem_especialidade', v_sem));
  END LOOP;

  INSERT INTO public.ops_obra_aviso (obra_id, tipo, organization_id, chave, enviado_em, destinatarios,
                                    sem_especialidade, detalhe)
  VALUES (_obra, 'bancada', v_o.organization_id, v_chave, now(), v_para, v_sem,
          jsonb_build_object('primeira', v_t.primeira, 'datas', v_t.datas, 'medidas', v_med, 'local', v_local))
  ON CONFLICT (obra_id, tipo) DO UPDATE
     SET chave = EXCLUDED.chave, enviado_em = EXCLUDED.enviado_em, destinatarios = EXCLUDED.destinatarios,
         sem_especialidade = EXCLUDED.sem_especialidade, detalhe = EXCLUDED.detalhe;

  RETURN jsonb_build_object('bancada', true, 'novo', true, 'para', cardinality(v_para), 'sem_especialidade', v_sem);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Aviso da bancada não enviado: %', SQLERRM;
  RETURN jsonb_build_object('erro', SQLERRM);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_avisar_bancada(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_avisar_bancada(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_biblioteca()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_biblioteca()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT $j$[
  {"familia":"Demolições","re":"demol|remoç|remoc|picar|retirad|desmont|arranc","skill":"Demolições","mu":30,"t":[
    {"n":"Proteger zona e acessos","fase":1,"x":45,"p":0,"k":1},
    {"n":"Demolir e remover","fase":1,"p":0.8,"k":2,"d":1},
    {"n":"Retirar entulho","fase":1,"p":0.2,"k":1,"d":2}]},
  {"familia":"AVAC","re":"climatiz|ar condicionado|avac|ventila|bomba de calor|split","skill":"AVAC","mu":240,"t":[
    {"n":"Furação e suportes","fase":2,"p":0.3,"k":1},
    {"n":"Instalar unidades e tubagem","fase":2,"p":0.5,"k":2,"d":1},
    {"n":"Vácuo, carga e teste","fase":2,"x":30,"p":0.2,"k":1,"d":2}]},
  {"familia":"Canalização","re":"canaliz|água|agua|esgot|sanit|duche|banheira|autoclism|torneira|lavatór|lavator|termoacumul|esquentador","skill":"Canalização","mu":120,"t":[
    {"n":"Marcar traçado","fase":2,"x":30,"p":0,"k":1},
    {"n":"Abrir roços","fase":2,"p":0.25,"k":1,"d":1},
    {"n":"Instalar tubagem e equipamento","fase":2,"p":0.5,"k":null,"d":2},
    {"n":"Ensaio de estanquidade","fase":2,"x":30,"p":0,"k":1,"d":3},
    {"n":"Fechar roços","fase":2,"p":0.25,"k":1,"d":4}]},
  {"familia":"Eletricidade","re":"eletric|elétric|electric|quadro|tomada|interruptor|iluminaç|ilumina|luminár|cabo|ited","skill":"Eletricidade","mu":90,"t":[
    {"n":"Marcar traçado","fase":2,"x":30,"p":0,"k":1},
    {"n":"Abrir roços e caixas","fase":2,"p":0.3,"k":1,"d":1},
    {"n":"Passar cabos e ligar","fase":2,"p":0.5,"k":null,"d":2},
    {"n":"Fechar roços","fase":2,"p":0.2,"k":1,"d":3},
    {"n":"Ensaio e verificação","fase":2,"x":30,"p":0,"k":1,"d":4}]},
  {"familia":"Pladur e tetos","re":"pladur|gesso cartonado|teto falso|tecto falso|divisór|divisor","skill":"Pladur","mu":40,"t":[
    {"n":"Montar estrutura","fase":3,"p":0.4,"k":null},
    {"n":"Aplicar placas","fase":3,"p":0.35,"k":null,"d":1},
    {"n":"Tratar juntas","fase":3,"p":0.25,"k":1,"d":2}]},
  {"familia":"Revestimentos","re":"azulej|cerâm|ceram|revestim|mosaic|pavimento|ladrilh|porcelan|soalho|flutuante|vinil","skill":"Revestimentos","mu":45,"t":[
    {"n":"Regularizar base","fase":3,"p":0.25,"k":1},
    {"n":"Assentar","fase":3,"p":0.55,"k":null,"d":1},
    {"n":"Betumar juntas e rematar","fase":3,"p":0.15,"k":1,"d":2},
    {"n":"Limpar","fase":3,"p":0.05,"k":1,"d":3}]},
  {"familia":"Pintura","re":"pintur|tinta|esmalt|verniz|estuque|reboco","skill":"Pintura","mu":15,"t":[
    {"n":"Proteger e mascarar","fase":3,"x":30,"p":0,"k":1},
    {"n":"Preparar superfície","fase":3,"p":0.35,"k":1,"d":1},
    {"n":"Aplicar primário","fase":3,"p":0.2,"k":1,"d":2},
    {"n":"1.ª demão","fase":3,"p":0.225,"k":1,"d":3},
    {"n":"2.ª demão","fase":3,"p":0.225,"k":1,"d":4}]},
  {"familia":"Carpintaria","re":"carpint|porta|roupeiro|armário|armario|móvel|movel|cozinha|bancada|rodapé|rodape","skill":"Carpintaria","mu":120,"t":[
    {"n":"Medir e preparar","fase":3,"x":30,"p":0.1,"k":1},
    {"n":"Montar","fase":3,"p":0.75,"k":null,"d":1},
    {"n":"Afinar e rematar","fase":3,"p":0.15,"k":1,"d":2}]},
  {"familia":"Limpeza","re":"limpez","skill":null,"mu":60,"t":[
    {"n":"Limpeza","fase":4,"p":1,"k":null}]}
]$j$::jsonb $function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_biblioteca() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_biblioteca() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_biblioteca() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_conflitos_impl(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_conflitos_impl(_tarefa_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'utilizador_id', tp.utilizador_id,
           'nome', COALESCE(u.name, 'Sem nome'),
           'tarefa_id', o2.id,
           'tarefa', o2.nome,
           'obra_codigo', ob.codigo,
           'inicio', o2.inicio_planeado,
           'fim', o2.fim_planeado) ORDER BY o2.inicio_planeado), '[]'::jsonb)
    FROM public.ops_obra_tarefa t
    JOIN public.ops_obra_tarefa_pessoa tp ON tp.tarefa_id = t.id
    JOIN public.ops_obra_tarefa_pessoa tp2
      ON tp2.utilizador_id = tp.utilizador_id AND tp2.tarefa_id <> t.id
    JOIN public.ops_obra_tarefa o2 ON o2.id = tp2.tarefa_id
    JOIN public.ops_obra ob ON ob.id = o2.obra_id
    LEFT JOIN public.anew_users u ON u.id = tp.utilizador_id
   WHERE t.id = _tarefa_id
     AND o2.organization_id = t.organization_id
     AND o2.obra_id <> t.obra_id
     AND o2.estado IN ('por_fazer','em_curso','rejeitada')
     AND ob.estado IN ('planeada','em_curso')
     AND t.inicio_planeado IS NOT NULL AND o2.inicio_planeado IS NOT NULL
     AND daterange(t.inicio_planeado, COALESCE(t.fim_planeado, t.inicio_planeado), '[]')
      && daterange(o2.inicio_planeado, COALESCE(o2.fim_planeado, o2.inicio_planeado), '[]')
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_conflitos_impl(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_conflitos_impl(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_coordenacao(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_coordenacao(_obra uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT u), '{}')
    FROM (
      SELECT o.supervisor_id AS u FROM public.ops_obra o WHERE o.id = _obra AND o.supervisor_id IS NOT NULL
      UNION
      SELECT p.utilizador_id FROM public.ops_obra o
        JOIN public.ops_utilizador_perfil p ON p.organization_id = o.organization_id
       WHERE o.id = _obra AND p.ativo AND p.funcao IN ('admin','gestor')
    ) x
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_coordenacao(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_coordenacao(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_criar_impl(uuid, uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_criar_impl(_org uuid, _autor uuid, _titulo text, _cliente_id uuid, _modelo_id uuid, _inicio date, _orcamento_id uuid, _contrato_id uuid, _morada text, _gestor_id uuid, _supervisor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id     uuid;
  v_codigo text;
  v_inicio date := public.ops_obra_somar_dias_uteis(COALESCE(_inicio, current_date), 0);
  v_n      integer := 0;
  v_sup    uuid := _supervisor_id;
  v_ini    date;
  v_fim    date;
  f        record;
BEGIN
  v_codigo := public.ops_proximo_codigo_interno(_org, 'OB');

  INSERT INTO public.ops_obra (
    organization_id, codigo, cliente_id, orcamento_id, contrato_id, modelo_id,
    titulo, morada, data_inicio_prevista, gestor_id, supervisor_id, criada_por)
  VALUES (
    _org, v_codigo, _cliente_id, _orcamento_id, _contrato_id, _modelo_id,
    _titulo, nullif(btrim(coalesce(_morada,'')), ''), v_inicio,
    COALESCE(_gestor_id, _autor), NULL, _autor)
  RETURNING id INTO v_id;

  -- 1. O tipo de obra (modelo): as fases e as tarefas que existem sempre.
  IF _modelo_id IS NOT NULL THEN
    FOR f IN
      SELECT mf.id, mf.ordem, mf.nome FROM public.ops_obra_modelo_fase mf
       WHERE mf.modelo_id = _modelo_id ORDER BY mf.ordem
    LOOP
      WITH nova AS (
        INSERT INTO public.ops_obra_fase (organization_id, obra_id, ordem, nome)
        VALUES (_org, v_id, f.ordem, f.nome) RETURNING id
      )
      INSERT INTO public.ops_obra_tarefa (
        organization_id, obra_id, fase_id, modelo_tarefa_id, ordem, nome,
        procedimento, materiais, ferramentas, minutos_previstos)
      SELECT _org, v_id, nova.id, mt.id, mt.ordem, mt.nome,
             mt.procedimento, mt.materiais, mt.ferramentas, mt.minutos_previstos
        FROM nova, public.ops_obra_modelo_tarefa mt
       WHERE mt.modelo_fase_id = f.id;
    END LOOP;
  END IF;

  -- As quatro fases por defeito, se o tipo não as trouxe. 3 e 4 a confirmar.
  INSERT INTO public.ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT _org, v_id, x.o, x.n
    FROM (VALUES (1, 'Preparação e demolições'), (2, 'Instalações técnicas'),
                 (3, 'Acabamentos'), (4, 'Limpeza e entrega')) x(o, n)
   WHERE NOT EXISTS (SELECT 1 FROM public.ops_obra_fase WHERE obra_id = v_id AND ordem = x.o);

  -- 2. O que foi vendido: cada serviço do orçamento/contrato, pelo seu modelo
  --    (ou pela ficha técnica). Ficam depois das tarefas do tipo, na fase.
  INSERT INTO public.ops_obra_tarefa (
    organization_id, obra_id, fase_id, ordem, nome, procedimento, materiais, ferramentas,
    minutos_previstos, pessoas_previstas, skill_id, orcamento_linha_id, servico_id, servico_tarefa_id)
  SELECT _org, v_id, fa.id, 1000 + t.ordem, t.nome, t.procedimento, t.materiais, t.ferramentas,
         t.minutos, t.pessoas, t.skill_id, t.orcamento_linha_id, t.servico_id, t.servico_tarefa_id
    FROM public.ops_obra_tarefas_do_orcamento(_orcamento_id) t
    JOIN public.ops_obra_fase fa ON fa.obra_id = v_id AND fa.ordem = t.fase;

  -- Dependências dentro de cada serviço (ex.: fechar roços depois do ensaio).
  UPDATE public.ops_obra_tarefa t
     SET depende_de = d.id
    FROM public.ops_obra_servico_tarefa st,
         public.ops_obra_tarefa d,
         public.ops_obra_servico_tarefa sd
   WHERE t.obra_id = v_id
     AND st.id = t.servico_tarefa_id AND st.depende_ordem IS NOT NULL
     AND d.obra_id = v_id AND d.orcamento_linha_id = t.orcamento_linha_id
     AND sd.id = d.servico_tarefa_id AND sd.servico_id = st.servico_id AND sd.ordem = st.depende_ordem;

  -- 3. Datas (em paralelo dentro da fase) e equipa.
  v_n := public.ops_obra_replanear_impl(v_id, v_inicio);

  SELECT min(inicio_planeado), max(fim_planeado) INTO v_ini, v_fim
    FROM public.ops_obra_tarefa WHERE obra_id = v_id;

  -- Supervisor: o escolhido; senão o supervisor (depois o gestor) com menos
  -- obras nesses dias, e depois com menos obras abertas.
  IF v_sup IS NULL THEN
    SELECT p.utilizador_id INTO v_sup
      FROM public.ops_utilizador_perfil p
     WHERE p.organization_id = _org AND p.ativo AND p.funcao IN ('supervisor','gestor')
     ORDER BY (p.funcao = 'supervisor') DESC,
              (SELECT count(*) FROM public.ops_obra o
                WHERE o.supervisor_id = p.utilizador_id AND o.id <> v_id
                  AND o.estado IN ('planeada','em_curso')
                  AND v_ini IS NOT NULL
                  AND EXISTS (SELECT 1 FROM public.ops_obra_tarefa t2
                               WHERE t2.obra_id = o.id AND t2.inicio_planeado IS NOT NULL
                                 AND daterange(t2.inicio_planeado, COALESCE(t2.fim_planeado, t2.inicio_planeado), '[]')
                                  && daterange(v_ini, COALESCE(v_fim, v_ini), '[]'))),
              (SELECT count(*) FROM public.ops_obra o
                WHERE o.supervisor_id = p.utilizador_id AND o.estado IN ('planeada','em_curso','suspensa')),
              p.utilizador_id
     LIMIT 1;
  END IF;
  UPDATE public.ops_obra SET supervisor_id = v_sup WHERE id = v_id;

  PERFORM public.ops_obra_distribuir_impl(v_id);

  PERFORM public.ops_obra_evento(_org, v_id, 'criada', _titulo, _autor,
    jsonb_build_object('codigo', v_codigo, 'orcamento_id', _orcamento_id,
                       'contrato_id', _contrato_id, 'modelo_id', _modelo_id, 'tarefas', v_n));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_codigo, 'tarefas', v_n);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_criar_impl(uuid, uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_criar_impl(uuid, uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_crm_tem(text, text[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_crm_tem(_tabela text, _colunas text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT to_regclass('public.' || _tabela) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM unnest(_colunas) c(nome)
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_attribute a
           WHERE a.attrelid = to_regclass('public.' || _tabela)
             AND a.attname = c.nome AND a.attnum > 0 AND NOT a.attisdropped))
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_crm_tem(text, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_crm_tem(text, text[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_de_orcamento_impl(uuid, uuid, uuid, timestamp with time zone, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_de_orcamento_impl(p_orcamento_id uuid, p_local_id uuid DEFAULT NULL::uuid, p_checklist_id uuid DEFAULT NULL::uuid, p_agendada_para timestamp with time zone DEFAULT NULL::timestamp with time zone, p_responsavel_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid;
  v_funcao   text;
  v_q        record;
  v_codigo   text;
  v_id       uuid;
  v_alvo     uuid;
  v_versao   integer;
  v_linhas   integer := 0;
  v_previsto numeric(12,2) := 0;
BEGIN
  SELECT q.id, q.organization_id, q.cliente_id, q.quote_number, q.title,
         q.obra_endereco, q.obra_notas, q.estado, q.total
    INTO v_q
    FROM public.quotes q
   WHERE q.id = p_orcamento_id AND q.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  -- PRIMEIRO quem és e o que podes, NESTA organização. Só depois se diz
  -- alguma coisa sobre o orçamento.
  SELECT z.utilizador_id, z.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_q.organization_id) z;

  IF NOT public.ops_pode(v_q.organization_id, 'operations.orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_q.estado NOT IN ('aceite','finalizado') THEN
    RAISE EXCEPTION 'Só se põe a andar um orçamento aceite (este está "%").', v_q.estado;
  END IF;

  IF v_q.cliente_id IS NULL THEN
    RAISE EXCEPTION 'Esse orçamento não tem cliente. Sem cliente não há obra a quem entregar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ops_ordem WHERE orcamento_id = p_orcamento_id) THEN
    RAISE EXCEPTION 'Esse orçamento já tem obra: %.',
      (SELECT codigo FROM public.ops_ordem WHERE orcamento_id = p_orcamento_id LIMIT 1);
  END IF;

  IF p_local_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_local
     WHERE id = p_local_id AND organization_id = v_q.organization_id) THEN
    RAISE EXCEPTION 'Esse local não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_codigo := public.ops_proximo_codigo_interno(v_q.organization_id, 'OT');

  INSERT INTO public.ops_ordem (
    organization_id, codigo, origem, estado, prioridade,
    cliente_id, local_id, titulo, descricao,
    agendada_para, responsavel_id, orcamento_id, criada_por
  ) VALUES (
    v_q.organization_id, v_codigo, 'obra',
    CASE WHEN v_funcao = 'tecnico' THEN 'por_aprovar' ELSE 'agendada' END,
    'normal',
    v_q.cliente_id, p_local_id,
    COALESCE(nullif(btrim(v_q.title), ''), 'Obra ' || COALESCE(v_q.quote_number, '')),
    nullif(btrim(concat_ws(E'\n',
      CASE WHEN v_q.quote_number IS NOT NULL THEN 'Orçamento ' || v_q.quote_number END,
      nullif(btrim(coalesce(v_q.obra_endereco, '')), ''),
      nullif(btrim(coalesce(v_q.obra_notas, '')), '')
    )), ''),
    p_agendada_para, p_responsavel_id, p_orcamento_id, v_user
  ) RETURNING id INTO v_id;

  INSERT INTO public.ops_ordem_previsto (
    ordem_id, quote_line_id, catalog_item_id, posicao, categoria, descricao,
    unidade, quantidade, custo_material, custo_mao_obra, total_sem_iva)
  SELECT
    v_id, l.id, l.catalog_item_id, COALESCE(l.ordem, 0), l.categoria,
    COALESCE(nullif(btrim(l.item_description), ''),
             nullif(btrim(l.descricao_snapshot), ''),
             'Linha sem descrição'),
    l.unidade,
    COALESCE(l.qt, 1),
    COALESCE(l.custo_material_unit, 0),
    COALESCE(l.custo_mao_obra_unit, 0),
    ((COALESCE(l.custo_material_unit, 0) + COALESCE(l.custo_mao_obra_unit, 0))
     * COALESCE(l.qt, 1))::numeric(12,2)
    FROM public.quote_lines l
   WHERE l.quote_id = p_orcamento_id
   ORDER BY COALESCE(l.ordem, 0);

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  SELECT COALESCE(sum(total_sem_iva), 0) INTO v_previsto
    FROM public.ops_ordem_previsto WHERE ordem_id = v_id;

  IF p_local_id IS NOT NULL OR p_checklist_id IS NOT NULL THEN
    SELECT versao INTO v_versao FROM public.ops_checklist WHERE id = p_checklist_id;

    INSERT INTO public.ops_ordem_alvo
      (ordem_id, local_id, checklist_id, checklist_versao, posicao)
    VALUES (v_id, p_local_id, p_checklist_id, v_versao, 0)
    RETURNING id INTO v_alvo;

    IF p_checklist_id IS NOT NULL THEN
      INSERT INTO public.ops_ordem_tarefa (
        ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome,
        tipo, skill_id, privada, obrigatoria, tempo_estimado)
      SELECT v_id, v_alvo, ct.id, ct.posicao, ct.codigo, ct.nome, ct.tipo,
             ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
        FROM public.ops_checklist_tarefa ct
       WHERE ct.checklist_id = p_checklist_id
       ORDER BY ct.posicao;

      INSERT INTO public.ops_ordem_tarefa_medicao (
        ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
      SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
        FROM public.ops_ordem_tarefa ot
        JOIN public.ops_checklist_tarefa_medicao ctm
          ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
        JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
       WHERE ot.ordem_id = v_id
      ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;
    END IF;
  END IF;

  IF p_responsavel_id IS NOT NULL THEN
    INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel)
    VALUES (v_id, p_responsavel_id, 'responsavel')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_q.organization_id, 'ordem', v_id, 'criada_de_orcamento',
     'Orçamento ' || COALESCE(v_q.quote_number, '—'), v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'orcamento_id', p_orcamento_id,
                        'linhas', v_linhas, 'custo_previsto', v_previsto));

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'codigo', v_codigo,
    'linhas', v_linhas,
    'custo_previsto', v_previsto
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_de_orcamento_impl(uuid, uuid, uuid, timestamp with time zone, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_de_orcamento_impl(uuid, uuid, uuid, timestamp with time zone, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_dependencia_guarda()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_dependencia_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_obra  uuid;
  v_org   uuid;
  v_obra2 uuid;
  v_nome  text;
  v_dnome text;
BEGIN
  SELECT obra_id, organization_id, nome INTO v_obra, v_org, v_nome
    FROM public.ops_obra_tarefa WHERE id = NEW.tarefa_id;
  SELECT obra_id, nome INTO v_obra2, v_dnome FROM public.ops_obra_tarefa WHERE id = NEW.depende_de_id;
  IF v_obra IS NULL OR v_obra2 IS DISTINCT FROM v_obra THEN
    RAISE EXCEPTION 'Uma tarefa só pode depender de outra da mesma obra.';
  END IF;
  NEW.obra_id := v_obra;
  NEW.organization_id := v_org;

  IF EXISTS (
    WITH RECURSIVE r(id) AS (
      SELECT NEW.depende_de_id
      UNION
      SELECT d.depende_de_id FROM public.ops_obra_tarefa_dependencia d JOIN r ON d.tarefa_id = r.id
    )
    SELECT 1 FROM r WHERE r.id = NEW.tarefa_id) THEN
    RAISE EXCEPTION '"%" depois de "%" fecharia um ciclo de dependências: nenhuma das duas poderia começar.',
      v_nome, v_dnome;
  END IF;
  RETURN NEW;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_dependencia_guarda() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_dependencia_guarda() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_dependencias_defeito_impl(uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_dependencias_defeito_impl(_obra_id uuid, _inferir_servicos boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t       record;
  v_n     integer := 0;
  v_fase  smallint;
BEGIN
  FOR t IN
    SELECT ta.id, ta.organization_id, f.ordem AS fase, ta.orcamento_linha_id AS linha,
           ta.servico_id, ta.skill_id,
           (ta.orcamento_linha_id IS NULL AND ta.servico_id IS NULL) AS do_tipo
      FROM public.ops_obra_tarefa ta JOIN public.ops_obra_fase f ON f.id = ta.fase_id
     WHERE ta.obra_id = _obra_id
     ORDER BY f.ordem, ta.ordem, ta.criada_em
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia WHERE tarefa_id = t.id);

    IF t.do_tipo THEN
      -- 4. Tudo o que vem antes (as últimas de cada cadeia).
      INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
      SELECT t.id, a.id, t.organization_id, _obra_id
        FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
       WHERE a.obra_id = _obra_id AND fa.ordem < t.fase
         AND NOT EXISTS (
           SELECT 1 FROM public.ops_obra_tarefa_dependencia x
             JOIN public.ops_obra_tarefa b ON b.id = x.tarefa_id
             JOIN public.ops_obra_fase fb ON fb.id = b.fase_id
            WHERE x.depende_de_id = a.id AND b.obra_id = _obra_id AND fb.ordem < t.fase)
      ON CONFLICT DO NOTHING;
    ELSE
      IF _inferir_servicos THEN
        -- 2a. A mesma linha do orçamento, na fase anterior mais próxima.
        SELECT max(fa.ordem) INTO v_fase
          FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
         WHERE a.obra_id = _obra_id AND fa.ordem < t.fase
           AND t.linha IS NOT NULL AND a.orcamento_linha_id = t.linha;
        IF v_fase IS NOT NULL THEN
          INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
          SELECT t.id, a.id, t.organization_id, _obra_id
            FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
           WHERE a.obra_id = _obra_id AND fa.ordem = v_fase AND a.orcamento_linha_id = t.linha
             AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia x
                               JOIN public.ops_obra_tarefa b ON b.id = x.tarefa_id
                              WHERE x.depende_de_id = a.id AND b.fase_id = a.fase_id
                                AND b.orcamento_linha_id = t.linha)
          ON CONFLICT DO NOTHING;
        ELSE
          -- 2b. A mesma especialidade ou o mesmo serviço, na fase anterior mais próxima.
          SELECT max(fa.ordem) INTO v_fase
            FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
           WHERE a.obra_id = _obra_id AND fa.ordem < t.fase
             AND ((t.skill_id IS NOT NULL AND a.skill_id = t.skill_id)
                  OR (t.servico_id IS NOT NULL AND a.servico_id = t.servico_id));
          IF v_fase IS NOT NULL THEN
            INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
            SELECT t.id, a.id, t.organization_id, _obra_id
              FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
             WHERE a.obra_id = _obra_id AND fa.ordem = v_fase
               AND ((t.skill_id IS NOT NULL AND a.skill_id = t.skill_id)
                    OR (t.servico_id IS NOT NULL AND a.servico_id = t.servico_id))
               AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia x
                                 JOIN public.ops_obra_tarefa b ON b.id = x.tarefa_id
                                WHERE x.depende_de_id = a.id AND b.fase_id = a.fase_id
                                  AND ((t.skill_id IS NOT NULL AND b.skill_id = t.skill_id)
                                       OR (t.servico_id IS NOT NULL AND b.servico_id = t.servico_id)))
            ON CONFLICT DO NOTHING;
          END IF;
        END IF;
      END IF;

      -- 3. As tarefas do tipo de obra da fase anterior mais próxima.
      SELECT max(fa.ordem) INTO v_fase
        FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
       WHERE a.obra_id = _obra_id AND fa.ordem < t.fase
         AND a.orcamento_linha_id IS NULL AND a.servico_id IS NULL;
      IF v_fase IS NOT NULL THEN
        INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
        SELECT t.id, a.id, t.organization_id, _obra_id
          FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
         WHERE a.obra_id = _obra_id AND fa.ordem = v_fase
           AND a.orcamento_linha_id IS NULL AND a.servico_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia x
                             JOIN public.ops_obra_tarefa b ON b.id = x.tarefa_id
                            WHERE x.depende_de_id = a.id AND b.fase_id = a.fase_id
                              AND b.orcamento_linha_id IS NULL AND b.servico_id IS NULL)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia WHERE tarefa_id = t.id) THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;

  -- A coluna antiga fica com a "primeira" (a que acaba mais tarde no modelo:
  -- a de fase/ordem maior), para quem ainda só lê depende_de.
  UPDATE public.ops_obra_tarefa ta
     SET depende_de = (SELECT x.depende_de_id
                         FROM public.ops_obra_tarefa_dependencia x
                         JOIN public.ops_obra_tarefa d ON d.id = x.depende_de_id
                         JOIN public.ops_obra_fase fd ON fd.id = d.fase_id
                        WHERE x.tarefa_id = ta.id
                        ORDER BY fd.ordem DESC, d.ordem DESC, d.id LIMIT 1)
   WHERE ta.obra_id = _obra_id AND ta.depende_de IS NULL
     AND EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia x WHERE x.tarefa_id = ta.id);

  RETURN v_n;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_dependencias_defeito_impl(uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_dependencias_defeito_impl(uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_dias_uteis_entre(date, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_dias_uteis_entre(_de date, _ate date)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _de IS NULL OR _ate IS NULL OR _ate <= _de THEN 0
    ELSE (SELECT count(*)::integer
            FROM generate_series((_de + 1)::timestamp, _ate::timestamp, interval '1 day') d
           WHERE extract(isodow FROM d) <= 5) END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_dias_uteis_entre(date, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_dias_uteis_entre(date, date) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_dias_uteis_entre(date, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_dias_uteis_entre_org(uuid, date, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_dias_uteis_entre_org(_org uuid, _de date, _ate date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _de IS NULL OR _ate IS NULL OR _ate <= _de THEN 0
    ELSE (SELECT count(*)::integer
            FROM unnest(public.ops_obra_dias_uteis_lista(_org, _de + 1, _ate - _de)) d
           WHERE d <= _ate) END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_dias_uteis_entre_org(uuid, date, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_dias_uteis_entre_org(uuid, date, date) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_dias_uteis_entre_org(uuid, date, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_dias_uteis_lista(uuid, date, integer)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_dias_uteis_lista(_org uuid, _d date, _n integer)
 RETURNS date[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v    date := _d;
  a    date[] := '{}';
  fer  date[] := '{}';
  rec  text[] := '{}';
  k    integer := 0;
BEGIN
  IF _org IS NOT NULL AND to_regclass('public.schedule_holidays') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(array_agg(h.holiday_date) FILTER (WHERE NOT h.is_recurring), ''{}''),
                    COALESCE(array_agg(to_char(h.holiday_date, ''MM-DD'')) FILTER (WHERE h.is_recurring), ''{}'')
               FROM public.schedule_holidays h
              WHERE (h.organization_id = $1 OR (h.organization_id IS NULL AND upper(h.country_code) = ''PT''))
                AND (h.is_recurring OR h.holiday_date >= $2)'
       INTO fer, rec USING _org, _d;
  END IF;
  WHILE k < GREATEST(_n, 1) LOOP
    IF extract(isodow FROM v) <= 5 AND NOT (v = ANY (fer)) AND NOT (to_char(v, 'MM-DD') = ANY (rec)) THEN
      a := a || v;
      k := k + 1;
    END IF;
    v := v + 1;
  END LOOP;
  RETURN a;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_dias_uteis_lista(uuid, date, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_dias_uteis_lista(uuid, date, integer) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_distribuir_impl(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_distribuir_impl(_obra_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o       record;
  v_funcoes text[];
  v_n       integer := 0;
  v_k       integer;
  t         record;
BEGIN
  SELECT id, organization_id, COALESCE(morada, '') AS morada INTO v_o
    FROM public.ops_obra WHERE id = _obra_id;

  v_funcoes := CASE WHEN EXISTS (
                      SELECT 1 FROM public.ops_utilizador_perfil
                       WHERE organization_id = v_o.organization_id AND ativo
                         AND funcao IN ('tecnico','operador'))
                    THEN ARRAY['tecnico','operador']
                    ELSE ARRAY['admin','gestor','supervisor','tecnico','operador'] END;

  FOR t IN
    SELECT ta.id, ta.inicio_planeado AS ini, COALESCE(ta.fim_planeado, ta.inicio_planeado) AS fim,
           ta.pessoas_previstas AS n, ta.skill_id AS skill
      FROM public.ops_obra_tarefa ta
      JOIN public.ops_obra_fase fa ON fa.id = ta.fase_id
     WHERE ta.obra_id = _obra_id
       AND ta.estado IN ('por_fazer','rejeitada')
       AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = ta.id)
     ORDER BY ta.inicio_planeado NULLS LAST, fa.ordem, ta.ordem
  LOOP
    INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id)
    SELECT t.id, c.utilizador_id, v_o.organization_id, _obra_id
      FROM (
        SELECT p.utilizador_id,
               (t.ini IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                    JOIN public.ops_obra_tarefa o2 ON o2.id = tp.tarefa_id
                    JOIN public.ops_obra ob ON ob.id = o2.obra_id
                   WHERE tp.utilizador_id = p.utilizador_id
                     AND o2.obra_id <> _obra_id
                     AND o2.estado IN ('por_fazer','em_curso','rejeitada')
                     AND ob.estado IN ('planeada','em_curso')
                     AND o2.inicio_planeado IS NOT NULL
                     AND daterange(o2.inicio_planeado, COALESCE(o2.fim_planeado, o2.inicio_planeado), '[]')
                      && daterange(t.ini, t.fim, '[]'))) AS choque,
               (t.skill IS NULL OR EXISTS (
                  SELECT 1 FROM public.ops_utilizador_skill us
                   WHERE us.utilizador_id = p.utilizador_id AND us.skill_id = t.skill)) AS tem_skill,
               (nullif(btrim(p.zona_base), '') IS NOT NULL
                  AND v_o.morada ILIKE '%' || btrim(p.zona_base) || '%') AS na_zona,
               EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                        WHERE tp.obra_id = _obra_id AND tp.utilizador_id = p.utilizador_id) AS na_obra,
               (SELECT COALESCE(sum(o2.minutos_previstos), 0)
                  FROM public.ops_obra_tarefa_pessoa tp
                  JOIN public.ops_obra_tarefa o2 ON o2.id = tp.tarefa_id
                 WHERE tp.utilizador_id = p.utilizador_id
                   AND o2.estado IN ('por_fazer','em_curso','rejeitada')) AS carga
          FROM public.ops_utilizador_perfil p
         WHERE p.organization_id = v_o.organization_id AND p.ativo
           AND p.funcao = ANY (v_funcoes)
         ORDER BY choque, tem_skill DESC, na_zona DESC, na_obra DESC, carga, p.utilizador_id
         LIMIT t.n
      ) c
    ON CONFLICT (tarefa_id, utilizador_id) DO NOTHING;
    GET DIAGNOSTICS v_k = ROW_COUNT;
    IF v_k > 0 THEN v_n := v_n + 1; END IF;
  END LOOP;

  RETURN v_n;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_distribuir_impl(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_distribuir_impl(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_empurrar_dependentes_impl(uuid, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_empurrar_dependentes_impl(_tarefa uuid, _fim_anterior date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org     uuid;
  v_fila    uuid[] := ARRAY[_tarefa];
  v_atual   uuid;
  v_cfim    date;
  v_cant    date;
  v_antes   jsonb := jsonb_build_object(_tarefa::text, _fim_anterior);
  v_mexidas jsonb := '{}'::jsonb;
  v_d       record;
  v_req     date;
  v_nf      date;
  v_passos  integer := 0;
BEGIN
  SELECT organization_id INTO v_org FROM public.ops_obra_tarefa WHERE id = _tarefa;
  WHILE COALESCE(array_length(v_fila, 1), 0) > 0 AND v_passos < 5000 LOOP
    v_passos := v_passos + 1;
    v_atual := v_fila[1];
    v_fila := v_fila[2:array_length(v_fila, 1)];
    SELECT COALESCE(fim_planeado, inicio_planeado) INTO v_cfim FROM public.ops_obra_tarefa WHERE id = v_atual;
    CONTINUE WHEN v_cfim IS NULL;
    v_cant := (v_antes ->> v_atual::text)::date;

    FOR v_d IN
      SELECT d.id, d.nome, d.inicio_planeado AS ini, COALESCE(d.fim_planeado, d.inicio_planeado) AS fim
        FROM public.ops_obra_tarefa_dependencia x
        JOIN public.ops_obra_tarefa d ON d.id = x.tarefa_id
       WHERE x.depende_de_id = v_atual
         AND d.estado = 'por_fazer' AND d.inicio_planeado IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.ops_obra_registo r WHERE r.tarefa_id = d.id)
       ORDER BY d.inicio_planeado, d.id
    LOOP
      -- Começava no dia seguinte ao fim da anterior → continua no dia
      -- seguinte ao novo fim; começava no próprio dia → no próprio dia.
      v_req := CASE WHEN v_cant IS NOT NULL AND v_d.ini > v_cant
                    THEN public.ops_obra_somar_dias_uteis_org(v_org, v_cfim, 1)
                    ELSE public.ops_obra_somar_dias_uteis_org(v_org, v_cfim, 0) END;
      CONTINUE WHEN v_d.ini >= v_req;
      v_nf := public.ops_obra_somar_dias_uteis_org(v_org, v_req,
                public.ops_obra_dias_uteis_entre_org(v_org, v_d.ini, v_d.fim));

      UPDATE public.ops_obra_tarefa
         SET inicio_original = CASE WHEN inicio_original IS NULL AND fim_original IS NULL
                                    THEN inicio_planeado ELSE inicio_original END,
             fim_original    = CASE WHEN inicio_original IS NULL AND fim_original IS NULL
                                    THEN fim_planeado ELSE fim_original END,
             inicio_planeado = v_req,
             fim_planeado    = v_nf,
             atualizada_em   = now()
       WHERE id = v_d.id;

      IF NOT (v_mexidas ? v_d.id::text) THEN
        v_mexidas := v_mexidas || jsonb_build_object(v_d.id::text, jsonb_build_object(
          'tarefa_id', v_d.id, 'nome', v_d.nome, 'inicio_anterior', v_d.ini, 'fim_anterior', v_d.fim));
        v_antes := v_antes || jsonb_build_object(v_d.id::text, v_d.fim);
      END IF;
      v_mexidas := jsonb_set(v_mexidas, ARRAY[v_d.id::text, 'novo_inicio'], to_jsonb(v_req));
      v_mexidas := jsonb_set(v_mexidas, ARRAY[v_d.id::text, 'novo_fim'], to_jsonb(v_nf));
      v_fila := v_fila || v_d.id;
    END LOOP;
  END LOOP;
  RETURN v_mexidas;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_empurrar_dependentes_impl(uuid, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_empurrar_dependentes_impl(uuid, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_evento(uuid, uuid, text, text, uuid, jsonb)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_evento(_org uuid, _obra_id uuid, _tipo text, _descricao text, _autor uuid, _depois jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES (_org, 'obra', _obra_id, _tipo, _descricao, _autor, NULL, _depois)
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_evento(uuid, uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_evento(uuid, uuid, text, text, uuid, jsonb) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_exigir(uuid, text, text[], text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_exigir(_org uuid, _perm text, _funcoes text[], _mensagem text, OUT o_utilizador uuid, OUT o_funcao text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT q.utilizador_id, q.funcao INTO o_utilizador, o_funcao
    FROM public.ops_quem_sou(_org) q;

  IF _funcoes IS NOT NULL AND o_funcao <> 'admin' AND NOT (o_funcao = ANY (_funcoes)) THEN
    RAISE EXCEPTION '%', _mensagem USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.ops_pode(_org, _perm) THEN
    RAISE EXCEPTION 'Sem permissão (%) nesta organização.', _perm
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_exigir(uuid, text, text[], text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_exigir(uuid, text, text[], text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_fatores(jsonb, jsonb)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_fatores(_area jsonb, _local jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'habitada',            CASE (_local->>'habitada_durante_obra') WHEN 'true' THEN 'sim' WHEN 'false' THEN 'nao' END,
    'acesso',              CASE WHEN _local->>'acesso' IN ('facil','dificil') THEN _local->>'acesso' END,
    'elevador',            CASE (_local->>'tem_elevador') WHEN 'true' THEN 'sim' WHEN 'false' THEN 'nao' END,
    'andar',               CASE WHEN public.ops_num(_local->>'piso') IS NULL THEN NULL
                                WHEN public.ops_num(_local->>'piso') <= 0 THEN 'rc'
                                WHEN public.ops_num(_local->>'piso') <= 2 THEN '1-2'
                                ELSE '3+' END,
    -- O caminho até à área (mobilada, distância) é da ÁREA (necessidade do
    -- negócio); a ficha do local só se usa se a área não disser.
    'mobilada',            CASE WHEN COALESCE(_area->>'diag_mobilada', _local->>'mobilada') IN ('pouco','medio','muito')
                                THEN COALESCE(_area->>'diag_mobilada', _local->>'mobilada') END,
    'distancia',           CASE WHEN COALESCE(_area->>'diag_distancia_entrada', _local->>'distancia_entrada') IN ('curta','media','longa')
                                THEN COALESCE(_area->>'diag_distancia_entrada', _local->>'distancia_entrada') END,
    'animais',             CASE (_local->>'animais') WHEN 'true' THEN 'sim' WHEN 'false' THEN 'nao' END,
    'janela',              CASE (_area->>'diag_janela') WHEN 'true' THEN 'sim' WHEN 'false' THEN 'nao' END,
    'local_cortes',        CASE WHEN _area->>'diag_local_cortes' IN ('na_area','varanda','fora') THEN _area->>'diag_local_cortes' END,
    'altura_revestimento', CASE WHEN _area->>'diag_altura_revestimento' IN ('20cm','60cm','120cm','teto')
                                THEN _area->>'diag_altura_revestimento' END))
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_fatores(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_fatores(jsonb, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_fatores(jsonb, jsonb) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_fatores_chave(jsonb, text[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_fatores_chave(_fatores jsonb, _quais text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(string_agg(k || '=' || (_fatores->>k), '|' ORDER BY k), '')
    FROM unnest(COALESCE(_quais, '{}')) k
   WHERE _fatores ? k
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_fatores_chave(jsonb, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_fatores_chave(jsonb, text[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_fatores_chave(jsonb, text[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_ficha_local_dados(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_ficha_local_dados(_obra uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o   record;
  v_orc uuid;
  v_f   jsonb;
BEGIN
  SELECT orcamento_id, contrato_id INTO v_o FROM public.ops_obra WHERE id = _obra;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  v_orc := v_o.orcamento_id;
  IF v_orc IS NULL AND v_o.contrato_id IS NOT NULL THEN
    v_orc := public.ops_contrato_orcamento(v_o.contrato_id);
  END IF;
  IF v_orc IS NULL
     OR NOT public.ops_obra_crm_tem('anew_address_building', ARRAY['address_id'])
     OR NOT public.ops_obra_crm_tem('anew_addresses', ARRAY['id','floor'])
     OR NOT public.ops_obra_crm_tem('quotes', ARRAY['id','site_address_id']) THEN
    RETURN '{}'::jsonb;
  END IF;
  EXECUTE 'SELECT to_jsonb(b) || jsonb_build_object(''piso'', a.floor)
             FROM public.quotes q
             JOIN public.anew_address_building b ON b.address_id = q.site_address_id
             LEFT JOIN public.anew_addresses a ON a.id = q.site_address_id
            WHERE q.id = $1'
     INTO v_f USING v_orc;
  RETURN COALESCE(v_f, '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN '{}'::jsonb;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_ficha_local_dados(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_ficha_local_dados(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_ids_de_servicos(uuid, jsonb)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_ids_de_servicos(_org uuid, _nomes jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v uuid[];
BEGIN
  IF to_regclass('public.services') IS NULL OR jsonb_typeof(_nomes) <> 'array' THEN
    RETURN '{}';
  END IF;
  EXECUTE 'SELECT COALESCE(array_agg(s.id), ''{}'') FROM public.services s
            WHERE btrim(s.name) IN (SELECT btrim(x) FROM jsonb_array_elements_text($2) x)
              AND NOT COALESCE(s.is_deleted, false) AND s.deleted_at IS NULL
              AND (s.organization_id = $1'
    || CASE WHEN to_regclass('public.service_organizations') IS NOT NULL
            THEN ' OR EXISTS (SELECT 1 FROM public.service_organizations so
                               WHERE so.service_id = s.id AND so.organization_id = $1)'
            ELSE '' END
    || ')'
    INTO v USING _org, _nomes;
  RETURN v;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_ids_de_servicos(uuid, jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_ids_de_servicos(uuid, jsonb) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_indisponiveis_impl(uuid, date, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_indisponiveis_impl(_org uuid, _ini date, _fim date)
 RETURNS TABLE(utilizador_id uuid, motivo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ini date := COALESCE(_ini, current_date);
  v_fim date := GREATEST(COALESCE(_fim, _ini, current_date), COALESCE(_ini, current_date));
BEGIN
  IF to_regclass('public.resource_time_off') IS NOT NULL AND to_regclass('public.schedule_resources') IS NOT NULL THEN
    RETURN QUERY EXECUTE $q$
      SELECT DISTINCT sr.user_id,
             'ausência: ' || COALESCE(nullif(btrim(o.title), ''), nullif(btrim(o.reason), ''), 'indisponível')
        FROM public.resource_time_off o
        JOIN public.schedule_resources sr ON sr.id = o.resource_id
        JOIN public.ops_utilizador_perfil p ON p.utilizador_id = sr.user_id AND p.organization_id = $1
       WHERE sr.user_id IS NOT NULL
         AND COALESCE(o.approved, false)
         AND o.start_date <= $3 AND o.end_date >= $2
    $q$ USING _org, v_ini, v_fim;
  END IF;

  IF to_regclass('public.schedule_holidays') IS NOT NULL THEN
    RETURN QUERY EXECUTE $q$
      SELECT p.utilizador_id, 'feriado: ' || h.nome
        FROM (SELECT DISTINCT ON (h.name) h.name::text AS nome
                FROM public.schedule_holidays h
                JOIN generate_series($2, $3, interval '1 day') g(d) ON
                     (h.holiday_date = g.d::date
                      OR (h.is_recurring AND extract(month FROM h.holiday_date) = extract(month FROM g.d)
                                         AND extract(day FROM h.holiday_date) = extract(day FROM g.d)))
               WHERE h.organization_id = $1
                  OR (h.organization_id IS NULL AND upper(h.country_code) = 'PT')
               ORDER BY h.name) h
        CROSS JOIN public.ops_utilizador_perfil p
       WHERE p.organization_id = $1 AND p.ativo
    $q$ USING _org, v_ini, v_fim;
  END IF;

  IF to_regclass('public.pessoas_ausencias_dias') IS NOT NULL AND to_regclass('public.pessoas_contas') IS NOT NULL THEN
    RETURN QUERY EXECUTE format($q$
      SELECT DISTINCT pc.anew_user_id, 'ausência: ' || %s
        FROM public.pessoas_ausencias_dias d
        JOIN public.pessoas_contas pc
          ON pc.pessoa_id = d.pessoa_id AND pc.organization_id = d.organization_id AND pc.estado = 'activa'
        %s
       WHERE d.organization_id = $1 AND d.estado = 'aprovado'
         AND d.data BETWEEN $2 AND $3
    $q$,
      CASE WHEN to_regclass('public.hr_ausencias_tipos') IS NOT NULL THEN 'COALESCE(t.nome, ''RH'')' ELSE '''RH''' END,
      CASE WHEN to_regclass('public.hr_ausencias_tipos') IS NOT NULL
           THEN 'LEFT JOIN public.hr_ausencias_tipos t ON t.id = d.tipo_id' ELSE '' END)
    USING _org, v_ini, v_fim;
  END IF;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_indisponiveis_impl(uuid, date, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_indisponiveis_impl(uuid, date, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_local_resumo(jsonb)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_local_resumo(_f jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(concat_ws(' · ',
    CASE WHEN NULLIF(btrim(_f->>'piso'), '') IS NOT NULL THEN 'piso ' || (_f->>'piso') END,
    CASE (_f->>'tem_elevador') WHEN 'true' THEN 'com elevador' WHEN 'false' THEN 'sem elevador' END,
    CASE WHEN NULLIF(_f->>'acesso', '') IS NOT NULL THEN 'acesso ' || (_f->>'acesso') END,
    CASE WHEN NULLIF(_f->>'estacionamento', '') IS NOT NULL THEN 'estacionamento ' || (_f->>'estacionamento') END,
    CASE (_f->>'habitada_durante_obra') WHEN 'true' THEN 'casa habitada' END), '')
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_local_resumo(jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_local_resumo(jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_local_resumo(jsonb) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_material_prazo(uuid, jsonb, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_material_prazo(_org uuid, _materiais jsonb, _desde date)
 RETURNS TABLE(data date, nota text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prod uuid[];
  v_po   text := 'SELECT NULL::uuid AS product_id, NULL::date AS d WHERE false';
  v_lt   text := 'SELECT NULL::uuid AS product_id, NULL::integer AS dias WHERE false';
BEGIN
  IF jsonb_typeof(_materiais) IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;
  SELECT array_agg(DISTINCT (m->>'produto_id')::uuid) INTO v_prod
    FROM jsonb_array_elements(_materiais) m
   WHERE nullif(m->>'produto_id', '') IS NOT NULL
     AND (public.ops_num(m->>'disponivel') IS NULL
          OR public.ops_num(m->>'disponivel') < COALESCE(public.ops_num(m->>'quantidade'), 0));
  IF v_prod IS NULL THEN
    RETURN;
  END IF;

  IF public.ops_obra_crm_tem('purchase_orders', ARRAY['id','organization_id','status','deleted_at','expected_delivery'])
     AND public.ops_obra_crm_tem('purchase_order_items', ARRAY['purchase_order_id','product_id','quantity','received_quantity']) THEN
    v_po := 'SELECT poi.product_id, min(po.expected_delivery) AS d
               FROM public.purchase_orders po
               JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
              WHERE po.organization_id = $1 AND po.deleted_at IS NULL
                AND po.status IN (''pending'', ''ordered'', ''partially_received'')
                AND po.expected_delivery IS NOT NULL AND po.expected_delivery >= $3
                AND COALESCE(poi.received_quantity, 0) < poi.quantity
                AND poi.product_id = ANY ($2)
              GROUP BY poi.product_id';
  END IF;
  IF public.ops_obra_crm_tem('item_suppliers',
       ARRAY['product_id','supplier_id','lead_time_days','is_preferred','is_active','deleted_at']) THEN
    v_lt := 'SELECT DISTINCT ON (s.product_id) s.product_id,
                    COALESCE(nullif(s.lead_time_days, 0), sp.delivery_sla_days) AS dias
               FROM public.item_suppliers s '
         || CASE WHEN public.ops_obra_crm_tem('suppliers', ARRAY['id','delivery_sla_days'])
                 THEN 'LEFT JOIN public.suppliers sp ON sp.id = s.supplier_id '
                 ELSE 'LEFT JOIN (SELECT NULL::uuid AS id, NULL::integer AS delivery_sla_days) sp ON false ' END
         || 'WHERE s.deleted_at IS NULL AND COALESCE(s.is_active, true)
                AND s.product_id = ANY ($2)
                AND COALESCE(nullif(s.lead_time_days, 0), sp.delivery_sla_days) > 0
              ORDER BY s.product_id, s.is_preferred DESC NULLS LAST,
                       COALESCE(nullif(s.lead_time_days, 0), sp.delivery_sla_days)';
  END IF;

  RETURN QUERY EXECUTE format($q$
    WITH m AS (
      SELECT DISTINCT ON ((e->>'produto_id')::uuid) (e->>'produto_id')::uuid AS pid,
             COALESCE(nullif(btrim(e->>'nome'), ''), 'Material') AS nome
        FROM jsonb_array_elements($4) e
       WHERE nullif(e->>'produto_id', '') IS NOT NULL AND (e->>'produto_id')::uuid = ANY ($2)
    ),
    po AS (%s),
    lt AS (%s),
    x AS (
      SELECT m.nome,
             COALESCE(po.d, $3 + lt.dias) AS d,
             CASE WHEN po.d IS NOT NULL THEN 'encomenda prevista para ' || to_char(po.d, 'DD/MM')
                  ELSE 'prazo do fornecedor de ' || lt.dias || ' dias' END AS porque
        FROM m LEFT JOIN po ON po.product_id = m.pid LEFT JOIN lt ON lt.product_id = m.pid
       WHERE po.d IS NOT NULL OR lt.dias IS NOT NULL
    )
    SELECT max(x.d), left(string_agg(x.nome || ': ' || x.porque, ' · ' ORDER BY x.d DESC, x.nome), 500)
      FROM x HAVING count(*) > 0 $q$, v_po, v_lt)
  USING _org, v_prod, _desde, _materiais;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_material_prazo(uuid, jsonb, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_material_prazo(uuid, jsonb, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_medidas(jsonb, jsonb, numeric)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_medidas(_area jsonb, _ref jsonb, _mult numeric DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  a      jsonb := COALESCE(_area, '{}'::jsonb);
  r      jsonb := COALESCE(_ref, '{}'::jsonb);
  m      numeric := GREATEST(COALESCE(_mult, 1), 0);
  v      jsonb := '{}'::jsonb;
  pav    numeric;
  par    numeric;
  alt    numeric;
  per    numeric;
  k      text;
  num    numeric;
BEGIN
  pav := COALESCE(public.ops_num(a->>'diag_m2_pavimento'), public.ops_num(a->>'diag_area_m2'));
  per := public.ops_num(a->>'diag_perimetro_m');
  alt := CASE a->>'diag_altura_revestimento'
           WHEN '20cm' THEN 0.2 WHEN '60cm' THEN 0.6 WHEN '120cm' THEN 1.2
           WHEN 'teto' THEN COALESCE(public.ops_num(a->>'diag_pe_direito_m'), 2.5) END;
  IF per IS NOT NULL AND alt IS NOT NULL THEN
    par := round(per * alt, 2);
  END IF;

  IF pav IS NOT NULL THEN v := v || jsonb_build_object('m2_pavimento', pav); END IF;
  IF par IS NOT NULL THEN v := v || jsonb_build_object('m2_parede', par); END IF;
  IF public.ops_num(a->>'diag_pontos_agua') IS NOT NULL THEN
    v := v || jsonb_build_object('pontos_agua', public.ops_num(a->>'diag_pontos_agua'));
  END IF;
  IF public.ops_num(a->>'diag_pontos_eletricos') IS NOT NULL THEN
    v := v || jsonb_build_object('pontos_eletricos', public.ops_num(a->>'diag_pontos_eletricos'));
  END IF;

  -- O que faltar, da referência do pacote (× qt).
  FOR k IN SELECT unnest(ARRAY['m2_pavimento','m2_parede','pontos_agua','pontos_eletricos','pecas_sanitarias',
                               'acessorios','modulos','eletrodomesticos','ml_bancada']) LOOP
    num := public.ops_num(r->>k);
    IF NOT v ? k AND num IS NOT NULL THEN
      v := v || jsonb_build_object(k, round(num * m, 2));
    END IF;
  END LOOP;

  IF v ? 'm2_pavimento' OR v ? 'm2_parede' THEN
    v := v || jsonb_build_object('m2_total',
      COALESCE((v->>'m2_pavimento')::numeric, 0) + COALESCE((v->>'m2_parede')::numeric, 0));
  ELSIF public.ops_num(r->>'m2_total') IS NOT NULL THEN
    v := v || jsonb_build_object('m2_total', round(public.ops_num(r->>'m2_total') * m, 2));
  END IF;
  RETURN v;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_medidas(jsonb, jsonb, numeric) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_medidas(jsonb, jsonb, numeric) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_medidas(jsonb, jsonb, numeric) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_minuto_apos_espera(date[], time without time zone, integer, bigint, numeric)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_minuto_apos_espera(_dias date[], _hora time without time zone, _mpd integer, _m bigint, _horas numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  di   integer;
  off  integer;
  ts   timestamp;
  t    timestamp;
  dt   date;
  tod  interval;
  i    integer;
  n    integer := COALESCE(array_length(_dias, 1), 0);
BEGIN
  IF COALESCE(_horas, 0) <= 0 OR n = 0 THEN
    RETURN _m;
  END IF;
  IF _m <= 0 THEN
    ts := _dias[1] + _hora;
  ELSE
    di := ((_m - 1) / _mpd)::integer;
    off := (_m - di::bigint * _mpd)::integer;
    IF di + 1 > n THEN
      RETURN _m + ceil(_horas / 24.0)::bigint * _mpd;
    END IF;
    ts := _dias[di + 1] + _hora + make_interval(mins => off);
  END IF;
  t := ts + make_interval(secs => (_horas * 3600)::double precision);
  dt := t::date;

  i := NULL;
  FOR k IN 1 .. n LOOP
    IF _dias[k] >= dt THEN i := k; EXIT; END IF;
  END LOOP;
  IF i IS NULL THEN
    RETURN _m + ceil(_horas / 24.0)::bigint * _mpd;   -- para lá do horizonte: aproximação
  END IF;
  IF _dias[i] > dt THEN
    RETURN (i - 1)::bigint * _mpd;                     -- não é dia útil: o próximo, de manhã
  END IF;
  tod := t - dt::timestamp;
  IF tod <= _hora::interval THEN
    RETURN (i - 1)::bigint * _mpd;                     -- antes de o dia começar
  END IF;
  IF tod >= _hora::interval + make_interval(mins => _mpd) THEN
    RETURN i::bigint * _mpd;                           -- depois de o dia acabar: o dia útil seguinte
  END IF;
  RETURN (i - 1)::bigint * _mpd + ceil(extract(epoch FROM (tod - _hora::interval)) / 60.0)::bigint;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_minuto_apos_espera(date[], time without time zone, integer, bigint, numeric) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_minuto_apos_espera(date[], time without time zone, integer, bigint, numeric) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_minuto_apos_espera(date[], time without time zone, integer, bigint, numeric) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_minutos_reais(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_minutos_reais(_tarefa_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(round(sum(EXTRACT(EPOCH FROM (COALESCE(r.fim, now()) - r.inicio))) / 60.0, 1), 0)
    FROM public.ops_obra_registo r WHERE r.tarefa_id = _tarefa_id
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_minutos_reais(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_minutos_reais(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_morada_do_crm(uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_morada_do_crm(_cliente uuid, _orc uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v text;
  fmt CONSTANT text := $f$btrim(concat_ws(', ',
      nullif(btrim(concat_ws(' ', a.street, a.number)), ''),
      nullif(btrim(concat_ws(' ', nullif(a.floor, ''), nullif(a.unit, ''))), ''),
      nullif(btrim(concat_ws(' ', a.postal_code, a.city)), '')))$f$;
BEGIN
  IF to_regclass('public.anew_addresses') IS NULL THEN
    RETURN NULL;
  END IF;

  IF _orc IS NOT NULL AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'site_address_id') THEN
    EXECUTE 'SELECT ' || fmt || ' FROM public.quotes q JOIN public.anew_addresses a ON a.id = q.site_address_id
              WHERE q.id = $1' INTO v USING _orc;
  END IF;

  IF nullif(v, '') IS NULL AND _cliente IS NOT NULL
     AND to_regclass('public.anew_entity_addresses') IS NOT NULL THEN
    EXECUTE 'SELECT ' || fmt || '
               FROM public.anew_clients cl
               JOIN public.anew_entity_addresses ea ON ea.entity_id = cl.entity_id
               JOIN public.anew_addresses a ON a.id = ea.address_id
              WHERE cl.id = $1 AND (ea.valid_to IS NULL OR ea.valid_to > now())
              ORDER BY COALESCE(ea.is_primary, false) DESC, (ea.address_type = ''obra'') DESC NULLS LAST
              LIMIT 1' INTO v USING _cliente;
  END IF;

  RETURN nullif(v, '');
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_morada_do_crm(uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_morada_do_crm(uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_notificacoes_resolver(uuid, text, uuid[], uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_notificacoes_resolver(_org uuid, _tipo text, _manter uuid[], _obra uuid DEFAULT NULL::uuid, _motivo text DEFAULT 'resolvido'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n integer := 0;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN RETURN 0; END IF;
  UPDATE public.notifications
     SET is_resolved = true, resolved_at = now(), resolved_reason = _motivo
   WHERE organization_id = _org AND type = _tipo AND entity_type = 'ops_obra'
     AND NOT is_resolved AND data->>'modulo' = 'operacoes'
     AND (_obra IS NULL OR entity_id = _obra)
     AND NOT (entity_id = ANY (COALESCE(_manter, '{}')));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Avisos não resolvidos (%): %', _tipo, SQLERRM;
  RETURN 0;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_notificacoes_resolver(uuid, text, uuid[], uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_notificacoes_resolver(uuid, text, uuid[], uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_notificar(uuid, uuid, text, uuid, text, text, text, text, text[], jsonb)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_notificar(_org uuid, _utilizador uuid, _tipo text, _obra uuid, _titulo text, _mensagem text, _link text, _prioridade text, _chaves text[], _dados jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth   uuid;
  v_ant    record;
  v_chaves text[] := COALESCE((SELECT array_agg(DISTINCT c ORDER BY c) FROM unnest(_chaves) c WHERE c IS NOT NULL), '{}');
  v_dados  jsonb;
  v_novas  boolean;
BEGIN
  IF to_regclass('public.notifications') IS NULL OR _utilizador IS NULL OR _obra IS NULL THEN
    RETURN 'sem_sino';
  END IF;
  SELECT auth_user_id INTO v_auth FROM public.anew_users WHERE id = _utilizador;
  IF v_auth IS NULL THEN
    RETURN 'sem_sino';   -- existe em Operações mas não entra na aplicação
  END IF;
  -- Só a equipa: nunca um cliente do CRM (membership role_is_client) nem
  -- quem não tem perfil ativo em Operações nesta organização.
  IF NOT EXISTS (SELECT 1 FROM public.ops_utilizador_perfil p
                  WHERE p.organization_id = _org AND p.utilizador_id = _utilizador AND p.ativo) THEN
    RETURN 'fora_da_equipa';
  END IF;
  IF public.ops_obra_crm_tem('anew_memberships', ARRAY['user_id','organization_id','role_is_client']) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.anew_memberships m
                             WHERE m.user_id = $1 AND m.organization_id = $2 AND m.role_is_client)'
       INTO v_novas USING _utilizador, _org;
    IF v_novas THEN
      RETURN 'cliente';
    END IF;
  END IF;

  v_dados := COALESCE(_dados, '{}'::jsonb)
             || jsonb_build_object('modulo', 'operacoes', 'obra_id', _obra, 'chaves', to_jsonb(v_chaves));

  SELECT id, is_dismissed, title, message, data INTO v_ant
    FROM public.notifications
   WHERE user_id = v_auth AND type = _tipo AND entity_id = _obra AND NOT is_resolved
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.notifications
      (user_id, organization_id, kind, type, title, message, link, entity_type, entity_id, priority, data)
    VALUES
      (v_auth, _org, 'notification', _tipo, _titulo, _mensagem, _link, 'ops_obra', _obra,
       COALESCE(_prioridade, 'medium'), v_dados);
    RETURN 'novo';
  END IF;

  v_novas := EXISTS (
    SELECT 1 FROM unnest(v_chaves) c
     WHERE NOT (COALESCE(v_ant.data->'chaves', '[]'::jsonb) ? c));

  IF v_novas AND v_ant.is_dismissed THEN
    -- Fechou o anterior; isto é coisa nova → um aviso novo.
    UPDATE public.notifications
       SET is_resolved = true, resolved_at = now(), resolved_reason = 'substituido'
     WHERE id = v_ant.id;
    INSERT INTO public.notifications
      (user_id, organization_id, kind, type, title, message, link, entity_type, entity_id, priority, data)
    VALUES
      (v_auth, _org, 'notification', _tipo, _titulo, _mensagem, _link, 'ops_obra', _obra,
       COALESCE(_prioridade, 'medium'), v_dados);
    RETURN 'de_novo';
  ELSIF v_novas THEN
    UPDATE public.notifications
       SET title = _titulo, message = _mensagem, link = _link, priority = COALESCE(_prioridade, priority),
           data = v_dados, is_read = false, read_at = NULL, created_at = now()
     WHERE id = v_ant.id;
    RETURN 'de_novo';
  ELSIF v_ant.title IS DISTINCT FROM _titulo OR v_ant.message IS DISTINCT FROM _mensagem
        OR v_ant.data IS DISTINCT FROM v_dados THEN
    UPDATE public.notifications
       SET title = _titulo, message = _mensagem, link = _link, data = v_dados
     WHERE id = v_ant.id;
    RETURN 'atualizado';
  END IF;
  RETURN 'igual';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Aviso não enviado (%): %', _tipo, SQLERRM;
  RETURN 'sem_sino';
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_notificar(uuid, uuid, text, uuid, text, text, text, text, text[], jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_notificar(uuid, uuid, text, uuid, text, text, text, text, text[], jsonb) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_passo_do_pacote(uuid, jsonb, text, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_passo_do_pacote(_obra uuid, _exp jsonb, _ctx text, _chave text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id
    FROM jsonb_array_elements(COALESCE(_exp, '[]'::jsonb)) x
    JOIN public.ops_obra_tarefa t ON t.obra_id = _obra AND t.ordem = 1000 + (x->>'ordem')::integer
   WHERE COALESCE((x->>'pacote')::boolean, false)
     AND x->>'contexto' = _ctx AND x->>'chave' = _chave
   ORDER BY (x->>'ordem')::integer
   LIMIT 1
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_passo_do_pacote(uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_passo_do_pacote(uuid, jsonb, text, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_pessoas_livres_impl(uuid, date, date, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_pessoas_livres_impl(_org uuid, _ini date, _fim date, _excluir uuid DEFAULT NULL::uuid)
 RETURNS TABLE(utilizador_id uuid, nome text, funcao text, skills uuid[], zona text, minutos_ocupados integer, dias_cheios integer, ordens integer, livre boolean, motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH lim AS (
    SELECT COALESCE(_ini, current_date) AS ini,
           GREATEST(COALESCE(_fim, _ini, current_date), COALESCE(_ini, current_date)) AS fim
  ),
  todos AS (
    SELECT g::date AS dia FROM lim, generate_series(lim.ini, lim.fim, interval '1 day') g
  ),
  dias AS (
    SELECT dia FROM todos
     WHERE extract(isodow FROM dia) <= 5
        OR NOT EXISTS (SELECT 1 FROM todos t2 WHERE extract(isodow FROM t2.dia) <= 5)
  ),
  carga AS (
    SELECT tp.utilizador_id, dd.dia,
           sum(t.minutos_previstos::numeric / GREATEST(t.pessoas_previstas, 1) / nd.n) AS minutos,
           string_agg(DISTINCT o.codigo, ', ') AS obras
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra o ON o.id = t.obra_id AND o.estado IN ('planeada','em_curso')
      JOIN public.ops_obra_tarefa_pessoa tp ON tp.tarefa_id = t.id
      CROSS JOIN LATERAL (
        SELECT GREATEST(1, count(*)) AS n
          FROM generate_series(t.inicio_planeado, COALESCE(t.fim_planeado, t.inicio_planeado), interval '1 day') g
         WHERE extract(isodow FROM g) <= 5) nd
      JOIN dias dd ON dd.dia BETWEEN t.inicio_planeado AND COALESCE(t.fim_planeado, t.inicio_planeado)
     WHERE t.organization_id = _org
       AND t.estado IN ('por_fazer','em_curso','rejeitada')
       AND t.inicio_planeado IS NOT NULL
       AND (_excluir IS NULL OR t.id <> _excluir)
     GROUP BY tp.utilizador_id, dd.dia
  ),
  ordens AS (
    SELECT x.u AS utilizador_id, count(DISTINCT od.id) AS n, min(od.codigo) AS codigo
      FROM public.ops_ordem od
      CROSS JOIN LATERAL (
        SELECT od.responsavel_id AS u WHERE od.responsavel_id IS NOT NULL
        UNION
        SELECT op.utilizador_id FROM public.ops_ordem_pessoa op WHERE op.ordem_id = od.id) x
     WHERE od.organization_id = _org
       AND od.estado IN ('agendada','em_curso','pausada')
       AND od.agendada_para IS NOT NULL
       AND (od.agendada_para AT TIME ZONE 'Europe/Lisbon')::date IN (SELECT dia FROM dias)
     GROUP BY x.u
  ),
  indisp AS (
    SELECT i.utilizador_id, min(i.motivo) AS motivo
      FROM lim, public.ops_obra_indisponiveis_impl(_org, lim.ini, lim.fim) i
     GROUP BY i.utilizador_id
  ),
  cheios AS (
    SELECT c.utilizador_id, count(*) AS n, string_agg(DISTINCT c.obras, ', ') AS obras
      FROM carga c WHERE c.minutos >= 479.5
     GROUP BY c.utilizador_id
  )
  SELECT p.utilizador_id,
         COALESCE(u.name, 'Sem nome')::text,
         p.funcao::text,
         COALESCE((SELECT array_agg(us.skill_id ORDER BY k.nome)
                     FROM public.ops_utilizador_skill us
                     JOIN public.ops_skill k ON k.id = us.skill_id AND k.organization_id = _org
                    WHERE us.utilizador_id = p.utilizador_id), '{}'::uuid[]),
         nullif(btrim(p.zona_base), ''),
         COALESCE(round((SELECT sum(c.minutos) FROM carga c WHERE c.utilizador_id = p.utilizador_id)), 0)::integer,
         COALESCE(ch.n, 0)::integer,
         COALESCE(od.n, 0)::integer,
         (ch.utilizador_id IS NULL AND od.utilizador_id IS NULL AND ix.utilizador_id IS NULL),
         COALESCE(ix.motivo,
                  'agenda cheia: ' || ch.obras,
                  CASE WHEN od.utilizador_id IS NOT NULL THEN 'ordem ' || od.codigo END)
    FROM public.ops_utilizador_perfil p
    LEFT JOIN public.anew_users u ON u.id = p.utilizador_id
    LEFT JOIN cheios ch ON ch.utilizador_id = p.utilizador_id
    LEFT JOIN ordens od ON od.utilizador_id = p.utilizador_id
    LEFT JOIN indisp ix ON ix.utilizador_id = p.utilizador_id
   WHERE p.organization_id = _org AND p.ativo
   ORDER BY 9 DESC, 6, 2
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_pessoas_livres_impl(uuid, date, date, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_pessoas_livres_impl(uuid, date, date, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_planear_auto_impl(uuid, date, uuid[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_planear_auto_impl(_obra_id uuid, _desde date, _fixas uuid[] DEFAULT NULL::uuid[])
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org   uuid := (SELECT o.organization_id FROM public.ops_obra o WHERE o.id = _obra_id);
  d       date := public.ops_obra_somar_dias_uteis_org(v_org, _desde, 0);
  v_best  date;
  v_min   integer;
  n       integer;
  i       integer := 0;
  v_fixas uuid[] := COALESCE(_fixas, '{}');
BEGIN
  LOOP
    DELETE FROM public.ops_obra_tarefa_pessoa tp
     USING public.ops_obra_tarefa t
     WHERE t.id = tp.tarefa_id AND t.obra_id = _obra_id
       AND t.estado IN ('por_fazer','rejeitada')
       AND NOT (t.id = ANY (v_fixas))
       AND NOT EXISTS (SELECT 1 FROM public.ops_obra_registo r WHERE r.tarefa_id = t.id);
    PERFORM public.ops_obra_replanear_impl(_obra_id, d);
    PERFORM public.ops_obra_distribuir_impl(_obra_id);

    SELECT count(*) INTO n FROM public.ops_obra_tarefa t
     WHERE t.obra_id = _obra_id AND public.ops_obra_conflitos_impl(t.id) <> '[]'::jsonb;
    IF n = 0 THEN
      RETURN d;
    END IF;
    IF v_min IS NULL OR n < v_min THEN
      v_min := n;
      v_best := d;
    END IF;

    i := i + 1;
    EXIT WHEN i >= 40;
    d := public.ops_obra_somar_dias_uteis_org(v_org, d, 1);
  END LOOP;

  -- Nenhum dia sem choques: o que tem menos.
  DELETE FROM public.ops_obra_tarefa_pessoa tp
   USING public.ops_obra_tarefa t
   WHERE t.id = tp.tarefa_id AND t.obra_id = _obra_id
     AND t.estado IN ('por_fazer','rejeitada')
     AND NOT (t.id = ANY (v_fixas))
     AND NOT EXISTS (SELECT 1 FROM public.ops_obra_registo r WHERE r.tarefa_id = t.id);
  PERFORM public.ops_obra_replanear_impl(_obra_id, v_best);
  PERFORM public.ops_obra_distribuir_impl(_obra_id);
  RETURN v_best;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_planear_auto_impl(uuid, date, uuid[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_planear_auto_impl(uuid, date, uuid[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_pode_gerir_modelos(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_pode_gerir_modelos(_org uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.current_business_user_id();
BEGIN
  RETURN public.is_system_admin_user((SELECT auth.uid()))
    OR (public.ops_pode(_org, 'operations.checklists.manage')
        AND EXISTS (SELECT 1 FROM public.ops_utilizador_perfil p
                     WHERE p.organization_id = _org AND p.utilizador_id = v_user
                       AND p.ativo AND p.funcao IN ('admin','gestor')))
    OR EXISTS (SELECT 1 FROM public.anew_memberships m
                 JOIN public.anew_role_permissions rp
                   ON rp.role_id = m.role_id AND rp.permission_code = 'services.edit'
                WHERE m.user_id = v_user AND m.organization_id = _org AND m.status = 'active');
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_pode_gerir_modelos(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_pode_gerir_modelos(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_pode_gerir_modelos(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_pode_ver_modelos(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_pode_ver_modelos(_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.ops_pode(_org, 'operations.view') OR public.ops_obra_pode_gerir_modelos(_org)
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_pode_ver_modelos(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_pode_ver_modelos(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_pode_ver_modelos(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_replanear_impl(uuid, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_replanear_impl(_obra_id uuid, _inicio date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org     uuid;
  v_mpd     integer;
  v_cap     integer;
  v_livre   bigint[];       -- minuto em que cada vaga fica livre
  v_fimt    jsonb := '{}';  -- fim (minuto) de cada tarefa já planeada
  v_fase    integer := NULL;
  v_fase_ini bigint := 0;
  v_fase_fim bigint := 0;
  v_k       integer;
  v_dur     bigint;
  v_cedo    bigint;
  v_ini     bigint;
  v_fim     bigint;
  v_escolha integer[];
  v_best    integer;
  v_n       integer := 0;
  r         record;
  i         integer;
  j         integer;
BEGIN
  SELECT organization_id, minutos_por_dia INTO v_org, v_mpd FROM public.ops_obra WHERE id = _obra_id;

  SELECT LEAST(4, GREATEST(1, count(*)))::integer INTO v_cap
    FROM public.ops_utilizador_perfil
   WHERE organization_id = v_org AND ativo AND funcao IN ('tecnico','operador');
  v_livre := array_fill(0::bigint, ARRAY[v_cap]);

  FOR r IN
    SELECT t.id, f.ordem AS fase, t.depende_de, t.minutos_previstos AS min,
           LEAST(GREATEST(t.pessoas_previstas, 1), v_cap) AS k
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra_fase f ON f.id = t.fase_id
     WHERE t.obra_id = _obra_id
     ORDER BY f.ordem, t.ordem, t.criada_em
  LOOP
    IF v_fase IS DISTINCT FROM r.fase THEN
      v_fase := r.fase;
      v_fase_ini := v_fase_fim;
    END IF;

    v_k := r.k;
    v_dur := GREATEST(1, ceil(r.min::numeric / v_k))::bigint;
    v_cedo := GREATEST(v_fase_ini, COALESCE((v_fimt->>(r.depende_de::text))::bigint, 0));

    -- As k vagas que ficam livres mais cedo.
    v_escolha := '{}';
    FOR j IN 1..v_k LOOP
      v_best := NULL;
      FOR i IN 1..v_cap LOOP
        IF NOT (i = ANY (v_escolha)) AND (v_best IS NULL OR v_livre[i] < v_livre[v_best]) THEN
          v_best := i;
        END IF;
      END LOOP;
      v_escolha := v_escolha || v_best;
    END LOOP;

    v_ini := v_cedo;
    FOREACH i IN ARRAY v_escolha LOOP
      v_ini := GREATEST(v_ini, v_livre[i]);
    END LOOP;
    v_fim := v_ini + v_dur;
    FOREACH i IN ARRAY v_escolha LOOP
      v_livre[i] := v_fim;
    END LOOP;

    v_fimt := v_fimt || jsonb_build_object(r.id::text, v_fim);
    v_fase_fim := GREATEST(v_fase_fim, v_fim);

    UPDATE public.ops_obra_tarefa
       SET inicio_planeado = public.ops_obra_somar_dias_uteis(_inicio, (v_ini / v_mpd)::integer),
           fim_planeado    = public.ops_obra_somar_dias_uteis(_inicio, ((v_fim - 1) / v_mpd)::integer),
           atualizada_em   = now()
     WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;

  UPDATE public.ops_obra SET data_inicio_prevista = _inicio, atualizada_em = now()
   WHERE id = _obra_id;
  RETURN v_n;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_replanear_impl(uuid, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_replanear_impl(uuid, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_ritmo_aprender(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_ritmo_aprender(_tarefa uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t       record;
  st      record;
  niv     text;
  v_reais numeric[];
  v_qts   numeric[];
  v_fix0  numeric;
  v_pu0   numeric;
  r       record;
  ant     record;
  g_fix   numeric;
  g_pu    numeric;
  v_mud   integer := 0;
BEGIN
  SELECT * INTO t FROM public.ops_obra_tarefa WHERE id = _tarefa;
  IF NOT FOUND OR t.servico_tarefa_id IS NULL THEN
    RETURN 0;
  END IF;
  SELECT * INTO st FROM public.ops_obra_servico_tarefa WHERE id = t.servico_tarefa_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  g_fix := st.minutos_fixos;
  g_pu := st.minutos_por_unidade;

  -- Primeiro o geral; depois a combinação de fatores desta tarefa, se tiver.
  FOREACH niv IN ARRAY CASE WHEN COALESCE(t.fatores_chave, '') <> '' THEN ARRAY['', t.fatores_chave]
                            ELSE ARRAY[''] END LOOP
    v_fix0 := CASE WHEN niv = '' THEN st.minutos_fixos ELSE g_fix END;
    v_pu0 := CASE WHEN niv = '' THEN st.minutos_por_unidade ELSE g_pu END;

    SELECT array_agg(x.real ORDER BY x.id), array_agg(x.q ORDER BY x.id) INTO v_reais, v_qts
      FROM (SELECT o.id,
                   public.ops_obra_minutos_reais(o.id)
                   * CASE WHEN o.minutos_juntos > 0 AND o.minutos_previstos > o.minutos_juntos
                          THEN (o.minutos_previstos - o.minutos_juntos)::numeric / o.minutos_previstos
                          ELSE 1 END AS real,
                   COALESCE(o.medida_real, o.medida_qt, 0) AS q
              FROM public.ops_obra_tarefa o
             WHERE o.organization_id = t.organization_id
               AND o.servico_tarefa_id = st.id
               AND o.estado = 'validada'
               AND COALESCE(o.motivo_desvio, '') NOT IN ('material_em_falta','acesso_cliente')
               AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_atraso a
                                WHERE a.tarefa_id = o.id
                                  AND a.motivo IN ('material_em_falta','acesso_cliente','meteorologia'))
               AND (niv = '' OR o.fatores_chave = niv)) x;

    SELECT * INTO r FROM public.ops_obra_ritmo_calcular(v_fix0, v_pu0, st.medida, v_reais, v_qts);
    IF COALESCE(r.o_n, 0) > 0 THEN
      SELECT * INTO ant FROM public.ops_obra_ritmo WHERE servico_tarefa_id = st.id AND fatores_chave = niv;
      INSERT INTO public.ops_obra_ritmo (organization_id, servico_tarefa_id, fatores_chave, n,
                                         minutos_fixos, minutos_por_unidade, padrao_fixos, padrao_por_unidade, atualizado_em)
      VALUES (t.organization_id, st.id, niv, r.o_n, r.o_fix, r.o_pu, st.minutos_fixos, st.minutos_por_unidade, now())
      ON CONFLICT (servico_tarefa_id, fatores_chave) DO UPDATE
        SET n = EXCLUDED.n, minutos_fixos = EXCLUDED.minutos_fixos,
            minutos_por_unidade = EXCLUDED.minutos_por_unidade,
            padrao_fixos = EXCLUDED.padrao_fixos, padrao_por_unidade = EXCLUDED.padrao_por_unidade,
            atualizado_em = now();
      IF ant.servico_tarefa_id IS NULL OR ant.minutos_fixos <> r.o_fix OR ant.minutos_por_unidade <> r.o_pu THEN
        INSERT INTO public.ops_obra_ritmo_historico (organization_id, servico_tarefa_id, fatores_chave, tarefa_id, n,
                                                     antes_fixos, antes_por_unidade, depois_fixos, depois_por_unidade)
        VALUES (t.organization_id, st.id, niv, _tarefa, r.o_n, ant.minutos_fixos, ant.minutos_por_unidade, r.o_fix, r.o_pu);
        v_mud := v_mud + 1;
      END IF;
      IF niv = '' THEN
        g_fix := r.o_fix;
        g_pu := r.o_pu;
      END IF;
    END IF;
  END LOOP;
  RETURN v_mud;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_ritmo_aprender(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_ritmo_aprender(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_ritmo_calcular(numeric, numeric, text, numeric[], numeric[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_ritmo_calcular(_fix0 numeric, _pu0 numeric, _medida text, _reais numeric[], _qts numeric[], OUT o_fix numeric, OUT o_pu numeric, OUT o_n integer)
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  k      constant numeric := 3;
  n      integer := COALESCE(array_length(_reais, 1), 0);
  obs    numeric[] := '{}';
  qs     numeric[] := '{}';
  rs     numeric[] := '{}';
  med    numeric;
  i      integer;
  sq     numeric; sr numeric; sqq numeric; sqr numeric; mq numeric; mr numeric; b numeric; a numeric;
BEGIN
  o_fix := COALESCE(_fix0, 0);
  o_pu := COALESCE(_pu0, 0);
  o_n := 0;
  IF n = 0 THEN RETURN; END IF;

  IF _medida = 'fixo' OR o_pu = 0 THEN
    -- Só o fixo: cada tarefa é uma observação do tempo total.
    FOR i IN 1..n LOOP
      IF _reais[i] >= 5 THEN obs := obs || _reais[i]; END IF;
    END LOOP;
  ELSE
    FOR i IN 1..n LOOP
      IF _reais[i] >= 5 AND COALESCE(_qts[i], 0) > 0 THEN
        obs := obs || GREATEST(0, (_reais[i] - o_fix) / _qts[i]);
        qs := qs || _qts[i];
        rs := rs || _reais[i];
      END IF;
    END LOOP;
  END IF;
  n := COALESCE(array_length(obs, 1), 0);
  IF n = 0 THEN RETURN; END IF;

  -- Fora os absurdos (com 3+ observações).
  IF n >= 3 THEN
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) INTO med FROM unnest(obs) v;
    IF med > 0 THEN
      SELECT array_agg(o ORDER BY ord), array_agg(q ORDER BY ord), array_agg(r ORDER BY ord)
        INTO obs, qs, rs
        FROM unnest(obs, CASE WHEN cardinality(qs) = cardinality(obs) THEN qs ELSE array_fill(NULL::numeric, ARRAY[cardinality(obs)]) END,
                    CASE WHEN cardinality(rs) = cardinality(obs) THEN rs ELSE array_fill(NULL::numeric, ARRAY[cardinality(obs)]) END)
             WITH ORDINALITY AS u(o, q, r, ord)
       WHERE u.o <= 4 * med AND u.o >= med / 4;
      n := COALESCE(array_length(obs, 1), 0);
      IF n = 0 THEN RETURN; END IF;
    END IF;
  END IF;

  o_n := n;
  IF _medida = 'fixo' OR COALESCE(_pu0, 0) = 0 THEN
    o_fix := round((k * COALESCE(_fix0, 0) + (SELECT sum(v) FROM unnest(obs) v)) / (k + n), 2);
    RETURN;
  END IF;

  o_pu := round((k * COALESCE(_pu0, 0) + (SELECT sum(v) FROM unnest(obs) v)) / (k + n), 3);
  -- Tamanhos diferentes que cheguem: separar o fixo do variável.
  IF n >= 5 AND (SELECT max(v) FROM unnest(qs) v) >= 1.5 * (SELECT min(v) FROM unnest(qs) v) THEN
    SELECT avg(q), avg(r) INTO mq, mr FROM unnest(qs, rs) u(q, r);
    SELECT sum((q - mq) * (r - mr)), sum((q - mq) ^ 2) INTO sqr, sqq FROM unnest(qs, rs) u(q, r);
    IF sqq > 0 THEN
      b := GREATEST(0, sqr / sqq);
      a := GREATEST(0, mr - b * mq);
      o_fix := round((k * COALESCE(_fix0, 0) + n * a) / (k + n), 2);
      o_pu := round((k * COALESCE(_pu0, 0) + n * b) / (k + n), 3);
    END IF;
  END IF;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_ritmo_calcular(numeric, numeric, text, numeric[], numeric[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_ritmo_calcular(numeric, numeric, text, numeric[], numeric[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_ritmo_calcular(numeric, numeric, text, numeric[], numeric[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_rotulo_atraso(text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_rotulo_atraso(_motivo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _motivo
    WHEN 'secagem' THEN 'Secagem / cura'
    WHEN 'condicoes_edificio' THEN 'Condições do edifício'
    WHEN 'material_em_falta' THEN 'Material em falta'
    WHEN 'trabalho_imprevisto' THEN 'Trabalho imprevisto'
    WHEN 'acesso_cliente' THEN 'Acesso / cliente'
    WHEN 'meteorologia' THEN 'Meteorologia'
    WHEN 'equipa' THEN 'Equipa'
    ELSE 'Outro' END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_rotulo_atraso(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_rotulo_atraso(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_rotulo_atraso(text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_semear_exemplo_impl(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_semear_exemplo_impl(_org uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_modelo uuid;
  v_fase   uuid;
  f        record;
  t        record;
BEGIN
  SELECT id INTO v_modelo FROM public.ops_obra_modelo
   WHERE organization_id = _org AND nome = 'Remodelação casa de banho';
  IF v_modelo IS NOT NULL THEN
    RETURN v_modelo;
  END IF;

  INSERT INTO public.ops_obra_modelo (organization_id, nome, descricao, tipo_servico)
  VALUES (_org, 'Remodelação casa de banho',
          'Remodelação completa de uma casa de banho até 6 m²: demolição, redes novas, revestimentos e louças.',
          'remodelacao')
  RETURNING id INTO v_modelo;

  FOR f IN
    SELECT * FROM (VALUES
      (1, 'Preparação e demolições'),
      (2, 'Instalações técnicas'),
      (3, 'Acabamentos'),
      (4, 'Limpeza e entrega')) AS x(ordem, nome)
  LOOP
    INSERT INTO public.ops_obra_modelo_fase (organization_id, modelo_id, ordem, nome)
    VALUES (_org, v_modelo, f.ordem, f.nome)
    RETURNING id INTO v_fase;

    FOR t IN
      SELECT * FROM (VALUES
        (1, 1, 'Proteção de acessos e zonas comuns', 60,
         'Forrar chão do percurso com cartão e plástico; fita nos aros; avisar condomínio.',
         'Cartão canelado, plástico de proteção, fita de pintor', 'X-ato, fita métrica'),
        (1, 2, 'Desmontagem de louças, móveis e acessórios', 90,
         'Fechar água e cortar o circuito; desligar e retirar louças sem partir tubagem embutida; tamponar esgotos.',
         'Tampões de esgoto, sacos de entulho', 'Chaves de grifos, chave inglesa, berbequim'),
        (1, 3, 'Demolição de revestimentos (paredes e chão)', 300,
         'Picar azulejo e pavimento até ao reboco/betonilha; verificar tubagem antiga e registar extras se houver.',
         'Sacos de entulho, discos de corte', 'Martelo demolidor, rebarbadora, EPI (óculos, máscara FFP2)'),
        (1, 4, 'Remoção de entulho', 120,
         'Ensacar e descer por escada/elevador protegido; contentor ou saco big-bag.',
         'Big-bag, sacos de entulho', 'Carrinho de mão'),
        (2, 1, 'Canalização — redes de água e esgoto', 360,
         'Abrir roços, instalar multicamada/PPR e esgoto PVC conforme projeto; pendente mínima 1 %.',
         'Tubo multicamada 16/20, acessórios, PVC 40/50/110, abraçadeiras', 'Prensa de multicamada, serra de copo, nível'),
        (2, 2, 'Eletricidade — circuitos, tomadas e iluminação', 240,
         'Circuito dedicado com diferencial 30 mA; tomadas fora dos volumes 0–2; caixas estanques IP44.',
         'Tubo VD, cabo H07V-U 2,5 mm², caixas, aparelhagem IP44', 'Detetor de tensão, multímetro, roçadeira'),
        (2, 3, 'Impermeabilização da base de duche', 120,
         'Primário + membrana líquida em 2 demãos com banda nos cantos; respeitar tempo de secagem entre demãos.',
         'Membrana impermeabilizante, banda de reforço, primário', 'Trincha, rolo, espátula'),
        (2, 4, 'Ensaio de pressão e estanquidade', 60,
         'Pressurizar a rede a 10 bar durante 30 min; registar leitura inicial e final; testar esgoto com água.',
         'Fita de teflon', 'Bomba de ensaio com manómetro'),
        (3, 1, 'Regularização de paredes e betonilha', 240,
         'Fechar roços, regularizar paredes e fazer betonilha com pendente para o ralo. Secagem mínima 24 h.',
         'Argamassa de regularização, cimento-cola, malha de fibra', 'Talocha, régua de alumínio, misturador'),
        (3, 2, 'Assentamento do pavimento cerâmico', 300,
         'Cimento-cola C2 em dupla colagem; juntas de 2 mm com cunhas; verificar pendente para o ralo.',
         'Cerâmico, cimento-cola C2, cunhas niveladoras', 'Talocha dentada, cortador de cerâmico, nível'),
        (3, 3, 'Assentamento do revestimento de paredes', 420,
         'Arrancar da 2.ª fiada com régua de apoio; esquadria nas esquinas; recortes à volta das saídas de água.',
         'Azulejo, cimento-cola C2, perfis de esquina', 'Talocha dentada, cortador, rebarbadora com disco diamantado'),
        (3, 4, 'Betumação de juntas e silicone', 120,
         'Betume epóxi na zona de duche, cimentício no resto; silicone sanitário nas juntas de canto.',
         'Betume de juntas, silicone sanitário', 'Talocha de borracha, esponja, pistola de silicone'),
        (3, 5, 'Pintura do teto', 120,
         'Primário + 2 demãos de tinta anti-fungos; ventilar entre demãos.',
         'Tinta anti-fungos, primário', 'Rolo, trincha, escadote'),
        (4, 1, 'Montagem de louças, base de duche e torneiras', 240,
         'Fixar sanita e lavatório com bucha química; montar misturadoras; testar fugas com a rede em carga.',
         'Louças, misturadoras, flexíveis, bucha química', 'Berbequim, chave de grifos, nível'),
        (4, 2, 'Montagem de móvel, espelho e acessórios', 120,
         'Marcar alturas com o cliente; fixar móvel e espelho; acessórios a 1,10 m.',
         'Buchas, parafusos inox', 'Berbequim, nível laser'),
        (4, 3, 'Limpeza final', 90,
         'Retirar proteções, limpar restos de cimento-cola e betume; aspirar e lavar.',
         'Detergente desincrustante, panos', 'Aspirador de obra, balde'),
        (4, 4, 'Vistoria com o cliente e entrega', 45,
         'Percorrer a lista de verificação com o cliente; registar reparos; tirar fotografias finais.',
         NULL, 'Telemóvel (fotografias)')
      ) AS y(fase, ordem, nome, minutos, procedimento, materiais, ferramentas)
      WHERE y.fase = f.ordem
    LOOP
      INSERT INTO public.ops_obra_modelo_tarefa
        (organization_id, modelo_id, modelo_fase_id, ordem, nome, procedimento,
         materiais, ferramentas, minutos_previstos)
      VALUES (_org, v_modelo, v_fase, t.ordem, t.nome, t.procedimento,
              t.materiais, t.ferramentas, t.minutos);
    END LOOP;
  END LOOP;

  RETURN v_modelo;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_semear_exemplo_impl(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_semear_exemplo_impl(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_semear_tempos_padrao_impl(uuid, uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_semear_tempos_padrao_impl(_org uuid, _autor uuid, _substituir boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sem       jsonb := public.ops_obra_tempos_padrao();
  v_def       jsonb;
  v_nome      text;
  v_ids       uuid[];
  v_id        uuid;
  v_servicos  integer := 0;
  v_passos    integer := 0;
  v_saltados  text[] := '{}';
  v_faltam    text[] := '{}';
  p           jsonb;
  i           integer;
BEGIN
  IF to_regclass('public.services') IS NULL THEN
    RAISE EXCEPTION 'Esta base não tem o catálogo de serviços do CRM.';
  END IF;

  INSERT INTO public.ops_skill (organization_id, nome)
  SELECT _org, x FROM jsonb_array_elements_text(v_sem->'skills') x
  ON CONFLICT (organization_id, nome) DO NOTHING;

  -- Pacotes e extras: a mesma forma (passos), o pacote traz também o perfil.
  FOR v_def IN
    SELECT d || jsonb_build_object('_pacote', true) FROM jsonb_array_elements(v_sem->'pacotes') d
    UNION ALL
    SELECT d || jsonb_build_object('_pacote', false, 'servicos', jsonb_build_array(d->>'servico'))
      FROM jsonb_array_elements(v_sem->'extras') d
  LOOP
    FOR v_nome IN SELECT jsonb_array_elements_text(v_def->'servicos') LOOP
      EXECUTE 'SELECT COALESCE(array_agg(s.id), ''{}'') FROM public.services s
                WHERE btrim(s.name) = btrim($2)
                  AND NOT COALESCE(s.is_deleted, false) AND s.deleted_at IS NULL
                  AND (s.organization_id = $1'
        || CASE WHEN to_regclass('public.service_organizations') IS NOT NULL
                THEN ' OR EXISTS (SELECT 1 FROM public.service_organizations so
                                   WHERE so.service_id = s.id AND so.organization_id = $1)'
                ELSE '' END
        || ')'
        INTO v_ids USING _org, v_nome;
      IF cardinality(v_ids) = 0 THEN
        v_faltam := v_faltam || v_nome;
        CONTINUE;
      END IF;

      FOREACH v_id IN ARRAY v_ids LOOP
        IF NOT _substituir AND EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa
                                        WHERE organization_id = _org AND servico_id = v_id AND origem = 'manual') THEN
          v_saltados := v_saltados || v_nome;
          CONTINUE;
        END IF;

        INSERT INTO public.ops_obra_servico_perfil (organization_id, servico_id, tipo, medidas, planear, medida_para,
                                                    atualizado_em, atualizado_por)
        VALUES (_org, v_id,
                CASE WHEN (v_def->>'_pacote')::boolean THEN v_def->>'tipo' END,
                COALESCE(CASE WHEN (v_def->>'_pacote')::boolean THEN v_def->'medidas' END, '{}'::jsonb),
                true, NULL, now(), _autor)
        ON CONFLICT (organization_id, servico_id) DO UPDATE
          SET tipo = EXCLUDED.tipo, medidas = EXCLUDED.medidas, planear = true, medida_para = NULL,
              atualizado_em = now(), atualizado_por = _autor;

        DELETE FROM public.ops_obra_servico_tarefa WHERE organization_id = _org AND servico_id = v_id;
        i := 0;
        FOR p IN SELECT x FROM jsonb_array_elements(v_def->'passos') x LOOP
          i := i + 1;
          INSERT INTO public.ops_obra_servico_tarefa (
            organization_id, servico_id, ordem, nome, fase, minutos_por_unidade, minutos_fixos, pessoas,
            skill_id, depende_ordem, origem, atualizado_por,
            chave, depende_chaves, espera_antes_horas, medida, condicao, encaixe, fatores)
          VALUES (
            _org, v_id, i, p->>'nome', (p->>'fase')::smallint,
            (p->>'por_unidade')::numeric,
            (p->>'fixos')::integer,
            (p->>'pessoas')::smallint,
            (SELECT k.id FROM public.ops_skill k WHERE k.organization_id = _org AND k.nome = p->>'skill'),
            NULL, 'padrao', _autor,
            p->>'chave',
            ARRAY(SELECT jsonb_array_elements_text(p->'depende')),
            (p->>'espera')::numeric,
            CASE WHEN (p->>'medida') = 'fixo' OR ((p->>'por_unidade')::numeric = 0 AND (p->>'medida') <> 'qt')
                 THEN 'fixo' ELSE p->>'medida' END,
            -- Condição: os nomes dos serviços passam a ids desta organização.
            CASE WHEN jsonb_typeof(p->'condicao') = 'object' THEN
              jsonb_strip_nulls(jsonb_build_object(
                'servicos', public.ops_obra_ids_de_servicos(_org, p->'condicao'->'servicos'),
                'ficha', p->'condicao'->'ficha')) END,
            nullif(p->'encaixe', 'null'::jsonb),
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(p->'fatores', '[]'::jsonb))));
          v_passos := v_passos + 1;
        END LOOP;
        v_servicos := v_servicos + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  -- O que não é trabalho no local, e o que só dá medidas ao pacote.
  FOR v_def IN
    SELECT jsonb_build_object('servico', x, 'planear', false) FROM jsonb_array_elements_text(v_sem->'sem_planear') x
    UNION ALL
    SELECT jsonb_build_object('servico', x->>'servico', 'planear', true, 'medida_para', x->>'medida')
      FROM jsonb_array_elements(v_sem->'medida_para') x
  LOOP
    FOREACH v_id IN ARRAY public.ops_obra_ids_de_servicos(_org, jsonb_build_array(v_def->>'servico')) LOOP
      INSERT INTO public.ops_obra_servico_perfil (organization_id, servico_id, planear, medida_para, atualizado_em, atualizado_por)
      VALUES (_org, v_id, (v_def->>'planear')::boolean, v_def->>'medida_para', now(), _autor)
      ON CONFLICT (organization_id, servico_id) DO UPDATE
        SET planear = EXCLUDED.planear, medida_para = EXCLUDED.medida_para, tipo = NULL,
            atualizado_em = now(), atualizado_por = _autor;
      DELETE FROM public.ops_obra_servico_tarefa
       WHERE organization_id = _org AND servico_id = v_id AND origem <> 'manual';
      v_servicos := v_servicos + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'versao', v_sem->>'versao', 'servicos', v_servicos, 'passos', v_passos,
                            'saltados', to_jsonb(v_saltados), 'nao_encontrados', to_jsonb(v_faltam));
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_semear_tempos_padrao_impl(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_semear_tempos_padrao_impl(uuid, uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_semear_tipo_geral_impl(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_semear_tipo_geral_impl(_org uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_f  uuid;
BEGIN
  SELECT id INTO v_id FROM public.ops_obra_modelo WHERE organization_id = _org AND por_defeito;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  SELECT id INTO v_id FROM public.ops_obra_modelo WHERE organization_id = _org AND nome = 'Obra geral';
  IF v_id IS NOT NULL THEN
    UPDATE public.ops_obra_modelo SET por_defeito = true, atualizado_em = now() WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.ops_obra_modelo (organization_id, nome, descricao, tipo_servico, por_defeito)
  VALUES (_org, 'Obra geral',
          'O que existe em qualquer obra. Os serviços do contrato juntam-se a estas tarefas.',
          'geral', true)
  RETURNING id INTO v_id;

  INSERT INTO public.ops_obra_modelo_fase (organization_id, modelo_id, ordem, nome)
  VALUES (_org, v_id, 1, 'Preparação e demolições'), (_org, v_id, 2, 'Instalações técnicas'),
         (_org, v_id, 3, 'Acabamentos'), (_org, v_id, 4, 'Limpeza e entrega');

  SELECT id INTO v_f FROM public.ops_obra_modelo_fase WHERE modelo_id = v_id AND ordem = 1;
  INSERT INTO public.ops_obra_modelo_tarefa (organization_id, modelo_id, modelo_fase_id, ordem, nome, procedimento, minutos_previstos)
  VALUES (_org, v_id, v_f, 1, 'Reunião de arranque com o cliente', 'Confirmar acessos, horários, zonas a proteger e contactos.', 30),
         (_org, v_id, v_f, 2, 'Proteger acessos e zonas comuns', 'Cartão/plástico no chão, fita nas portas, proteção de elevador.', 60);
  SELECT id INTO v_f FROM public.ops_obra_modelo_fase WHERE modelo_id = v_id AND ordem = 4;
  INSERT INTO public.ops_obra_modelo_tarefa (organization_id, modelo_id, modelo_fase_id, ordem, nome, procedimento, minutos_previstos)
  VALUES (_org, v_id, v_f, 1, 'Limpeza final', 'Retirar proteções, aspirar, lavar superfícies.', 120),
         (_org, v_id, v_f, 2, 'Vistoria e entrega ao cliente', 'Percorrer a obra com o cliente, anotar remates, recolher assinatura.', 60);
  RETURN v_id;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_semear_tipo_geral_impl(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_semear_tipo_geral_impl(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_servico_da_org(uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_servico_da_org(_org uuid, _servico uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v boolean;
BEGIN
  IF to_regclass('public.services') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.services s WHERE s.id = $2
             AND NOT COALESCE(s.is_deleted, false) AND s.deleted_at IS NULL
             AND (s.organization_id = $1'
       || CASE WHEN to_regclass('public.service_organizations') IS NOT NULL
               THEN ' OR EXISTS (SELECT 1 FROM public.service_organizations so
                                  WHERE so.service_id = s.id AND so.organization_id = $1)'
               ELSE '' END
       || '))'
    INTO v USING _org, _servico;
  RETURN v;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_servico_da_org(uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_servico_da_org(uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_servico_sugerir_impl(uuid, uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_servico_sugerir_impl(_org uuid, _servico uuid, _autor uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_s      record;
  v_chave  text;
  v_fam    jsonb;
  v_fase   smallint;
  v_total  numeric;
  v_ficha_pessoas integer;
  v_skill  uuid;
  v_mats   text;
  v_maxp   numeric;
  v_n      integer := 0;
  t        jsonb;
  i        integer;
BEGIN
  EXECUTE 'SELECT s.name, c.name AS categoria, s.technical_sheet_labor_hours AS horas,
                  s.technical_sheet_labor_people_count AS pessoas,
                  nullif(btrim(s.technical_sheet_labor_description), '''') AS descricao
             FROM public.services s LEFT JOIN public.service_categories c ON c.id = s.service_category_id
            WHERE s.id = $1'
     INTO v_s USING _servico;
  IF v_s.name IS NULL THEN
    RETURN 0;
  END IF;

  v_chave := lower(concat_ws(' ', v_s.categoria, v_s.name));
  SELECT f INTO v_fam
    FROM jsonb_array_elements(public.ops_obra_biblioteca()) WITH ORDINALITY AS x(f, pos)
   WHERE v_chave ~ (f->>'re')
   ORDER BY pos LIMIT 1;

  IF v_fam IS NULL THEN
    -- Genérico: preparar / executar / arrumar, na fase que o nome sugere.
    v_fase := CASE
      WHEN v_chave ~ '(demol|prepara|remoç|remoc|retirad|desmont|proteç|protec|estaleiro)' THEN 1
      WHEN v_chave ~ '(instalaç|instalac|tubag|rede |gás|gas )' THEN 2
      WHEN v_chave ~ '(limpez|entrega)' THEN 4
      ELSE 3 END;
    v_fam := jsonb_build_object('familia', 'Genérico', 'skill', NULL, 'mu', 60, 't', jsonb_build_array(
      jsonb_build_object('n', 'Preparar', 'fase', v_fase, 'x', 15, 'p', 0.1, 'k', 1),
      jsonb_build_object('n', 'Executar', 'fase', v_fase, 'p', 0.8, 'k', NULL, 'd', 1),
      jsonb_build_object('n', 'Arrumar e limpar', 'fase', v_fase, 'p', 0.1, 'k', 1, 'd', 2)));
  END IF;

  v_ficha_pessoas := GREATEST(1, COALESCE(round(v_s.pessoas), 1))::integer;
  v_total := CASE WHEN COALESCE(v_s.horas, 0) > 0
                  THEN v_s.horas * v_ficha_pessoas * 60
                  ELSE (v_fam->>'mu')::numeric END;

  IF v_fam->>'skill' IS NOT NULL THEN
    INSERT INTO public.ops_skill (organization_id, nome) VALUES (_org, v_fam->>'skill')
    ON CONFLICT (organization_id, nome) DO NOTHING;
    SELECT id INTO v_skill FROM public.ops_skill WHERE organization_id = _org AND nome = v_fam->>'skill';
  END IF;

  -- Materiais da ficha, por unidade, no passo principal (o de maior fração).
  EXECUTE 'SELECT string_agg(p.name || '' × '' || trim_scale(round(sm.quantity::numeric, 2))::text || '' /un'',
                             ''; '' ORDER BY sm.sort_order NULLS LAST, p.name)
             FROM public.service_materials sm JOIN public.products p ON p.id = sm.product_id
            WHERE sm.service_id = $1 AND sm.deleted_at IS NULL'
     INTO v_mats USING _servico;
  SELECT max(COALESCE((x->>'p')::numeric, 0)) INTO v_maxp FROM jsonb_array_elements(v_fam->'t') x;

  DELETE FROM public.ops_obra_servico_tarefa WHERE organization_id = _org AND servico_id = _servico;

  i := 0;
  FOR t IN SELECT x FROM jsonb_array_elements(v_fam->'t') x LOOP
    i := i + 1;
    INSERT INTO public.ops_obra_servico_tarefa (
      organization_id, servico_id, ordem, nome, fase, minutos_por_unidade, minutos_fixos,
      pessoas, skill_id, depende_ordem, procedimento, materiais, origem, atualizado_por)
    VALUES (
      _org, _servico, i, t->>'n', (t->>'fase')::smallint,
      round(v_total * COALESCE((t->>'p')::numeric, 0), 2),
      COALESCE((t->>'x')::integer, 0),
      -- k da biblioteca; sem k, as pessoas da ficha.
      LEAST(20, COALESCE((t->>'k')::integer, v_ficha_pessoas)),
      v_skill,
      (t->>'d')::integer,
      CASE WHEN COALESCE((t->>'p')::numeric, 0) = v_maxp THEN v_s.descricao END,
      CASE WHEN COALESCE((t->>'p')::numeric, 0) = v_maxp THEN v_mats END,
      'sugerida', _autor);
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_servico_sugerir_impl(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_servico_sugerir_impl(uuid, uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_sincronizar_avisos(uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_sincronizar_avisos(_org uuid DEFAULT NULL::uuid, _obra uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org    uuid;
  v_a      record;
  v_p      uuid;
  v_com    uuid[];
  v_novos  integer := 0;
  v_resolv integer := 0;
  v_banc   integer := 0;
  v_ob     uuid;
  v_r      text;
BEGIN
  FOR v_org IN
    SELECT DISTINCT o.organization_id FROM public.ops_obra o
     WHERE (_org IS NULL OR o.organization_id = _org)
       AND (_obra IS NULL OR o.id = _obra)
  LOOP
    v_com := '{}';
    IF to_regclass('public.notifications') IS NOT NULL THEN
      FOR v_a IN
        SELECT a.obra_id, max(a.obra_codigo) AS codigo, max(a.obra_titulo) AS titulo,
               min(a.gravidade) AS gravidade, count(*)::int AS n,
               array_agg(a.tipo || ':' || COALESCE(a.tarefa_id, a.atraso_id)::text) AS chaves,
               concat_ws(' · ',
                 NULLIF(count(*) FILTER (WHERE a.tipo = 'fim_ultrapassado'), 0)::text || ' fora do prazo',
                 NULLIF(count(*) FILTER (WHERE a.tipo = 'nao_iniciada'), 0)::text || ' por começar',
                 NULLIF(count(*) FILTER (WHERE a.tipo = 'material_tarde'), 0)::text || ' com material tarde',
                 NULLIF(count(*) FILTER (WHERE a.tipo = 'cliente_por_avisar'), 0)::text || ' cliente por avisar') AS resumo,
               (array_agg(a.tarefa_nome || ' — ' || a.detalhe ORDER BY a.gravidade, a.minutos_atraso DESC NULLS LAST))[1] AS pior
          FROM public.ops_obra_alertas_lista(v_org, _obra) a
         GROUP BY a.obra_id
      LOOP
        v_com := v_com || v_a.obra_id;
        FOREACH v_p IN ARRAY public.ops_obra_coordenacao(v_a.obra_id) LOOP
          v_r := public.ops_obra_notificar(v_org, v_p, 'operacoes_obra_alertas', v_a.obra_id,
            v_a.codigo || ': ' || v_a.n || CASE WHEN v_a.n = 1 THEN ' alerta' ELSE ' alertas' END,
            COALESCE(v_a.titulo, 'Obra') || '. ' || v_a.resumo || '. ' || v_a.pior,
            '/operacao/obras/' || v_a.codigo,
            CASE WHEN v_a.gravidade = 1 THEN 'high' ELSE 'medium' END,
            v_a.chaves, jsonb_build_object('codigo', v_a.codigo));
          IF v_r IN ('novo','de_novo') THEN v_novos := v_novos + 1; END IF;
        END LOOP;
      END LOOP;
      v_resolv := v_resolv + public.ops_obra_notificacoes_resolver(v_org, 'operacoes_obra_alertas', v_com, _obra, 'alertas_resolvidos');
    END IF;

    FOR v_ob IN
      SELECT o.id FROM public.ops_obra o
       WHERE o.organization_id = v_org AND (_obra IS NULL OR o.id = _obra)
         AND o.estado IN ('planeada','em_curso')
    LOOP
      IF (public.ops_obra_avisar_bancada(v_ob)->>'novo')::boolean THEN v_banc := v_banc + 1; END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('alertas_novos', v_novos, 'resolvidos', v_resolv, 'bancadas', v_banc);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_sincronizar_avisos(uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_sincronizar_avisos(uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_somar_dias_uteis(date, integer)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_somar_dias_uteis(_d date, _n integer)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v date := _d;
  k integer := 0;
BEGIN
  WHILE extract(isodow FROM v) > 5 LOOP v := v + 1; END LOOP;
  WHILE k < GREATEST(_n, 0) LOOP
    v := v + 1;
    IF extract(isodow FROM v) <= 5 THEN k := k + 1; END IF;
  END LOOP;
  RETURN v;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_somar_dias_uteis(date, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_somar_dias_uteis(date, integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_somar_dias_uteis(date, integer) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_somar_dias_uteis_org(uuid, date, integer)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_somar_dias_uteis_org(_org uuid, _d date, _n integer)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (public.ops_obra_dias_uteis_lista(_org, _d, GREATEST(_n, 0) + 1))[GREATEST(_n, 0) + 1]
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_somar_dias_uteis_org(uuid, date, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_somar_dias_uteis_org(uuid, date, integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_somar_dias_uteis_org(uuid, date, integer) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_tarefa_baseline()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_tarefa_baseline()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.inicio_original IS NOT NULL OR OLD.fim_original IS NOT NULL THEN
    NEW.inicio_original := OLD.inicio_original;
    NEW.fim_original := OLD.fim_original;
  ELSIF NEW.inicio_original IS NULL AND NEW.fim_original IS NULL
    AND (NEW.inicio_planeado IS DISTINCT FROM OLD.inicio_planeado
         OR NEW.fim_planeado IS DISTINCT FROM OLD.fim_planeado)
    AND (OLD.inicio_planeado IS NOT NULL OR OLD.fim_planeado IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.ops_obra o WHERE o.id = NEW.obra_id AND o.estado = 'em_curso') THEN
    NEW.inicio_original := OLD.inicio_planeado;
    NEW.fim_original := OLD.fim_planeado;
  END IF;
  RETURN NEW;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_tarefa_baseline() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_tarefa_baseline() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_tarefa_dep_sync()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_tarefa_dep_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.depende_de IS NOT NULL AND OLD.depende_de IS DISTINCT FROM NEW.depende_de THEN
      DELETE FROM public.ops_obra_tarefa_dependencia
       WHERE tarefa_id = NEW.id AND depende_de_id = OLD.depende_de;
    END IF;
  END IF;
  IF NEW.depende_de IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_obra_tarefa_dependencia
        WHERE tarefa_id = NEW.id AND depende_de_id = NEW.depende_de) THEN
    INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
    VALUES (NEW.id, NEW.depende_de, NEW.organization_id, NEW.obra_id);
  END IF;
  RETURN NULL;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_tarefa_dep_sync() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_tarefa_dep_sync() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_tarefas_do_orcamento(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_tarefas_do_orcamento(_orc uuid)
 RETURNS TABLE(fase smallint, ordem integer, nome text, procedimento text, materiais text, ferramentas text, minutos integer, pessoas smallint, skill_id uuid, sem_ficha boolean, com_modelo boolean, orcamento_linha_id uuid, servico_id uuid, servico_tarefa_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_org   uuid;
  v_ordem integer := 0;
  l       record;
  st      record;
BEGIN
  IF _orc IS NULL
     OR to_regclass('public.services') IS NULL
     OR to_regclass('public.service_categories') IS NULL
     OR to_regclass('public.service_materials') IS NULL
     OR to_regclass('public.products') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'quote_lines'
                       AND column_name = 'service_id') THEN
    RETURN;
  END IF;

  SELECT q.organization_id INTO v_org FROM public.quotes q WHERE q.id = _orc;

  -- Dinâmico para o ficheiro instalar numa base sem as tabelas de serviços.
  FOR l IN EXECUTE $q$
    SELECT l.id, COALESCE(l.qt, 1) AS qt, l.service_id,
           COALESCE(nullif(btrim(s.name), ''), nullif(btrim(l.descricao_snapshot), ''), 'Serviço') AS nome,
           nullif(btrim(s.technical_sheet_labor_description), '') AS proc,
           s.technical_sheet_labor_hours AS horas,
           s.technical_sheet_labor_people_count AS pessoas,
           (CASE
              WHEN lower(concat_ws(' ', c.name, s.name, l.section_name)) ~ '(demol|prepara|remoç|remoc|retirad|desmont|proteç|protec|estaleiro)' THEN 1
              WHEN lower(concat_ws(' ', c.name, s.name, l.section_name)) ~ '(eletric|elétric|electric|canaliz|água|agua|esgot|gás|gas |avac|climatiz|ar condicionado|instalaç|instalac|tubag|quadro|rede )' THEN 2
              WHEN lower(concat_ws(' ', c.name, s.name, l.section_name)) ~ '(limpez|entrega)' THEN 4
              ELSE 3
            END)::smallint AS fase,
           (SELECT string_agg(p.name || ' × ' || trim_scale(round((sm.quantity * COALESCE(l.qt, 1))::numeric, 2))::text,
                              '; ' ORDER BY sm.sort_order NULLS LAST, p.name)
              FROM public.service_materials sm
              JOIN public.products p ON p.id = sm.product_id
             WHERE sm.service_id = l.service_id AND sm.deleted_at IS NULL) AS materiais
      FROM public.quote_lines l
      JOIN public.services s ON s.id = l.service_id
      LEFT JOIN public.service_categories c ON c.id = s.service_category_id
     WHERE l.quote_id = $1
     ORDER BY l.ordem NULLS LAST, l.id
  $q$ USING _orc
  LOOP
    IF EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa x
                WHERE x.organization_id = v_org AND x.servico_id = l.service_id) THEN
      -- O serviço tem modelo: uma tarefa por passo, tempo × quantidade.
      FOR st IN
        SELECT x.* FROM public.ops_obra_servico_tarefa x
         WHERE x.organization_id = v_org AND x.servico_id = l.service_id
         ORDER BY x.ordem
      LOOP
        v_ordem := v_ordem + 1;
        fase := st.fase;
        ordem := v_ordem;
        nome := l.nome || ': ' || st.nome;
        procedimento := st.procedimento;
        materiais := st.materiais;
        ferramentas := st.ferramentas;
        minutos := GREATEST(1, round(st.minutos_fixos + st.minutos_por_unidade * l.qt))::integer;
        pessoas := st.pessoas;
        skill_id := st.skill_id;
        sem_ficha := false;
        com_modelo := true;
        orcamento_linha_id := l.id;
        servico_id := l.service_id;
        servico_tarefa_id := st.id;
        RETURN NEXT;
      END LOOP;
    ELSE
      -- Sem modelo: uma tarefa só, com o tempo da ficha técnica
      -- (qt × horas × pessoas; sem horas → 60 min e `sem_ficha`).
      v_ordem := v_ordem + 1;
      fase := l.fase;
      ordem := v_ordem;
      nome := l.nome;
      procedimento := l.proc;
      materiais := l.materiais;
      ferramentas := NULL;
      minutos := (CASE WHEN COALESCE(l.horas, 0) > 0
                       THEN GREATEST(1, round(60 * l.qt * l.horas * COALESCE(nullif(l.pessoas, 0), 1)))
                       ELSE 60 END)::integer;
      pessoas := LEAST(20, GREATEST(1, COALESCE(round(l.pessoas), 1)))::smallint;
      skill_id := NULL;
      sem_ficha := COALESCE(l.horas, 0) <= 0;
      com_modelo := false;
      orcamento_linha_id := l.id;
      servico_id := l.service_id;
      servico_tarefa_id := NULL;
      RETURN NEXT;
    END IF;
  END LOOP;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_tarefas_do_orcamento(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_tarefas_do_orcamento(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_tempos_padrao()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_tempos_padrao()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT '{"versao":"2026-10-03","skills":["Logística","Gás (ITG)","Marmorista","Demolições","Canalização","Eletricidade","Revestimentos","Pintura","Carpintaria"],"pacotes":[{"servicos":["MO Modelo Remodelação Completa - Casa de Banho Comum","MO Modelo Remodelação Completa - Casa de Banho Social"],"tipo":"casa_banho","medidas":{"m2_pavimento":4,"m2_parede":18,"m2_total":22,"pontos_agua":5,"pontos_eletricos":6,"pecas_sanitarias":4,"acessorios":6},"passos":[{"chave":"1.1","nome":"Isolamento e proteção da área","fase":1,"skill":null,"depende":[],"espera":0,"medida":"fixo","fixos":120,"por_unidade":0,"pessoas":1,"fatores":["habitada","mobilada","distancia"],"condicao":null},{"chave":"1.2","nome":"Desligar redes e desmontar louças, móveis e acessórios","fase":1,"skill":"Demolições","depende":["1.1"],"espera":0,"medida":"pecas_sanitarias","fixos":60,"por_unidade":30,"pessoas":1,"fatores":["habitada"],"condicao":null},{"chave":"1.3","nome":"Demolição de revestimentos, pavimentos, paredes e tetos","fase":1,"skill":"Demolições","depende":["1.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":36,"pessoas":2,"fatores":["acesso"],"condicao":null},{"chave":"1.4","nome":"Retirada de entulho e limpeza","fase":1,"skill":null,"depende":["1.3"],"espera":0,"medida":"m2_total","fixos":60,"por_unidade":9,"pessoas":1,"fatores":["acesso","andar","distancia","elevador"],"condicao":null},{"chave":"1.5","nome":"Levantamento de materiais em armazém","fase":1,"skill":"Logística","depende":[],"espera":0,"medida":"fixo","fixos":180,"por_unidade":0,"pessoas":1,"fatores":["acesso","andar","elevador"],"condicao":null},{"chave":"2.1","nome":"Canalização (água e esgotos)","fase":2,"skill":"Canalização","depende":["1.4","1.5"],"espera":0,"medida":"pontos_agua","fixos":360,"por_unidade":240,"pessoas":1,"fatores":[],"condicao":null},{"chave":"2.2","nome":"Instalação elétrica (iluminação, tomadas, ventilação)","fase":2,"skill":"Eletricidade","depende":["1.4","1.5"],"espera":0,"medida":"pontos_eletricos","fixos":180,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null},{"chave":"2.3","nome":"Preparação para aquecimento (toalheiro elétrico)","fase":2,"skill":"Eletricidade","depende":["2.2"],"espera":0,"medida":"fixo","fixos":120,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":{"servicos":["Instalação de Toalheiros Eletricos"],"ficha":{"campo":"toalheiro","valores":["true"]}}},{"chave":"2.4","nome":"Ensaios (água, esgotos, elétrico) e fecho de roços","fase":2,"skill":"Canalização","depende":["2.1","2.2","2.3"],"espera":0,"medida":"fixo","fixos":360,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.1","nome":"Regularização do pavimento (betonilha)","fase":3,"skill":"Revestimentos","depende":["2.4"],"espera":0,"medida":"m2_pavimento","fixos":120,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.2","nome":"Impermeabilização de paredes e pavimento","fase":3,"skill":"Revestimentos","depende":["3.1"],"espera":48,"medida":"m2_total","fixos":60,"por_unidade":18,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.3","nome":"Assentamento de azulejo e mosaico","fase":3,"skill":"Revestimentos","depende":["3.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":60,"pessoas":2,"fatores":["altura_revestimento","janela","local_cortes"],"condicao":null},{"chave":"3.4","nome":"Betumação de juntas e limpeza","fase":3,"skill":"Revestimentos","depende":["3.3"],"espera":24,"medida":"m2_total","fixos":60,"por_unidade":12,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.5","nome":"Teto falso, pintura do teto, sancas e rodapés","fase":3,"skill":"Pintura","depende":["2.4"],"espera":0,"medida":"m2_pavimento","fixos":240,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.1","nome":"Montagem de louças sanitárias","fase":4,"skill":"Canalização","depende":["3.4","3.5"],"espera":24,"medida":"pecas_sanitarias","fixos":120,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.2","nome":"Torneiras, acessórios, espelhos e mobiliário","fase":4,"skill":"Carpintaria","depende":["4.1"],"espera":0,"medida":"acessorios","fixos":120,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.3","nome":"Ligação de equipamentos elétricos (iluminação, ventilação)","fase":4,"skill":"Eletricidade","depende":["3.4","3.5"],"espera":24,"medida":"pontos_eletricos","fixos":60,"por_unidade":30,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.4","nome":"Selagens, retoques, limpeza final e entrega","fase":4,"skill":null,"depende":["4.2","4.3"],"espera":0,"medida":"m2_total","fixos":240,"por_unidade":6,"pessoas":1,"fatores":["habitada","mobilada"],"condicao":null}]},{"servicos":["MO Modelo 0 - Casa de Banho: Remoção de Poliban até 100x100 + Revestimento até 20cm"],"tipo":"casa_banho","medidas":{"m2_pavimento":1,"m2_parede":0.6,"m2_total":1.6,"pontos_agua":1,"pontos_eletricos":0,"pecas_sanitarias":1,"acessorios":2},"passos":[{"chave":"1.1","nome":"Isolamento e proteção da área","fase":1,"skill":null,"depende":[],"espera":0,"medida":"fixo","fixos":120,"por_unidade":0,"pessoas":1,"fatores":["habitada","mobilada","distancia"],"condicao":null},{"chave":"1.2","nome":"Desligar redes e desmontar louças, móveis e acessórios","fase":1,"skill":"Demolições","depende":["1.1"],"espera":0,"medida":"pecas_sanitarias","fixos":60,"por_unidade":30,"pessoas":1,"fatores":["habitada"],"condicao":null},{"chave":"1.3","nome":"Demolição de revestimentos, pavimentos, paredes e tetos","fase":1,"skill":"Demolições","depende":["1.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":36,"pessoas":2,"fatores":["acesso"],"condicao":null},{"chave":"1.4","nome":"Retirada de entulho e limpeza","fase":1,"skill":null,"depende":["1.3"],"espera":0,"medida":"m2_total","fixos":60,"por_unidade":9,"pessoas":1,"fatores":["acesso","andar","distancia","elevador"],"condicao":null},{"chave":"1.5","nome":"Levantamento de materiais em armazém","fase":1,"skill":"Logística","depende":[],"espera":0,"medida":"fixo","fixos":180,"por_unidade":0,"pessoas":1,"fatores":["acesso","andar","elevador"],"condicao":null},{"chave":"3.1","nome":"Regularização do pavimento (betonilha)","fase":3,"skill":"Revestimentos","depende":["1.4","1.5"],"espera":0,"medida":"m2_pavimento","fixos":120,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.2","nome":"Impermeabilização de paredes e pavimento","fase":3,"skill":"Revestimentos","depende":["3.1"],"espera":48,"medida":"m2_total","fixos":60,"por_unidade":18,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.3","nome":"Assentamento de azulejo e mosaico","fase":3,"skill":"Revestimentos","depende":["3.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":60,"pessoas":2,"fatores":["altura_revestimento","janela","local_cortes"],"condicao":null},{"chave":"3.4","nome":"Betumação de juntas e limpeza","fase":3,"skill":"Revestimentos","depende":["3.3"],"espera":24,"medida":"m2_total","fixos":60,"por_unidade":12,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.1","nome":"Montagem de louças sanitárias","fase":4,"skill":"Canalização","depende":["3.4","1.4","1.5"],"espera":0,"medida":"pecas_sanitarias","fixos":120,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.2","nome":"Torneiras, acessórios, espelhos e mobiliário","fase":4,"skill":"Carpintaria","depende":["4.1"],"espera":0,"medida":"acessorios","fixos":120,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.4","nome":"Selagens, retoques, limpeza final e entrega","fase":4,"skill":null,"depende":["4.2","3.4","1.4","1.5"],"espera":0,"medida":"m2_total","fixos":240,"por_unidade":6,"pessoas":1,"fatores":["habitada","mobilada"],"condicao":null}]},{"servicos":["MO Modelo 1 - Casa de Banho: Remoção de Banheira ou Poliban  + Revestimento até 60cm"],"tipo":"casa_banho","medidas":{"m2_pavimento":1,"m2_parede":1.8,"m2_total":2.8,"pontos_agua":1,"pontos_eletricos":0,"pecas_sanitarias":1,"acessorios":2},"passos":[{"chave":"1.1","nome":"Isolamento e proteção da área","fase":1,"skill":null,"depende":[],"espera":0,"medida":"fixo","fixos":120,"por_unidade":0,"pessoas":1,"fatores":["habitada","mobilada","distancia"],"condicao":null},{"chave":"1.2","nome":"Desligar redes e desmontar louças, móveis e acessórios","fase":1,"skill":"Demolições","depende":["1.1"],"espera":0,"medida":"pecas_sanitarias","fixos":60,"por_unidade":30,"pessoas":1,"fatores":["habitada"],"condicao":null},{"chave":"1.3","nome":"Demolição de revestimentos, pavimentos, paredes e tetos","fase":1,"skill":"Demolições","depende":["1.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":36,"pessoas":2,"fatores":["acesso"],"condicao":null},{"chave":"1.4","nome":"Retirada de entulho e limpeza","fase":1,"skill":null,"depende":["1.3"],"espera":0,"medida":"m2_total","fixos":60,"por_unidade":9,"pessoas":1,"fatores":["acesso","andar","distancia","elevador"],"condicao":null},{"chave":"1.5","nome":"Levantamento de materiais em armazém","fase":1,"skill":"Logística","depende":[],"espera":0,"medida":"fixo","fixos":180,"por_unidade":0,"pessoas":1,"fatores":["acesso","andar","elevador"],"condicao":null},{"chave":"3.1","nome":"Regularização do pavimento (betonilha)","fase":3,"skill":"Revestimentos","depende":["1.4","1.5"],"espera":0,"medida":"m2_pavimento","fixos":120,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.2","nome":"Impermeabilização de paredes e pavimento","fase":3,"skill":"Revestimentos","depende":["3.1"],"espera":48,"medida":"m2_total","fixos":60,"por_unidade":18,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.3","nome":"Assentamento de azulejo e mosaico","fase":3,"skill":"Revestimentos","depende":["3.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":60,"pessoas":2,"fatores":["altura_revestimento","janela","local_cortes"],"condicao":null},{"chave":"3.4","nome":"Betumação de juntas e limpeza","fase":3,"skill":"Revestimentos","depende":["3.3"],"espera":24,"medida":"m2_total","fixos":60,"por_unidade":12,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.1","nome":"Montagem de louças sanitárias","fase":4,"skill":"Canalização","depende":["3.4","1.4","1.5"],"espera":0,"medida":"pecas_sanitarias","fixos":120,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.2","nome":"Torneiras, acessórios, espelhos e mobiliário","fase":4,"skill":"Carpintaria","depende":["4.1"],"espera":0,"medida":"acessorios","fixos":120,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.4","nome":"Selagens, retoques, limpeza final e entrega","fase":4,"skill":null,"depende":["4.2","3.4","1.4","1.5"],"espera":0,"medida":"m2_total","fixos":240,"por_unidade":6,"pessoas":1,"fatores":["habitada","mobilada"],"condicao":null}]},{"servicos":["MO Modelo 2 - Casa de Banho: Remoção de Banheira ou Poliban  + Elevação da Torneira + Revestimento até 120cm"],"tipo":"casa_banho","medidas":{"m2_pavimento":1,"m2_parede":3.6,"m2_total":4.6,"pontos_agua":1,"pontos_eletricos":0,"pecas_sanitarias":1,"acessorios":2},"passos":[{"chave":"1.1","nome":"Isolamento e proteção da área","fase":1,"skill":null,"depende":[],"espera":0,"medida":"fixo","fixos":120,"por_unidade":0,"pessoas":1,"fatores":["habitada","mobilada","distancia"],"condicao":null},{"chave":"1.2","nome":"Desligar redes e desmontar louças, móveis e acessórios","fase":1,"skill":"Demolições","depende":["1.1"],"espera":0,"medida":"pecas_sanitarias","fixos":60,"por_unidade":30,"pessoas":1,"fatores":["habitada"],"condicao":null},{"chave":"1.3","nome":"Demolição de revestimentos, pavimentos, paredes e tetos","fase":1,"skill":"Demolições","depende":["1.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":36,"pessoas":2,"fatores":["acesso"],"condicao":null},{"chave":"1.4","nome":"Retirada de entulho e limpeza","fase":1,"skill":null,"depende":["1.3"],"espera":0,"medida":"m2_total","fixos":60,"por_unidade":9,"pessoas":1,"fatores":["acesso","andar","distancia","elevador"],"condicao":null},{"chave":"1.5","nome":"Levantamento de materiais em armazém","fase":1,"skill":"Logística","depende":[],"espera":0,"medida":"fixo","fixos":180,"por_unidade":0,"pessoas":1,"fatores":["acesso","andar","elevador"],"condicao":null},{"chave":"2.1","nome":"Canalização (água e esgotos)","fase":2,"skill":"Canalização","depende":["1.4","1.5"],"espera":0,"medida":"pontos_agua","fixos":360,"por_unidade":240,"pessoas":1,"fatores":[],"condicao":null},{"chave":"2.4","nome":"Ensaios (água, esgotos, elétrico) e fecho de roços","fase":2,"skill":"Canalização","depende":["2.1","1.4","1.5"],"espera":0,"medida":"fixo","fixos":360,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.1","nome":"Regularização do pavimento (betonilha)","fase":3,"skill":"Revestimentos","depende":["2.4"],"espera":0,"medida":"m2_pavimento","fixos":120,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.2","nome":"Impermeabilização de paredes e pavimento","fase":3,"skill":"Revestimentos","depende":["3.1"],"espera":48,"medida":"m2_total","fixos":60,"por_unidade":18,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.3","nome":"Assentamento de azulejo e mosaico","fase":3,"skill":"Revestimentos","depende":["3.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":60,"pessoas":2,"fatores":["altura_revestimento","janela","local_cortes"],"condicao":null},{"chave":"3.4","nome":"Betumação de juntas e limpeza","fase":3,"skill":"Revestimentos","depende":["3.3"],"espera":24,"medida":"m2_total","fixos":60,"por_unidade":12,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.1","nome":"Montagem de louças sanitárias","fase":4,"skill":"Canalização","depende":["3.4","2.4"],"espera":0,"medida":"pecas_sanitarias","fixos":120,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.2","nome":"Torneiras, acessórios, espelhos e mobiliário","fase":4,"skill":"Carpintaria","depende":["4.1"],"espera":0,"medida":"acessorios","fixos":120,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.4","nome":"Selagens, retoques, limpeza final e entrega","fase":4,"skill":null,"depende":["4.2","3.4","2.4"],"espera":0,"medida":"m2_total","fixos":240,"por_unidade":6,"pessoas":1,"fatores":["habitada","mobilada"],"condicao":null}]},{"servicos":["MO Modelo 3 - Casa de Banho: Remoção de Banheira ou Poliban  + Elevação da Torneira + Revestimento até teto"],"tipo":"casa_banho","medidas":{"m2_pavimento":1,"m2_parede":7.2,"m2_total":8.2,"pontos_agua":1,"pontos_eletricos":0,"pecas_sanitarias":1,"acessorios":2},"passos":[{"chave":"1.1","nome":"Isolamento e proteção da área","fase":1,"skill":null,"depende":[],"espera":0,"medida":"fixo","fixos":120,"por_unidade":0,"pessoas":1,"fatores":["habitada","mobilada","distancia"],"condicao":null},{"chave":"1.2","nome":"Desligar redes e desmontar louças, móveis e acessórios","fase":1,"skill":"Demolições","depende":["1.1"],"espera":0,"medida":"pecas_sanitarias","fixos":60,"por_unidade":30,"pessoas":1,"fatores":["habitada"],"condicao":null},{"chave":"1.3","nome":"Demolição de revestimentos, pavimentos, paredes e tetos","fase":1,"skill":"Demolições","depende":["1.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":36,"pessoas":2,"fatores":["acesso"],"condicao":null},{"chave":"1.4","nome":"Retirada de entulho e limpeza","fase":1,"skill":null,"depende":["1.3"],"espera":0,"medida":"m2_total","fixos":60,"por_unidade":9,"pessoas":1,"fatores":["acesso","andar","distancia","elevador"],"condicao":null},{"chave":"1.5","nome":"Levantamento de materiais em armazém","fase":1,"skill":"Logística","depende":[],"espera":0,"medida":"fixo","fixos":180,"por_unidade":0,"pessoas":1,"fatores":["acesso","andar","elevador"],"condicao":null},{"chave":"2.1","nome":"Canalização (água e esgotos)","fase":2,"skill":"Canalização","depende":["1.4","1.5"],"espera":0,"medida":"pontos_agua","fixos":360,"por_unidade":240,"pessoas":1,"fatores":[],"condicao":null},{"chave":"2.4","nome":"Ensaios (água, esgotos, elétrico) e fecho de roços","fase":2,"skill":"Canalização","depende":["2.1","1.4","1.5"],"espera":0,"medida":"fixo","fixos":360,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.1","nome":"Regularização do pavimento (betonilha)","fase":3,"skill":"Revestimentos","depende":["2.4"],"espera":0,"medida":"m2_pavimento","fixos":120,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.2","nome":"Impermeabilização de paredes e pavimento","fase":3,"skill":"Revestimentos","depende":["3.1"],"espera":48,"medida":"m2_total","fixos":60,"por_unidade":18,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.3","nome":"Assentamento de azulejo e mosaico","fase":3,"skill":"Revestimentos","depende":["3.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":60,"pessoas":2,"fatores":["altura_revestimento","janela","local_cortes"],"condicao":null},{"chave":"3.4","nome":"Betumação de juntas e limpeza","fase":3,"skill":"Revestimentos","depende":["3.3"],"espera":24,"medida":"m2_total","fixos":60,"por_unidade":12,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.1","nome":"Montagem de louças sanitárias","fase":4,"skill":"Canalização","depende":["3.4","2.4"],"espera":0,"medida":"pecas_sanitarias","fixos":120,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.2","nome":"Torneiras, acessórios, espelhos e mobiliário","fase":4,"skill":"Carpintaria","depende":["4.1"],"espera":0,"medida":"acessorios","fixos":120,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.4","nome":"Selagens, retoques, limpeza final e entrega","fase":4,"skill":null,"depende":["4.2","3.4","2.4"],"espera":0,"medida":"m2_total","fixos":240,"por_unidade":6,"pessoas":1,"fatores":["habitada","mobilada"],"condicao":null}]},{"servicos":["MO Modelo Remodelação Completa - Cozinha"],"tipo":"cozinha","medidas":{"m2_pavimento":10,"m2_parede":10,"m2_total":20,"pontos_agua":3,"pontos_eletricos":12,"modulos":10,"eletrodomesticos":4,"ml_bancada":3},"passos":[{"chave":"1.1","nome":"Isolamento e proteção da área","fase":1,"skill":null,"depende":[],"espera":0,"medida":"fixo","fixos":120,"por_unidade":0,"pessoas":1,"fatores":["habitada","mobilada","distancia"],"condicao":null},{"chave":"1.2","nome":"Desligar e proteger pontos de água, gás e eletricidade","fase":1,"skill":"Canalização","depende":["1.1"],"espera":0,"medida":"fixo","fixos":120,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null},{"chave":"1.3","nome":"Desmontagem de móveis e eletrodomésticos","fase":1,"skill":"Carpintaria","depende":["1.2"],"espera":0,"medida":"modulos","fixos":120,"por_unidade":30,"pessoas":2,"fatores":["habitada"],"condicao":null},{"chave":"1.4","nome":"Remoção de revestimentos, pavimentos e demolições","fase":1,"skill":"Demolições","depende":["1.3"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":48,"pessoas":2,"fatores":["acesso"],"condicao":null},{"chave":"1.5","nome":"Retirada de entulho e limpeza","fase":1,"skill":null,"depende":["1.4"],"espera":0,"medida":"m2_total","fixos":60,"por_unidade":12,"pessoas":1,"fatores":["acesso","andar","distancia","elevador"],"condicao":null},{"chave":"1.6","nome":"Levantamento de materiais em armazém","fase":1,"skill":"Logística","depende":[],"espera":0,"medida":"fixo","fixos":180,"por_unidade":0,"pessoas":1,"fatores":["acesso","andar","elevador"],"condicao":null},{"chave":"2.1","nome":"Canalização (água e esgotos)","fase":2,"skill":"Canalização","depende":["1.5","1.6"],"espera":0,"medida":"pontos_agua","fixos":240,"por_unidade":240,"pessoas":1,"fatores":[],"condicao":null},{"chave":"2.2","nome":"Instalação elétrica (iluminação, tomadas, circuitos de forno e placa)","fase":2,"skill":"Eletricidade","depende":["1.5","1.6"],"espera":0,"medida":"pontos_eletricos","fixos":360,"por_unidade":120,"pessoas":1,"fatores":[],"condicao":null},{"chave":"2.3","nome":"Instalação de gás","fase":2,"skill":"Gás (ITG)","depende":["1.5","1.6"],"espera":0,"medida":"fixo","fixos":360,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":{"servicos":["Instalação de Gás nas Paredes","Instalação de Eletrodoméstico a Gás","Anulação de Ponto de Gás","Certificação de Gás"],"ficha":{"campo":"gas","valores":["anular","manter","instalar","canalizado","garrafa"]}}},{"chave":"2.4","nome":"Testes de estanquidade e funcionamento e fecho de roços","fase":2,"skill":"Canalização","depende":["2.1","2.2","2.3"],"espera":0,"medida":"fixo","fixos":480,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.1","nome":"Regularização do pavimento (betonilha)","fase":3,"skill":"Revestimentos","depende":["2.4"],"espera":0,"medida":"m2_pavimento","fixos":120,"por_unidade":30,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.2","nome":"Impermeabilização (zonas húmidas)","fase":3,"skill":"Revestimentos","depende":["3.1"],"espera":48,"medida":"m2_pavimento","fixos":60,"por_unidade":12,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.3","nome":"Assentamento de azulejo e pavimento","fase":3,"skill":"Revestimentos","depende":["3.2"],"espera":0,"medida":"m2_total","fixos":120,"por_unidade":60,"pessoas":2,"fatores":["janela","local_cortes"],"condicao":null},{"chave":"3.4","nome":"Betumação de juntas e limpeza","fase":3,"skill":"Revestimentos","depende":["3.3"],"espera":24,"medida":"m2_total","fixos":60,"por_unidade":12,"pessoas":1,"fatores":[],"condicao":null},{"chave":"3.5","nome":"Teto falso, pintura, sancas e rodapés","fase":3,"skill":"Pintura","depende":["2.4"],"espera":0,"medida":"m2_pavimento","fixos":240,"por_unidade":48,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.1","nome":"Montagem dos móveis","fase":4,"skill":"Carpintaria","depende":["3.4","3.5"],"espera":24,"medida":"modulos","fixos":240,"por_unidade":90,"pessoas":2,"fatores":[],"condicao":null},{"chave":"4.2","nome":"Medição da bancada","fase":4,"skill":"Marmorista","depende":["4.1"],"espera":0,"medida":"fixo","fixos":60,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.3","nome":"Colocação da bancada","fase":4,"skill":"Marmorista","depende":["4.2"],"espera":120,"medida":"ml_bancada","fixos":120,"por_unidade":60,"pessoas":2,"fatores":["andar","elevador"],"condicao":null},{"chave":"4.4","nome":"Instalação de eletrodomésticos","fase":4,"skill":"Carpintaria","depende":["4.3"],"espera":0,"medida":"eletrodomesticos","fixos":60,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.5","nome":"Ligações de água, gás e eletricidade","fase":4,"skill":"Canalização","depende":["4.4"],"espera":0,"medida":"pontos_agua","fixos":120,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.6","nome":"Selagens, retoques, limpeza final e entrega","fase":4,"skill":null,"depende":["4.5"],"espera":0,"medida":"m2_total","fixos":240,"por_unidade":6,"pessoas":1,"fatores":["habitada","mobilada"],"condicao":null}]},{"servicos":["MO Modelo Simples de Mudança de Mobiliário - Cozinha"],"tipo":"cozinha","medidas":{"modulos":10,"eletrodomesticos":4,"ml_bancada":3,"pontos_agua":3},"passos":[{"chave":"1.1","nome":"Isolamento e proteção da área","fase":1,"skill":null,"depende":[],"espera":0,"medida":"fixo","fixos":120,"por_unidade":0,"pessoas":1,"fatores":["habitada","mobilada","distancia"],"condicao":null},{"chave":"1.3","nome":"Desmontagem de móveis e eletrodomésticos","fase":1,"skill":"Carpintaria","depende":["1.1"],"espera":0,"medida":"modulos","fixos":120,"por_unidade":30,"pessoas":2,"fatores":["habitada"],"condicao":null},{"chave":"1.5","nome":"Retirada de entulho e limpeza","fase":1,"skill":null,"depende":["1.3"],"espera":0,"medida":"m2_total","fixos":60,"por_unidade":12,"pessoas":1,"fatores":["acesso","andar","distancia","elevador"],"condicao":null},{"chave":"1.6","nome":"Levantamento de materiais em armazém","fase":1,"skill":"Logística","depende":[],"espera":0,"medida":"fixo","fixos":180,"por_unidade":0,"pessoas":1,"fatores":["acesso","andar","elevador"],"condicao":null},{"chave":"4.1","nome":"Montagem dos móveis","fase":4,"skill":"Carpintaria","depende":["1.5","1.6"],"espera":0,"medida":"modulos","fixos":240,"por_unidade":90,"pessoas":2,"fatores":[],"condicao":null},{"chave":"4.2","nome":"Medição da bancada","fase":4,"skill":"Marmorista","depende":["4.1"],"espera":0,"medida":"fixo","fixos":60,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.3","nome":"Colocação da bancada","fase":4,"skill":"Marmorista","depende":["4.2"],"espera":120,"medida":"ml_bancada","fixos":120,"por_unidade":60,"pessoas":2,"fatores":["andar","elevador"],"condicao":null},{"chave":"4.4","nome":"Instalação de eletrodomésticos","fase":4,"skill":"Carpintaria","depende":["4.3"],"espera":0,"medida":"eletrodomesticos","fixos":60,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.5","nome":"Ligações de água, gás e eletricidade","fase":4,"skill":"Canalização","depende":["4.4"],"espera":0,"medida":"pontos_agua","fixos":120,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null},{"chave":"4.6","nome":"Selagens, retoques, limpeza final e entrega","fase":4,"skill":null,"depende":["4.5"],"espera":0,"medida":"m2_total","fixos":240,"por_unidade":6,"pessoas":1,"fatores":["habitada","mobilada"],"condicao":null}]}],"extras":[{"servico":"Levantamento de Sanitários e Mobiliário","passos":[{"chave":"CB1","nome":"Levantamento de Sanitários e Mobiliário","fase":1,"skill":"Demolições","depende":[],"espera":0,"medida":"qt","fixos":120,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"1.2"},"*":{"modo":"livre"}}}]},{"servico":"Supressão de ponto de água","passos":[{"chave":"CB1","nome":"Supressão de ponto de água","fase":2,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"2.1"},"*":{"modo":"livre"}}}]},{"servico":"Mão de Obra Construção de Nicho (valor por unidade)","passos":[{"chave":"CB1","nome":"Mão de Obra Construção de Nicho (valor por unidade)","fase":2,"skill":"Revestimentos","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":180,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"entre","alvo":["2.4","3.2"]},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Revestimento m2","passos":[{"chave":"CB1","nome":"Instalação de Revestimento m2","fase":3,"skill":"Revestimentos","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"3.3"},"*":{"modo":"livre"}}}]},{"servico":"Mão de Obra Demolição de parede m2","passos":[{"chave":"CB1","nome":"Mão de Obra Demolição de parede m2","fase":1,"skill":"Demolições","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":48,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"1.3"}}},{"chave":"CZ1","nome":"Mão de Obra Demolição de parede m2","fase":1,"skill":"Demolições","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":48,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"1.4"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Pavimento m2","passos":[{"chave":"CB1","nome":"Instalação de Pavimento m2","fase":3,"skill":"Revestimentos","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"3.3"},"*":{"modo":"livre"}}}]},{"servico":"Anulação de Ponto de Gás","passos":[{"chave":"CB1","nome":"Anulação de Ponto de Gás","fase":2,"skill":"Gás (ITG)","depende":[],"espera":0,"medida":"qt","fixos":120,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"2.1"}}},{"chave":"CZ1","nome":"Anulação de Ponto de Gás","fase":2,"skill":"Gás (ITG)","depende":[],"espera":0,"medida":"qt","fixos":120,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"2.3"},"*":{"modo":"livre"}}}]},{"servico":"Mão de Obra Levantamento de parede em Alvenaria m2","passos":[{"chave":"CB1","nome":"Mão de Obra Levantamento de parede em Alvenaria m2","fase":1,"skill":"Revestimentos","depende":[],"espera":0,"medida":"qt","fixos":60,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"entre","alvo":["1.4","2.1"]},"*":{"modo":"livre"}}},{"chave":"CZ1","nome":"Mão de Obra Levantamento de parede em Alvenaria m2","fase":1,"skill":"Revestimentos","depende":[],"espera":0,"medida":"qt","fixos":60,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"entre","alvo":["1.5","2.1"]}}}]},{"servico":"Instalação de Mobiliário WC","passos":[{"chave":"CB1","nome":"Instalação de Mobiliário WC","fase":4,"skill":"Carpintaria","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":120,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Coluna de Duche","passos":[{"chave":"CB1","nome":"Instalação de Coluna de Duche","fase":4,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"},"*":{"modo":"livre"}}}]},{"servico":"Colocação de Serigrafia para Resguardo","passos":[{"chave":"CB1","nome":"Colocação de Serigrafia para Resguardo","fase":4,"skill":"Carpintaria","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"},"*":{"modo":"livre"}}}]},{"servico":"Construção de Murete em Alvenaria até 80cm","passos":[{"chave":"CB1","nome":"Construção de Murete em Alvenaria até 80cm","fase":2,"skill":"Revestimentos","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":240,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"entre","alvo":["2.4","3.2"]},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Sanita Compacta","passos":[{"chave":"CB1","nome":"Instalação de Sanita Compacta","fase":4,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":120,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.1"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Resguardo","passos":[{"chave":"CB1","nome":"Instalação de Resguardo","fase":4,"skill":"Carpintaria","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":120,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Eletrodoméstico a Gás","passos":[{"chave":"CB1","nome":"Instalação de Eletrodoméstico a Gás","fase":4,"skill":"Gás (ITG)","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":120,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"}}},{"chave":"CZ1","nome":"Instalação de Eletrodoméstico a Gás (1/2)","fase":4,"skill":"Gás (ITG)","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"4.4"},"*":{"modo":"livre"}}},{"chave":"CZ2","nome":"Instalação de Eletrodoméstico a Gás (2/2)","fase":4,"skill":"Gás (ITG)","depende":["CZ1"],"espera":0,"medida":"qt","fixos":0,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"4.5"},"*":{"modo":"livre"}}}]},{"servico":"Mão de Obra - Deslocação de Ponto de Água ML","passos":[{"chave":"CB1","nome":"Mão de Obra - Deslocação de Ponto de Água ML","fase":2,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"2.1"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Banheira de Pousar","passos":[{"chave":"CB1","nome":"Instalação de Banheira de Pousar","fase":4,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":180,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.1"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de torneira de lavatório","passos":[{"chave":"CB1","nome":"Instalação de torneira de lavatório","fase":4,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Espelho com LED","passos":[{"chave":"CB1","nome":"Instalação de Espelho com LED (1/2)","fase":4,"skill":"Eletricidade","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":30,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"},"*":{"modo":"livre"}}},{"chave":"CB2","nome":"Instalação de Espelho com LED (2/2)","fase":4,"skill":"Eletricidade","depende":["CB1"],"espera":0,"medida":"qt","fixos":0,"por_unidade":30,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.3"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Acessórios WC","passos":[{"chave":"CB1","nome":"Instalação de Acessórios WC","fase":4,"skill":"Carpintaria","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":30,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"},"*":{"modo":"livre"}}}]},{"servico":"Mão de Obra - Deslocação de Ponto de Esgoto ML","passos":[{"chave":"CB1","nome":"Mão de Obra - Deslocação de Ponto de Esgoto ML","fase":2,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":120,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"2.1"},"*":{"modo":"livre"}}},{"chave":"CZ1","nome":"Mão de Obra - Deslocação de Ponto de Esgoto ML","fase":2,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":120,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"2.1"}}}]},{"servico":"Instalação de Lavatório Cerâmica","passos":[{"chave":"CB1","nome":"Instalação de Lavatório Cerâmica","fase":4,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.1"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Bidé Compacto","passos":[{"chave":"CB1","nome":"Instalação de Bidé Compacto","fase":4,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.1"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Acessório de segurança WC","passos":[{"chave":"CB1","nome":"Instalação de Acessório de segurança WC","fase":4,"skill":"Carpintaria","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":30,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"},"*":{"modo":"livre"}}}]},{"servico":"Mão de Obra Abertura e Fecho de Roço c/ Acabamento ml","passos":[{"chave":"CB1","nome":"Mão de Obra Abertura e Fecho de Roço c/ Acabamento ml","fase":2,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"2.1"}}},{"chave":"CZ1","nome":"Mão de Obra Abertura e Fecho de Roço c/ Acabamento ml","fase":2,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"2.1"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Vidro Lateral Fixo","passos":[{"chave":"CB1","nome":"Instalação de Vidro Lateral Fixo","fase":4,"skill":"Carpintaria","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":90,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Torneira de Bidé","passos":[{"chave":"CB1","nome":"Instalação de Torneira de Bidé","fase":4,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.2"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Toalheiros Eletricos","passos":[{"chave":"CB1","nome":"Instalação de Toalheiros Eletricos (1/2)","fase":2,"skill":"Eletricidade","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"2.3"},"*":{"modo":"livre"}}},{"chave":"CB2","nome":"Instalação de Toalheiros Eletricos (2/2)","fase":4,"skill":"Eletricidade","depende":["CB1"],"espera":0,"medida":"qt","fixos":0,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.3"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Ventaxia WC","passos":[{"chave":"CB1","nome":"Instalação de Ventaxia WC (1/2)","fase":2,"skill":"Eletricidade","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"2.2"},"*":{"modo":"livre"}}},{"chave":"CB2","nome":"Instalação de Ventaxia WC (2/2)","fase":4,"skill":"Eletricidade","depende":["CB1"],"espera":0,"medida":"qt","fixos":0,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"casa_banho":{"modo":"junta","alvo":"4.3"},"*":{"modo":"livre"}}}]},{"servico":"Instalação Estrutura para gaveta (valor unitário)","passos":[{"chave":"CZ1","nome":"Instalação Estrutura para gaveta (valor unitário)","fase":4,"skill":"Carpintaria","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":18,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"4.1"},"*":{"modo":"livre"}}}]},{"servico":"Instalação Estrutura para gavetão (valor unitário)","passos":[{"chave":"CZ1","nome":"Instalação Estrutura para gavetão (valor unitário)","fase":4,"skill":"Carpintaria","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":24,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"4.1"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Gás nas Paredes","passos":[{"chave":"CZ1","nome":"Instalação de Gás nas Paredes","fase":2,"skill":"Gás (ITG)","depende":[],"espera":0,"medida":"qt","fixos":360,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"2.3"},"*":{"modo":"livre"}}}]},{"servico":"Passagem de fio Eletrico fase/neutro 1,5mm² ML","passos":[{"chave":"CZ1","nome":"Passagem de fio Eletrico fase/neutro 1,5mm² ML","fase":2,"skill":"Eletricidade","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":9,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"2.2"},"*":{"modo":"livre"}}}]},{"servico":"Instalação Vista superior até 20cm de altura (valor p/ml)","passos":[{"chave":"CZ1","nome":"Instalação Vista superior até 20cm de altura (valor p/ml)","fase":4,"skill":"Carpintaria","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":18,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"4.1"},"*":{"modo":"livre"}}}]},{"servico":"Instalação Estrutura de Gavetões Internos para dispenseiro (valor até 4 unidades)","passos":[{"chave":"CZ1","nome":"Instalação Estrutura de Gavetões Internos para dispenseiro (valor até 4 unidades)","fase":4,"skill":"Carpintaria","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"4.1"},"*":{"modo":"livre"}}}]},{"servico":"Certificação de Gás","passos":[{"chave":"CZ1","nome":"Certificação de Gás","fase":4,"skill":"Gás (ITG)","depende":[],"espera":0,"medida":"qt","fixos":120,"por_unidade":0,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"entre","alvo":["4.5","4.6"]},"*":{"modo":"livre"}}}]},{"servico":"Instalação de torneira de Cozinha","passos":[{"chave":"CZ1","nome":"Instalação de torneira de Cozinha","fase":4,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":45,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"4.5"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Rodapé ML","passos":[{"chave":"CZ1","nome":"Instalação de Rodapé ML","fase":3,"skill":"Pintura","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":15,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"3.5"},"*":{"modo":"livre"}}}]},{"servico":"Instalação de Lava Loiça","passos":[{"chave":"CZ1","nome":"Instalação de Lava Loiça","fase":4,"skill":"Canalização","depende":[],"espera":0,"medida":"qt","fixos":0,"por_unidade":60,"pessoas":1,"fatores":[],"condicao":null,"encaixe":{"cozinha":{"modo":"junta","alvo":"4.5"},"*":{"modo":"livre"}}}]}],"sem_planear":["Deslocação Fora do Raio de 30 km (valor p/km)","Projeto 3D - 3 Imagens","Projeto 3D 3 imagens - Clientes BMLAR"],"medida_para":[{"servico":"Instalação de Eletrodomésticos de Cozinha","medida":"eletrodomesticos"},{"servico":"Instalação de Eletrodomésticos Mudelar","medida":"eletrodomesticos"}]}'::jsonb $function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_tempos_padrao() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_tempos_padrao() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_tempos_padrao() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_tg_avisar_atribuicao()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_tg_avisar_atribuicao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v record;
BEGIN
  FOR v IN SELECT obra_id, array_agg(DISTINCT utilizador_id) AS pessoas FROM novas GROUP BY obra_id LOOP
    PERFORM public.ops_obra_avisar_atribuicao(v.obra_id, v.pessoas);
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Avisos de atribuição: %', SQLERRM;
  RETURN NULL;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_tg_avisar_atribuicao() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_tg_avisar_atribuicao() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_tg_rever_bancada()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_tg_rever_bancada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v uuid;
BEGIN
  -- Só as obras onde mudou alguma tarefa de bancada (ou marmorista).
  FOR v IN
    SELECT DISTINCT n.obra_id FROM novas n
      LEFT JOIN public.ops_skill k ON k.id = n.skill_id
     WHERE n.nome ILIKE '%bancada%' OR k.nome ILIKE 'marmor%'
  LOOP
    PERFORM public.ops_obra_avisar_bancada(v);
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Aviso da bancada: %', SQLERRM;
  RETURN NULL;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_tg_rever_bancada() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_tg_rever_bancada() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obra_validar_tarefas(uuid, uuid, jsonb)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obra_validar_tarefas(_org uuid, _orc uuid, _tarefas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n    integer;
  e      jsonb;
  i      integer := 0;
  v_nome text;
  v_num  numeric;
  v_dep  integer;
  v_u    text;
  v_lin  uuid;
  v_ok   boolean;
BEGIN
  IF jsonb_typeof(_tarefas) <> 'array' THEN
    RAISE EXCEPTION 'As tarefas têm de vir numa lista.';
  END IF;
  v_n := jsonb_array_length(_tarefas);
  IF v_n > 500 THEN
    RAISE EXCEPTION 'Demasiadas tarefas (%). O máximo é 500.', v_n;
  END IF;

  FOR e IN SELECT x FROM jsonb_array_elements(_tarefas) x LOOP
    i := i + 1;
    IF jsonb_typeof(e) <> 'object' THEN
      RAISE EXCEPTION 'A tarefa n.º % não é válida.', i;
    END IF;
    v_nome := nullif(btrim(e->>'nome'), '');
    IF v_nome IS NULL THEN
      RAISE EXCEPTION 'A tarefa n.º % não tem nome.', i;
    END IF;
    IF length(v_nome) > 300 OR length(COALESCE(e->>'procedimento', '')) > 4000
       OR length(COALESCE(e->>'materiais', '')) > 4000 OR length(COALESCE(e->>'ferramentas', '')) > 4000 THEN
      RAISE EXCEPTION '"%": texto demasiado comprido.', left(v_nome, 60);
    END IF;

    -- Números: a mensagem certa em vez de um erro de conversão.
    IF (CASE WHEN COALESCE(e->>'fase', '') ~ '^\d{1,2}$' THEN (e->>'fase')::integer END)
       NOT BETWEEN 1 AND 9 IS NOT FALSE THEN
      RAISE EXCEPTION '"%": a fase tem de ser de 1 a 9.', v_nome;
    END IF;
    IF (CASE WHEN COALESCE(e->>'minutos', '') ~ '^\d{1,6}$' THEN (e->>'minutos')::integer END)
       > 0 IS NOT TRUE THEN
      RAISE EXCEPTION '"%": os minutos previstos têm de ser um número inteiro maior que 0.', v_nome;
    END IF;
    IF nullif(e->>'pessoas_previstas', '') IS NOT NULL
       AND (CASE WHEN e->>'pessoas_previstas' ~ '^\d{1,2}$' THEN (e->>'pessoas_previstas')::integer END)
           BETWEEN 1 AND 20 IS NOT TRUE THEN
      RAISE EXCEPTION '"%": de 1 a 20 pessoas.', v_nome;
    END IF;
    -- Planeamento automático (2c).
    IF nullif(e->>'espera_antes_horas', '') IS NOT NULL
       AND (public.ops_num(e->>'espera_antes_horas') BETWEEN 0 AND 2000) IS NOT TRUE THEN
      RAISE EXCEPTION '"%": a espera tem de ser de 0 a 2000 horas.', v_nome;
    END IF;
    IF nullif(e->>'medida', '') IS NOT NULL AND e->>'medida' NOT IN
       ('qt','fixo','m2_pavimento','m2_parede','m2_total','pontos_agua','pontos_eletricos',
        'pecas_sanitarias','acessorios','modulos','eletrodomesticos','ml_bancada') THEN
      RAISE EXCEPTION '"%": medida desconhecida.', v_nome;
    END IF;
    IF nullif(e->>'medida_qt', '') IS NOT NULL AND (public.ops_num(e->>'medida_qt') >= 0) IS NOT TRUE THEN
      RAISE EXCEPTION '"%": a quantidade da medida tem de ser um número ≥ 0.', v_nome;
    END IF;
    IF nullif(e->>'minutos_origem', '') IS NOT NULL
       AND e->>'minutos_origem' NOT IN ('padrao','aprendido','ficha','manual') THEN
      RAISE EXCEPTION '"%": origem do tempo desconhecida.', v_nome;
    END IF;
    IF (nullif(e->>'ritmo_n', '') IS NOT NULL AND (public.ops_num(e->>'ritmo_n') >= 0) IS NOT TRUE)
       OR (nullif(e->>'minutos_juntos', '') IS NOT NULL AND (public.ops_num(e->>'minutos_juntos') >= 0) IS NOT TRUE) THEN
      RAISE EXCEPTION '"%": número inválido.', v_nome;
    END IF;
    IF e ? 'fatores' AND jsonb_typeof(e->'fatores') NOT IN ('object', 'null') THEN
      RAISE EXCEPTION '"%": os fatores têm de vir num objeto.', v_nome;
    END IF;
    IF length(COALESCE(e->>'fatores_chave', '')) > 500 OR length(COALESCE(e->>'chave_passo', '')) > 12 THEN
      RAISE EXCEPTION '"%": texto demasiado comprido.', v_nome;
    END IF;

    -- "Depois de": posição(ões) 1..n de OUTRAS tarefas da lista.
    IF jsonb_typeof(e->'depende') NOT IN ('array', 'number', 'string', 'null') THEN
      RAISE EXCEPTION '"%": "depois de" inválido.', v_nome;
    END IF;
    FOR v_u IN SELECT jsonb_array_elements_text(
                 CASE jsonb_typeof(e->'depende') WHEN 'array' THEN e->'depende'
                      WHEN 'number' THEN jsonb_build_array(e->'depende')
                      WHEN 'string' THEN jsonb_build_array(e->'depende')
                      ELSE '[]'::jsonb END) LOOP
      IF v_u !~ '^\d{1,4}$' THEN
        RAISE EXCEPTION '"%": "depois de" inválido.', v_nome;
      END IF;
      v_dep := v_u::integer;
      IF v_dep = i OR v_dep < 1 OR v_dep > v_n THEN
        RAISE EXCEPTION '"%": só pode depender de outra tarefa da lista.', v_nome;
      END IF;
    END LOOP;

    -- Pessoas: perfil ATIVO em Operações nesta organização.
    IF e ? 'pessoas' AND jsonb_typeof(e->'pessoas') NOT IN ('array', 'null') THEN
      RAISE EXCEPTION '"%": as pessoas têm de vir numa lista.', v_nome;
    END IF;
    IF jsonb_typeof(e->'pessoas') = 'array' THEN
      IF jsonb_array_length(e->'pessoas') > 20 THEN
        RAISE EXCEPTION '"%": no máximo 20 pessoas.', v_nome;
      END IF;
      FOR v_u IN SELECT jsonb_array_elements_text(e->'pessoas') LOOP
        IF NOT EXISTS (SELECT 1 FROM public.ops_utilizador_perfil p
                        WHERE p.organization_id = _org AND p.utilizador_id::text = lower(v_u) AND p.ativo) THEN
          RAISE EXCEPTION '"%": há uma pessoa que não está ativa em Operações nesta organização.', v_nome
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END LOOP;
    END IF;

    IF nullif(e->>'skill_id', '') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.ops_skill k
          WHERE k.id::text = e->>'skill_id' AND k.organization_id = _org) THEN
      RAISE EXCEPTION '"%": essa especialidade não é desta organização.', v_nome;
    END IF;
    IF length(COALESCE(e->>'skill_nome', '')) > 80 THEN
      RAISE EXCEPTION '"%": nome de especialidade demasiado comprido.', v_nome;
    END IF;

    -- Linha do orçamento: tem de ser DESTE orçamento (só lê o CRM).
    IF nullif(e->>'orcamento_linha_id', '') IS NOT NULL THEN
      IF _orc IS NULL OR e->>'orcamento_linha_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION '"%": essa linha não é do orçamento desta obra.', v_nome;
      END IF;
      v_lin := (e->>'orcamento_linha_id')::uuid;
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.quote_lines WHERE id = $1 AND quote_id = $2)'
         INTO v_ok USING v_lin, _orc;
      IF NOT v_ok THEN
        RAISE EXCEPTION '"%": essa linha não é do orçamento desta obra.', v_nome;
      END IF;
    END IF;
    IF nullif(e->>'servico_id', '') IS NOT NULL THEN
      IF e->>'servico_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION '"%": esse serviço não é desta organização.', v_nome;
      END IF;
      IF NOT public.ops_obra_servico_da_org(_org, (e->>'servico_id')::uuid) THEN
        RAISE EXCEPTION '"%": esse serviço não é desta organização.', v_nome;
      END IF;
    END IF;
    IF nullif(e->>'servico_tarefa_id', '') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.ops_obra_servico_tarefa st
          WHERE st.id::text = e->>'servico_tarefa_id' AND st.organization_id = _org) THEN
      RAISE EXCEPTION '"%": esse passo de modelo não é desta organização.', v_nome;
    END IF;

    -- Materiais do CRM: só a forma (é uma cópia, sem FK).
    IF e ? 'materiais_crm' AND jsonb_typeof(e->'materiais_crm') NOT IN ('array', 'null') THEN
      RAISE EXCEPTION '"%": os materiais ligados têm de vir numa lista.', v_nome;
    END IF;
    IF jsonb_typeof(e->'materiais_crm') = 'array' THEN
      IF jsonb_array_length(e->'materiais_crm') > 100 THEN
        RAISE EXCEPTION '"%": demasiados materiais ligados.', v_nome;
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(e->'materiais_crm') m
                  WHERE jsonb_typeof(m) <> 'object'
                     OR nullif(btrim(m->>'nome'), '') IS NULL
                     OR (nullif(m->>'produto_id', '') IS NOT NULL
                         AND m->>'produto_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
                     OR (nullif(m->>'quantidade', '') IS NOT NULL
                         AND m->>'quantidade' !~ '^\d{1,9}(\.\d{1,4})?$')
                     OR (nullif(m->>'disponivel', '') IS NOT NULL
                         AND m->>'disponivel' !~ '^-?\d{1,9}(\.\d{1,4})?$')) THEN
        RAISE EXCEPTION '"%": há um material ligado inválido.', v_nome;
      END IF;
    END IF;
  END LOOP;

  -- Sem ciclos nas dependências da lista.
  SELECT x.e->>'nome' INTO v_nome
    FROM (
      WITH RECURSIVE arestas(a, b) AS (
        SELECT x.pos::integer, dp.v::integer
          FROM jsonb_array_elements(_tarefas) WITH ORDINALITY AS x(e, pos)
         CROSS JOIN LATERAL jsonb_array_elements_text(
                 CASE jsonb_typeof(x.e->'depende') WHEN 'array' THEN x.e->'depende'
                      WHEN 'number' THEN jsonb_build_array(x.e->'depende')
                      WHEN 'string' THEN jsonb_build_array(x.e->'depende')
                      ELSE '[]'::jsonb END) dp(v)
      ),
      r(ini, cur) AS (
        SELECT a, b FROM arestas
        UNION
        SELECT r.ini, ar.b FROM r JOIN arestas ar ON ar.a = r.cur
      )
      SELECT min(ini) AS pos FROM r WHERE r.ini = r.cur
    ) c
    JOIN jsonb_array_elements(_tarefas) WITH ORDINALITY AS x(e, pos) ON x.pos = c.pos;
  IF v_nome IS NOT NULL THEN
    RAISE EXCEPTION '"%": as dependências fecham um ciclo (nenhuma tarefa do ciclo poderia começar).', v_nome;
  END IF;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obra_validar_tarefas(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obra_validar_tarefas(uuid, uuid, jsonb) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obras_que_vejo()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obras_que_vejo()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eu AS (SELECT public.current_business_user_id() AS id),
  orgs AS (
    SELECT g.organization_id,
           public.ops_pode(g.organization_id, 'operations.orders.view_all') AS todas,
           public.ops_pode(g.organization_id, 'operations.orders.view') AS ver
      FROM (SELECT DISTINCT organization_id FROM public.ops_obra) g
  )
  SELECT o.id
    FROM public.ops_obra o
    JOIN orgs ON orgs.organization_id = o.organization_id
   CROSS JOIN eu
   WHERE orgs.todas
      OR (orgs.ver AND (
            o.gestor_id = eu.id
         OR o.supervisor_id = eu.id
         OR EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                     WHERE tp.obra_id = o.id AND tp.utilizador_id = eu.id)))
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obras_que_vejo() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obras_que_vejo() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obras_que_vejo() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_obras_visiveis(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_obras_visiveis(_org uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_todas boolean := public.ops_pode(_org, 'operations.orders.view_all');
  v_ver   boolean;
  v_eu    uuid;
BEGIN
  IF v_todas THEN
    RETURN QUERY SELECT o.id FROM public.ops_obra o WHERE o.organization_id = _org;
    RETURN;
  END IF;
  v_ver := public.ops_pode(_org, 'operations.orders.view');
  IF NOT v_ver THEN
    RETURN;
  END IF;
  v_eu := public.current_business_user_id();
  RETURN QUERY
  SELECT o.id FROM public.ops_obra o
   WHERE o.organization_id = _org
     AND (o.gestor_id = v_eu OR o.supervisor_id = v_eu
          OR EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                      WHERE tp.obra_id = o.id AND tp.utilizador_id = v_eu));
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_obras_visiveis(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_obras_visiveis(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_pack_conteudo(text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_pack_conteudo(_pack text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
SELECT CASE _pack

WHEN 'manutencao' THEN '{
  "nome": "Manutenção de edifícios",
  "descricao": "Extintores, AVAC, elevadores e quadros elétricos. O que uma empresa de manutenção visita todos os meses.",
  "categorias": [
    {"codigo": "EXT", "nome": "Extintores"},
    {"codigo": "AVAC", "nome": "AVAC"},
    {"codigo": "ELEV", "nome": "Elevadores"},
    {"codigo": "QE", "nome": "Quadros elétricos"},
    {"codigo": "PORT", "nome": "Portões automáticos"},
    {"codigo": "ILUM", "nome": "Iluminação de emergência"}
  ],
  "medicoes": [
    {"nome": "Pressão do extintor", "tipo": "gama", "unidade": "bar", "min": 10, "max": 15, "categoria": "EXT"},
    {"nome": "Estado do selo", "tipo": "escolha", "categoria": "EXT", "opcoes": [
      {"nome": "Intacto"},
      {"nome": "Violado", "mau": true, "corretiva": true},
      {"nome": "Ilegível", "mau": true, "corretiva": true}
    ]},
    {"nome": "Validade do extintor", "tipo": "texto", "categoria": "EXT"},
    {"nome": "Temperatura de insuflação", "tipo": "gama", "unidade": "°C", "min": 16, "max": 24, "categoria": "AVAC"},
    {"nome": "Estado dos filtros", "tipo": "escolha", "categoria": "AVAC", "opcoes": [
      {"nome": "Limpos"},
      {"nome": "A precisar de limpeza"},
      {"nome": "Saturados", "mau": true, "corretiva": true}
    ]},
    {"nome": "Horas de funcionamento", "tipo": "acumulado", "unidade": "h", "categoria": "AVAC"},
    {"nome": "Nivelamento da cabina", "tipo": "gama", "unidade": "mm", "min": -10, "max": 10, "categoria": "ELEV"},
    {"nome": "Alarme da cabina", "tipo": "escolha", "categoria": "ELEV", "opcoes": [
      {"nome": "Toca"},
      {"nome": "Não toca", "mau": true, "corretiva": true}
    ]},
    {"nome": "Temperatura do quadro", "tipo": "gama", "unidade": "°C", "max": 45, "categoria": "QE"},
    {"nome": "Autonomia da luminária", "tipo": "gama", "unidade": "min", "min": 60, "categoria": "ILUM"}
  ],
  "checklists": [
    {"codigo": "CHK-EXT-TRI", "nome": "Inspeção trimestral de extintor", "tarefas": [
      {"nome": "Acesso desobstruído e sinalização visível", "tipo": "inspecao"},
      {"nome": "Manómetro na zona verde", "tipo": "inspecao", "medicoes": ["Pressão do extintor"]},
      {"nome": "Selo e cavilha", "tipo": "inspecao", "medicoes": ["Estado do selo"]},
      {"nome": "Data de validade e da última recarga", "tipo": "inspecao", "medicoes": ["Validade do extintor"]},
      {"nome": "Mangueira e difusor sem fissuras", "tipo": "inspecao"},
      {"nome": "Limpeza do aparelho", "tipo": "limpeza", "obrigatoria": false}
    ]},
    {"codigo": "CHK-AVAC-SEM", "nome": "Manutenção semestral de AVAC", "tarefas": [
      {"nome": "Estado dos filtros", "tipo": "inspecao", "medicoes": ["Estado dos filtros"]},
      {"nome": "Substituição de filtros", "tipo": "substituicao", "obrigatoria": false},
      {"nome": "Limpeza da unidade de condensação", "tipo": "limpeza"},
      {"nome": "Temperatura de insuflação", "tipo": "inspecao", "medicoes": ["Temperatura de insuflação"]},
      {"nome": "Contador de horas", "tipo": "inspecao", "medicoes": ["Horas de funcionamento"]},
      {"nome": "Verificação de fugas de refrigerante", "tipo": "inspecao"},
      {"nome": "Limpeza do tabuleiro de condensados", "tipo": "limpeza"}
    ]},
    {"codigo": "CHK-ELEV-MEN", "nome": "Inspeção mensal de elevador", "tarefas": [
      {"nome": "Portas abrem e fecham sem esforço", "tipo": "inspecao"},
      {"nome": "Nivelamento aos pisos", "tipo": "inspecao", "medicoes": ["Nivelamento da cabina"]},
      {"nome": "Alarme e intercomunicador", "tipo": "inspecao", "medicoes": ["Alarme da cabina"]},
      {"nome": "Iluminação da cabina e de emergência", "tipo": "inspecao"},
      {"nome": "Limpeza da casa das máquinas", "tipo": "limpeza"}
    ]},
    {"codigo": "CHK-QE-SEM", "nome": "Inspeção semestral de quadro elétrico", "tarefas": [
      {"nome": "Aperto de ligações", "tipo": "proacao"},
      {"nome": "Temperatura por termografia", "tipo": "inspecao", "medicoes": ["Temperatura do quadro"]},
      {"nome": "Teste de diferenciais", "tipo": "inspecao"},
      {"nome": "Identificação dos circuitos legível", "tipo": "inspecao"},
      {"nome": "Limpeza interior", "tipo": "limpeza"}
    ]},
    {"codigo": "CHK-ILUM-ANU", "nome": "Ensaio anual de iluminação de emergência", "tarefas": [
      {"nome": "Ensaio de autonomia", "tipo": "inspecao", "medicoes": ["Autonomia da luminária"]},
      {"nome": "Sinalização de saída visível", "tipo": "inspecao"},
      {"nome": "Substituição de baterias", "tipo": "substituicao", "obrigatoria": false}
    ]}
  ]
}'::jsonb

WHEN 'obras' THEN '{
  "nome": "Obras e remodelações",
  "descricao": "Vistoria antes, receção no fim. Para quem entra numa casa e tem de provar o estado em que a encontrou.",
  "categorias": [
    {"codigo": "CANA", "nome": "Canalização"},
    {"codigo": "ELET", "nome": "Eletricidade"},
    {"codigo": "CARP", "nome": "Carpintaria"},
    {"codigo": "PINT", "nome": "Pinturas"},
    {"codigo": "ALVE", "nome": "Alvenarias"}
  ],
  "medicoes": [
    {"nome": "Estado à chegada", "tipo": "escolha", "opcoes": [
      {"nome": "Sem danos"},
      {"nome": "Com danos pré-existentes", "mau": true}
    ]},
    {"nome": "Ensaio de estanquidade", "tipo": "escolha", "categoria": "CANA", "opcoes": [
      {"nome": "Sem fugas"},
      {"nome": "Com fuga", "mau": true, "corretiva": true}
    ]},
    {"nome": "Observações do cliente", "tipo": "texto"}
  ],
  "checklists": [
    {"codigo": "CHK-OBRA-INI", "nome": "Vistoria inicial", "tarefas": [
      {"nome": "Fotografar o estado à chegada", "tipo": "inspecao", "foto": true, "medicoes": ["Estado à chegada"]},
      {"nome": "Confirmar acessos e horários com o cliente", "tipo": "inspecao"},
      {"nome": "Proteger pavimentos e mobiliário", "tipo": "proacao"},
      {"nome": "Localizar cortes de água e eletricidade", "tipo": "inspecao"}
    ]},
    {"codigo": "CHK-OBRA-FIM", "nome": "Receção de obra", "tarefas": [
      {"nome": "Ensaios de estanquidade", "tipo": "inspecao", "medicoes": ["Ensaio de estanquidade"]},
      {"nome": "Remates e acabamentos", "tipo": "inspecao"},
      {"nome": "Limpeza final", "tipo": "limpeza"},
      {"nome": "Fotografar o resultado", "tipo": "inspecao", "foto": true},
      {"nome": "Entrega de chaves e manuais", "tipo": "inspecao"},
      {"nome": "Observações do cliente", "tipo": "inspecao", "obrigatoria": false, "medicoes": ["Observações do cliente"]}
    ]}
  ]
}'::jsonb

WHEN 'limpeza' THEN '{
  "nome": "Limpeza",
  "descricao": "Áreas comuns e instalações sanitárias, com o registo que um condomínio pede.",
  "categorias": [
    {"codigo": "AREA", "nome": "Áreas comuns"},
    {"codigo": "WC", "nome": "Instalações sanitárias"},
    {"codigo": "EXTR", "nome": "Espaços exteriores"}
  ],
  "medicoes": [
    {"nome": "Nível de consumíveis", "tipo": "escolha", "categoria": "WC", "opcoes": [
      {"nome": "Reposto"},
      {"nome": "Em falta", "mau": true, "corretiva": true}
    ]},
    {"nome": "Estado geral", "tipo": "escolha", "opcoes": [
      {"nome": "Bom"},
      {"nome": "Aceitável"},
      {"nome": "Mau", "mau": true, "corretiva": true}
    ]}
  ],
  "checklists": [
    {"codigo": "CHK-LIMP-DIA", "nome": "Limpeza diária de áreas comuns", "tarefas": [
      {"nome": "Aspirar e lavar pavimentos", "tipo": "limpeza"},
      {"nome": "Limpeza de vidros e espelhos", "tipo": "limpeza"},
      {"nome": "Despejo de papeleiras", "tipo": "limpeza"},
      {"nome": "Estado geral no fim", "tipo": "inspecao", "medicoes": ["Estado geral"]}
    ]},
    {"codigo": "CHK-LIMP-WC", "nome": "Limpeza de instalações sanitárias", "tarefas": [
      {"nome": "Desinfeção de sanitas e lavatórios", "tipo": "limpeza"},
      {"nome": "Lavagem de pavimentos e azulejos", "tipo": "limpeza"},
      {"nome": "Reposição de consumíveis", "tipo": "substituicao", "medicoes": ["Nível de consumíveis"]},
      {"nome": "Verificação de fugas e entupimentos", "tipo": "inspecao"}
    ]}
  ]
}'::jsonb

ELSE NULL END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_pack_conteudo(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_pack_conteudo(text) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_pack_conteudo(text) TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_pack_conteudo(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_pack_conteudo(text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_pode(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_pode(_org_id uuid, _perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      _org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), _perm)
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.anew_memberships m
           WHERE m.user_id = public.current_business_user_id()
             AND m.organization_id = _org_id
             AND m.status = 'active')
        OR EXISTS (
          SELECT 1 FROM public.anew_memberships m
            JOIN public.anew_role_permissions rp
              ON rp.role_id = m.role_id AND rp.permission_code = _perm
           WHERE m.user_id = public.current_business_user_id()
             AND m.organization_id = _org_id
             AND m.status = 'active')
      )
      AND EXISTS (
        SELECT 1 FROM public.ops_utilizador_perfil p
         WHERE p.organization_id = _org_id
           AND p.utilizador_id = public.current_business_user_id()
           AND p.ativo
           -- A permissão do CRM é global; a função é por organização. Para
           -- as duas que mexem em gente e em dinheiro, é a função NESTA
           -- organização que decide.
           AND (_perm NOT IN ('operations.settings.manage','operations.costs.view')
                OR p.funcao IN ('admin','gestor'))
      )
    )
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_pode(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_pode(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_pode(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_pode_ver_obra(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_pode_ver_obra(_obra_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ops_obra o
     WHERE o.id = _obra_id
       AND (
         public.ops_pode(o.organization_id, 'operations.orders.view_all')
         OR (
           public.ops_pode(o.organization_id, 'operations.orders.view')
           AND (
             o.gestor_id = public.current_business_user_id()
             OR o.supervisor_id = public.current_business_user_id()
             OR EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                         WHERE tp.obra_id = o.id
                           AND tp.utilizador_id = public.current_business_user_id())
           )
         )
       )
  )
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_pode_ver_obra(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_pode_ver_obra(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_pode_ver_obra(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_pode_ver_ordem(uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_pode_ver_ordem(_auth_uid uuid, _ordem_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ((SELECT auth.uid()) IS NULL OR _auth_uid = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
        FROM public.ops_ordem o
       WHERE o.id = _ordem_id
         AND (
           public.ops_pode(o.organization_id, 'operations.orders.view_all')
           OR public.ops_nivel_funcao(public.ops_funcao_atual(o.organization_id))
                <= public.ops_nivel_funcao('supervisor')
           OR EXISTS (
             SELECT 1 FROM public.anew_users au
              WHERE au.auth_user_id = _auth_uid
                AND (o.responsavel_id = au.id
                     OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa op
                                 WHERE op.ordem_id = o.id AND op.utilizador_id = au.id)))
         )
    )
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_pode_ver_ordem(uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_pode_ver_ordem(uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_pode_ver_ordem(uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_proximo_codigo(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_proximo_codigo(_org_id uuid, _prefixo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_chave text;
  v_valor integer;
  v_ano   text := to_char(now(), 'YYYY');
BEGIN
  IF NOT public.ops_pode(_org_id, 'operations.orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar ordens nesta organização'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_chave := _prefixo || '-' || v_ano;

  INSERT INTO public.ops_sequencia (organization_id, chave, valor)
  VALUES (_org_id, v_chave, 1)
  ON CONFLICT (organization_id, chave)
  DO UPDATE SET valor = public.ops_sequencia.valor + 1
  RETURNING valor INTO v_valor;

  RETURN _prefixo || '-' || v_ano || '-' || lpad(v_valor::text, 5, '0');
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_proximo_codigo(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_proximo_codigo(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_proximo_codigo(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_proximo_codigo_interno(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_proximo_codigo_interno(_org_id uuid, _prefixo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_chave text := _prefixo || '-' || to_char(now(), 'YYYY');
  v_valor integer;
BEGIN
  INSERT INTO public.ops_sequencia (organization_id, chave, valor)
  VALUES (_org_id, v_chave, 1)
  ON CONFLICT (organization_id, chave)
  DO UPDATE SET valor = public.ops_sequencia.valor + 1
  RETURNING valor INTO v_valor;

  RETURN _prefixo || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_valor::text, 5, '0');
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_proximo_codigo_interno(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_proximo_codigo_interno(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_quem_sou(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_quem_sou(_org_id uuid)
 RETURNS TABLE(utilizador_id uuid, funcao text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_user   uuid;
  v_funcao text;
BEGIN
  v_user := public.current_business_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    public.is_system_admin_user(v_uid)
    OR _org_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.funcao INTO v_funcao FROM public.ops_utilizador_perfil p
   WHERE p.utilizador_id = v_user AND p.organization_id = _org_id AND p.ativo;

  IF v_funcao IS NULL THEN
    IF public.is_system_admin_user(v_uid) THEN v_funcao := 'admin';
    ELSE RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN QUERY SELECT v_user, v_funcao;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_quem_sou(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_quem_sou(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_quem_sou(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_recalcular_custo_mao_obra(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_recalcular_custo_mao_obra(_ordem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total     numeric(12,2) := 0;
  v_segundos  bigint := 0;
  v_sem_custo integer := 0;
  r           record;
BEGIN
  DELETE FROM public.ops_custo
   WHERE ordem_id = _ordem_id AND tipo = 'mao_obra' AND origem = 'calculado';

  FOR r IN
    SELECT s.utilizador_id,
           sum(EXTRACT(EPOCH FROM (COALESCE(s.fim, now()) - s.inicio)))::bigint AS segundos,
           max(p.custo_hora) AS custo_hora
      FROM public.ops_sessao_trabalho s
      JOIN public.ops_ordem o ON o.id = s.ordem_id
      LEFT JOIN public.ops_utilizador_perfil p
             ON p.utilizador_id = s.utilizador_id
            AND p.organization_id = o.organization_id
     WHERE s.ordem_id = _ordem_id
     GROUP BY s.utilizador_id
  LOOP
    v_segundos := v_segundos + GREATEST(r.segundos, 0);
    IF r.custo_hora IS NULL THEN
      IF r.segundos > 0 THEN v_sem_custo := v_sem_custo + 1; END IF;
    ELSE
      v_total := v_total + (GREATEST(r.segundos, 0) / 3600.0) * r.custo_hora;
    END IF;
  END LOOP;

  v_total := round(v_total, 2);

  IF v_segundos > 0 THEN
    INSERT INTO public.ops_custo (ordem_id, tipo, descricao, quantidade, valor_unit, total, origem)
    VALUES (_ordem_id, 'mao_obra',
            'Mão de obra — ' || to_char((v_segundos || ' seconds')::interval, 'HH24"h"MI"m"'),
            1, v_total, v_total, 'calculado');
  END IF;

  RETURN jsonb_build_object(
    'segundos', v_segundos,
    'total', v_total,
    'sem_custo_hora', v_sem_custo
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_recalcular_custo_mao_obra(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_recalcular_custo_mao_obra(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_relatorio_html(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_relatorio_html(_ordem_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o        record;
  v_cliente  text;
  v_local    text;
  v_linhas   text := '';
  v_as_nome  text;
  v_as_qual  text;
  v_as_em    timestamptz;
  v_nfoto    integer;
  r          record;
BEGIN
  SELECT o.*, l.nome AS local_nome, l.morada AS local_morada
    INTO v_o
    FROM public.ops_ordem o
    LEFT JOIN public.ops_local l ON l.id = o.local_id
   WHERE o.id = _ordem_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(nullif(btrim(e.display_name), ''), 'Cliente')
    INTO v_cliente
    FROM public.anew_clients cl
    JOIN public.anew_entities e ON e.id = cl.entity_id
   WHERE cl.id = v_o.cliente_id;

  v_local := COALESCE(
    nullif(btrim(concat_ws(' — ', v_o.local_nome, v_o.local_morada)), ''),
    '—'
  );

  FOR r IN
    SELECT t.nome, t.estado, t.unidade, t.valor_num, t.valor_texto, t.observacoes
      FROM public.ops_ordem_tarefa t
     WHERE t.ordem_id = _ordem_id
     ORDER BY t.posicao, t.nome
  LOOP
    v_linhas := v_linhas
      || '<tr>'
      || '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">'
      || ops_escapar_html(r.nome)
      || CASE WHEN nullif(btrim(COALESCE(r.observacoes, '')), '') IS NULL THEN ''
              ELSE '<br><span style="color:#64748b;font-size:12px">'
                   || ops_escapar_html(r.observacoes) || '</span>' END
      || '</td>'
      || '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap">'
      || ops_escapar_html(COALESCE(
           nullif(btrim(concat_ws(' ', ops_numero_legivel(r.valor_num), r.unidade)), ''),
           r.valor_texto,
           ''))
      || '</td>'
      || '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;'
      || CASE r.estado
           WHEN 'nao_conforme' THEN 'color:#b45309;font-weight:600'
           WHEN 'feita' THEN 'color:#047857'
           ELSE 'color:#64748b' END
      || '">'
      || CASE r.estado
           WHEN 'feita' THEN 'Conforme'
           WHEN 'nao_conforme' THEN 'Não conforme'
           WHEN 'nao_aplicavel' THEN 'Não aplicável'
           ELSE 'Por fazer' END
      || '</td></tr>';
  END LOOP;

  -- `db/assinaturas.sql` pode não estar instalado. Sem ele, o relatório sai
  -- na mesma — só sem a linha de quem recebeu.
  IF to_regclass('public.ops_assinatura') IS NOT NULL THEN
    EXECUTE 'SELECT nome, qualidade, assinada_em FROM public.ops_assinatura WHERE ordem_id = $1'
      INTO v_as_nome, v_as_qual, v_as_em USING _ordem_id;
  END IF;

  SELECT count(*) INTO v_nfoto
    FROM public.ops_anexo a
   WHERE a.ordem_id = _ordem_id;

  RETURN
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
    || 'color:#0f172a;max-width:640px;margin:0 auto;padding:8px">'
    || '<p style="font-size:12px;color:#64748b;margin:0 0 2px;font-family:monospace">'
    || ops_escapar_html(v_o.codigo) || '</p>'
    || '<h1 style="font-size:19px;margin:0 0 16px;line-height:1.3">'
    || ops_escapar_html(v_o.titulo) || '</h1>'

    || '<table style="border-collapse:collapse;font-size:14px;margin:0 0 20px">'
    || ops_linha_info('Cliente', v_cliente)
    || ops_linha_info('Onde', v_local)
    || ops_linha_info('Concluída em',
         to_char(COALESCE(v_o.fechada_em, v_o.confirmada_em), 'DD/MM/YYYY "às" HH24:MI'))
    || '</table>'

    || CASE WHEN v_linhas = '' THEN ''
       ELSE '<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;'
            || 'color:#64748b;margin:0 0 8px">O que foi feito</h2>'
            || '<table style="border-collapse:collapse;width:100%;font-size:14px;margin:0 0 20px">'
            || v_linhas || '</table>' END

    || CASE WHEN v_as_nome IS NULL THEN ''
       ELSE '<p style="font-size:14px;margin:0 0 20px;padding:10px 12px;background:#f8fafc;'
            || 'border-radius:8px">Recebido e aceite por <strong>'
            || ops_escapar_html(v_as_nome) || '</strong>'
            || CASE WHEN v_as_qual IS NULL THEN ''
                    ELSE ' (' || ops_escapar_html(v_as_qual) || ')' END
            || ', a ' || to_char(v_as_em, 'DD/MM/YYYY') || '.</p>' END

    || CASE WHEN COALESCE(v_nfoto, 0) = 0 THEN ''
       ELSE '<p style="font-size:13px;color:#64748b;margin:0 0 20px">Esta intervenção tem '
            || v_nfoto || CASE WHEN v_nfoto = 1 THEN ' ficheiro anexo' ELSE ' ficheiros anexos' END
            || '. Peça-nos e enviamos.</p>' END

    || '<p style="font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;'
    || 'margin:0">Este email foi enviado automaticamente ao concluir-se a intervenção. '
    || 'Para qualquer questão, responda a esta mensagem.</p>'
    || '</div>';
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_relatorio_html(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_relatorio_html(uuid) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_relatorio_html(uuid) TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_relatorio_html(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_relatorio_html(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_responder_medicao_impl(uuid, uuid, numeric, text, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_responder_medicao_impl(p_tarefa_id uuid, p_medicao_def_id uuid, p_valor_num numeric DEFAULT NULL::numeric, p_valor_texto text DEFAULT NULL::text, p_opcao_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_user       uuid;
  v_funcao     text;
  v_t          record;
  v_o          record;
  v_l          record;   -- a linha da leitura, já semeada ou a criar
  v_def        record;
  -- Escalares, e não um `record`: em plpgsql, referir um record por atribuir
  -- rebenta mesmo dentro de um ramo de CASE que não chega a ser seguido.
  v_opcao_nome text;
  v_opcao_ma   boolean;
  v_opcao_cria boolean;
  v_atribuido  boolean;
  v_conforme   boolean;
  v_anterior   numeric;
  v_texto      text := nullif(btrim(coalesce(p_valor_texto, '')), '');
  v_nova_cod   text;
  v_detalhe    text;
  v_unidade    text;
  v_por_ler    integer;
  v_mas        integer;
  v_estado_t   text;
BEGIN
  v_user := public.current_business_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_t FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = v_t.ordem_id;

  IF NOT (
    public.is_system_admin_user(v_uid)
    OR v_o.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = v_o.organization_id AND ativo;
  IF v_funcao IS NULL THEN
    IF public.is_system_admin_user(v_uid) THEN v_funcao := 'admin';
    ELSE RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_o.estado <> 'em_curso' THEN
    RAISE EXCEPTION 'Só se lê numa ordem em curso (esta está %).',
      replace(v_o.estado, '_', ' ');
  END IF;

  -- COALESCE: numa ordem sem responsável, `NULL = x` dá NULL, e `NOT NULL`
  -- não recusa nada — um técnico de fora passava (auditoria 01/10/2026).
  v_atribuido := COALESCE(v_o.responsavel_id = v_user, false)
    OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                WHERE ordem_id = v_o.id AND utilizador_id = v_user);
  IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
    RAISE EXCEPTION 'Só quem está na ordem pode registar leituras.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── a linha da leitura ───────────────────────────────────────────────
  -- Normalmente já existe, semeada quando a ordem nasceu, com os limites
  -- congelados. Se não existir (medição acrescentada à mão a uma ordem já
  -- aberta), copia-se a definição agora — e é esse instante que fica gravado.
  SELECT * INTO v_l FROM public.ops_ordem_tarefa_medicao
   WHERE ordem_tarefa_id = p_tarefa_id AND medicao_def_id = p_medicao_def_id;

  IF NOT FOUND THEN
    SELECT * INTO v_def FROM public.ops_medicao_def
     WHERE id = p_medicao_def_id AND organization_id = v_o.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Medição desconhecida nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;

    INSERT INTO public.ops_ordem_tarefa_medicao (
      ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
    VALUES (p_tarefa_id, p_medicao_def_id, v_def.nome, v_def.tipo, v_def.unidade,
            v_def.limite_min, v_def.limite_max)
    RETURNING * INTO v_l;
  END IF;

  -- ── o que a leitura tem de trazer ────────────────────────────────────
  -- Recusar cedo e por escrito é melhor do que gravar uma linha vazia que
  -- depois ninguém sabe interpretar.
  IF v_l.tipo IN ('gama','acumulado') AND p_valor_num IS NULL THEN
    RAISE EXCEPTION '"%" espera um valor numérico.', v_l.nome;
  END IF;

  IF v_l.tipo = 'escolha' THEN
    IF p_opcao_id IS NULL THEN
      RAISE EXCEPTION '"%" espera que se escolha uma opção.', v_l.nome;
    END IF;
    SELECT nome, e_nao_conforme, cria_corretiva
      INTO v_opcao_nome, v_opcao_ma, v_opcao_cria
      FROM public.ops_medicao_opcao
     WHERE id = p_opcao_id AND medicao_def_id = p_medicao_def_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Essa opção não pertence a "%".', v_l.nome;
    END IF;
  END IF;

  IF v_l.tipo = 'texto' AND v_texto IS NULL THEN
    RAISE EXCEPTION '"%" espera texto.', v_l.nome;
  END IF;

  -- Um contador não anda para trás. Se andou, ou se leu mal ou o equipamento
  -- foi substituído — nos dois casos alguém tem de olhar, e não é o software
  -- que decide sozinho.
  IF v_l.tipo = 'acumulado' THEN
    SELECT m.valor_num INTO v_anterior
      FROM public.ops_ordem_tarefa_medicao m
      JOIN public.ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
      JOIN public.ops_ordem_alvo a   ON a.id = t.ordem_alvo_id
     WHERE m.medicao_def_id = p_medicao_def_id
       AND m.lida_em IS NOT NULL
       AND m.ordem_tarefa_id <> p_tarefa_id
       AND a.ativo_id IS NOT DISTINCT FROM (
             SELECT ativo_id FROM public.ops_ordem_alvo WHERE id = v_t.ordem_alvo_id)
     ORDER BY m.lida_em DESC
     LIMIT 1;

    IF v_anterior IS NOT NULL AND p_valor_num < v_anterior THEN
      RAISE EXCEPTION 'Um contador não desce. "%" estava em %, e leu-se %.',
        v_l.nome, v_anterior, p_valor_num;
    END IF;
  END IF;

  v_conforme := public.ops_avaliar_leitura(
    v_l.tipo, p_valor_num, v_l.limite_min, v_l.limite_max,
    v_opcao_ma);

  UPDATE public.ops_ordem_tarefa_medicao SET
    valor_num   = CASE WHEN v_l.tipo IN ('gama','acumulado') THEN p_valor_num ELSE valor_num END,
    valor_texto = COALESCE(v_texto, valor_texto),
    opcao_id    = CASE WHEN v_l.tipo = 'escolha' THEN p_opcao_id ELSE opcao_id END,
    conforme    = v_conforme,
    lida_em     = now(),
    lida_por    = v_user
  WHERE id = v_l.id;

  -- ── a corretiva ──────────────────────────────────────────────────────
  -- Uma leitura gera trabalho uma vez. Corrigir um engano de dedo, ou piorar
  -- de "ilegível" para "não conforme", não abre uma segunda ordem sobre a
  -- mesma leitura.
  --
  -- Numa gama, sair dos limites é sempre motivo. Numa escolha, quem manda é a
  -- caixa da opção: há opções que assinalam um problema sem exigir trabalho.
  IF v_conforme IS FALSE AND v_l.corretiva_ordem_id IS NULL THEN
    IF v_l.tipo = 'gama' OR (v_l.tipo = 'escolha' AND v_opcao_cria) THEN
      v_unidade := CASE WHEN v_l.unidade IS NOT NULL THEN ' ' || v_l.unidade ELSE '' END;

      IF v_l.tipo = 'gama' THEN
        v_detalhe := v_l.nome || ': ' || p_valor_num || v_unidade
          || ' ('
          || concat_ws(', ',
               CASE WHEN v_l.limite_min IS NOT NULL THEN 'mín. ' || v_l.limite_min || v_unidade END,
               CASE WHEN v_l.limite_max IS NOT NULL THEN 'máx. ' || v_l.limite_max || v_unidade END)
          || ').';
      ELSE
        v_detalhe := v_l.nome || ': ' || v_opcao_nome || '.';
      END IF;

      IF v_texto IS NOT NULL THEN
        v_detalhe := v_detalhe || E'\n' || 'Nota do técnico: ' || v_texto;
      END IF;

      v_nova_cod := public.ops_criar_corretiva(p_tarefa_id, v_detalhe, v_user);

      UPDATE public.ops_ordem_tarefa_medicao
         SET corretiva_ordem_id = (SELECT id FROM public.ops_ordem WHERE codigo = v_nova_cod)
       WHERE id = v_l.id;
    END IF;
  END IF;

  -- ── a tarefa acerta-se sozinha ───────────────────────────────────────
  -- Enquanto faltarem leituras, a tarefa fica como está. Quando a última
  -- entra, o veredicto sai das leituras: uma não conforme chega para a tarefa
  -- ficar não conforme.
  SELECT count(*) FILTER (WHERE lida_em IS NULL),
         count(*) FILTER (WHERE conforme IS false)
    INTO v_por_ler, v_mas
    FROM public.ops_ordem_tarefa_medicao
   WHERE ordem_tarefa_id = p_tarefa_id;

  v_estado_t := v_t.estado;
  IF v_por_ler = 0 THEN
    v_estado_t := CASE WHEN v_mas > 0 THEN 'nao_conforme' ELSE 'feita' END;

    IF v_estado_t <> v_t.estado THEN
      PERFORM set_config('ops.tarefa', 'autorizada', true);
      UPDATE public.ops_ordem_tarefa
         SET estado = v_estado_t,
             executada_por = v_user,
             inicio = COALESCE(inicio, now()),
             fim = now()
       WHERE id = p_tarefa_id;
      PERFORM set_config('ops.tarefa', '', true);
    END IF;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'tarefa', p_tarefa_id, 'medicao', v_l.nome, v_user,
     jsonb_build_object('conforme', v_l.conforme),
     jsonb_build_object('conforme', v_conforme, 'valor_num', p_valor_num,
                        'valor_texto', v_texto, 'opcao_id', p_opcao_id));

  RETURN jsonb_build_object(
    'ok', true,
    'conforme', v_conforme,
    'por_ler', v_por_ler,
    'estado_tarefa', v_estado_t,
    'corretiva_gerada', v_nova_cod
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_responder_medicao_impl(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_responder_medicao_impl(uuid, uuid, numeric, text, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_responder_tarefa_impl(uuid, text, numeric, text, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_responder_tarefa_impl(p_tarefa_id uuid, p_estado text DEFAULT NULL::text, p_valor_num numeric DEFAULT NULL::numeric, p_valor_texto text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_user       uuid;
  v_funcao     text;
  v_t          record;
  v_o          record;
  v_atribuido  boolean;
  v_estado     text;
  v_agora      timestamptz := now();
  v_obs        text := nullif(btrim(coalesce(p_observacoes, '')), '');
  v_nova_cod   text;
  v_descricao  text;
  v_unidade    text;
BEGIN
  v_user := public.current_business_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_t FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = v_t.ordem_id;

  IF NOT (
    public.is_system_admin_user(v_uid)
    OR v_o.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = v_o.organization_id AND ativo;
  IF v_funcao IS NULL THEN
    IF public.is_system_admin_user(v_uid) THEN v_funcao := 'admin';
    ELSE RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Responder é executar. Só se executa uma ordem em curso: numa fechada
  -- estaríamos a reescrever o que já foi dado por feito.
  IF v_o.estado <> 'em_curso' THEN
    RAISE EXCEPTION 'Só se responde a tarefas de uma ordem em curso (esta está %).',
      replace(v_o.estado, '_', ' ');
  END IF;

  -- COALESCE: numa ordem sem responsável, `NULL = x` dá NULL, e `NOT NULL`
  -- não recusa nada — um técnico de fora passava (auditoria 01/10/2026).
  v_atribuido := COALESCE(v_o.responsavel_id = v_user, false)
    OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                WHERE ordem_id = v_o.id AND utilizador_id = v_user);
  IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
    RAISE EXCEPTION 'Só quem está na ordem pode responder às tarefas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── o veredicto ──────────────────────────────────────────────────────
  -- Uma tarefa com limites decide-se sozinha; nas outras vale o que o
  -- técnico disser. O critério é ter limites, não o tipo: depois de separar
  -- a natureza do trabalho do formato da resposta, uma 'correcao' também
  -- pode pedir um valor com gama de aceitação.
  IF (v_t.limite_min IS NOT NULL OR v_t.limite_max IS NOT NULL)
     AND p_valor_num IS NOT NULL THEN
    v_estado := public.ops_avaliar_medicao(p_valor_num, v_t.limite_min, v_t.limite_max);
  ELSE
    v_estado := p_estado;
  END IF;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Falta dizer o estado da tarefa.';
  END IF;
  IF v_estado NOT IN ('pendente','feita','nao_conforme','nao_aplicavel') THEN
    RAISE EXCEPTION 'Estado de tarefa inválido: %', v_estado;
  END IF;

  UPDATE public.ops_ordem_tarefa SET
    estado        = v_estado,
    valor_num     = COALESCE(p_valor_num, valor_num),
    valor_texto   = COALESCE(p_valor_texto, valor_texto),
    observacoes   = COALESCE(v_obs, observacoes),
    executada_por = v_user,
    inicio        = COALESCE(inicio, v_agora),
    fim           = CASE WHEN v_estado = 'pendente' THEN NULL ELSE v_agora END
  WHERE id = p_tarefa_id;

  -- ── a corretiva ──────────────────────────────────────────────────────
  -- Só quando a tarefa PASSA a não conforme. Responder duas vezes à mesma
  -- tarefa não gera duas ordens.
  IF v_estado = 'nao_conforme' AND v_t.estado <> 'nao_conforme' THEN
    v_unidade := CASE WHEN v_t.unidade IS NOT NULL THEN ' ' || v_t.unidade ELSE '' END;
    v_descricao := NULL;

    IF p_valor_num IS NOT NULL THEN
      v_descricao := 'Valor lido: ' || p_valor_num || v_unidade;
      IF v_t.limite_min IS NOT NULL OR v_t.limite_max IS NOT NULL THEN
        v_descricao := v_descricao || ' ('
          || concat_ws(', ',
               CASE WHEN v_t.limite_min IS NOT NULL THEN 'mín. ' || v_t.limite_min || v_unidade END,
               CASE WHEN v_t.limite_max IS NOT NULL THEN 'máx. ' || v_t.limite_max || v_unidade END)
          || ')';
      END IF;
      v_descricao := v_descricao || '.';
    END IF;

    IF v_obs IS NOT NULL THEN
      v_descricao := concat_ws(E'
', v_descricao, 'Observações do técnico: ' || v_obs);
    END IF;

    v_nova_cod := public.ops_criar_corretiva(p_tarefa_id, v_descricao, v_user);
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'tarefa', p_tarefa_id, 'responder', v_obs, v_user,
     jsonb_build_object('estado', v_t.estado),
     jsonb_build_object('estado', v_estado, 'valor_num', p_valor_num));

  RETURN jsonb_build_object(
    'ok', true,
    'estado', v_estado,
    'avaliada_automaticamente',
      ((v_t.limite_min IS NOT NULL OR v_t.limite_max IS NOT NULL)
       AND p_valor_num IS NOT NULL),
    'corretiva_gerada', v_nova_cod
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_responder_tarefa_impl(uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_responder_tarefa_impl(uuid, text, numeric, text, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_semear_listas(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_semear_listas(_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pausas integer := 0;
  v_areas  integer := 0;
BEGIN
  -- Os oito da instância, com as funções que lá têm. Três deles são decisões
  -- de quem gere, e por isso não ficam à mão do técnico.
  IF NOT EXISTS (SELECT 1 FROM public.ops_motivo_pausa WHERE organization_id = _org_id) THEN
    INSERT INTO public.ops_motivo_pausa (organization_id, nome, posicao, funcoes, exige_retoma)
    VALUES
      (_org_id, 'A aguardar material',            1, ARRAY['admin','gestor','operador','tecnico'], true),
      (_org_id, 'A aguardar visita técnica',      2, ARRAY['admin','gestor','operador','tecnico'], true),
      (_org_id, 'A resolver na próxima visita',   3, ARRAY['admin','gestor','operador','tecnico'], true),
      (_org_id, 'A aguardar orçamento',           4, ARRAY['admin','gestor','operador'],           true),
      (_org_id, 'A aguardar adjudicação',         5, ARRAY['admin','gestor','operador'],           true),
      (_org_id, 'A aguardar aprovação superior',  6, ARRAY['admin','gestor'],                      true),
      (_org_id, 'Em lista de espera',             7, ARRAY['admin','gestor','operador'],           true),
      (_org_id, 'Outro',                          8, ARRAY['admin','gestor','operador','tecnico'], true);
    GET DIAGNOSTICS v_pausas = ROW_COUNT;
  END IF;

  -- As dez áreas que se viram. Podem faltar: o ecrã deixa acrescentar.
  IF NOT EXISTS (SELECT 1 FROM public.ops_area WHERE organization_id = _org_id) THEN
    INSERT INTO public.ops_area (organization_id, nome, posicao)
    SELECT _org_id, nome, ordinality
      FROM unnest(ARRAY[
        'Acompanhamento', 'Águas e esgotos', 'Alarme e deteção', 'Ar condicionado',
        'Climatização', 'Cobertura', 'Computadores e telemóveis', 'Decoração',
        'Eletricidade', 'Elevadores'
      ]) WITH ORDINALITY AS t(nome, ordinality);
    GET DIAGNOSTICS v_areas = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('pausas', v_pausas, 'areas', v_areas);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_semear_listas(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_semear_listas(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_semear_listas(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_semear_tipos_trabalho(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_semear_tipos_trabalho(_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.ops_tipo_trabalho WHERE organization_id = _org_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.ops_tipo_trabalho
    (organization_id, codigo, nome, posicao, fecha_automatico)
  VALUES
    -- `fecha_automatico` ligado só onde o trabalho é repetitivo e curto: uma
    -- rotina cumprida é uma rotina fechada. Uma obra não.
    (_org_id, 'PMP',       'Preventiva',             1, false),
    (_org_id, 'ROT',       'Rotina',                 2, true),
    (_org_id, 'PMP',       'Ponto zero',             3, false),
    (_org_id, 'AUDIT',     'Auditoria',              4, false),
    (_org_id, 'MELHORIA',  'Melhoria',               5, false),
    (_org_id, 'INST',      'Instalação',             6, false),
    (_org_id, 'SPECIAL',   'Obra',                   7, false),
    (_org_id, 'PMP',       'Remodelação',            8, false),
    (_org_id, 'ACOMP.EXT', 'Acompanhamento Externo', 9, false);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_semear_tipos_trabalho(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_semear_tipos_trabalho(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_semear_tipos_trabalho(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_sessao_abrir(uuid, uuid, uuid, timestamp with time zone)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_sessao_abrir(_ordem_id uuid, _user uuid, _tarefa_id uuid DEFAULT NULL::uuid, _agora timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.ops_sessao_trabalho
   WHERE ordem_id = _ordem_id AND utilizador_id = _user AND fim IS NULL
     AND ordem_tarefa_id IS NOT DISTINCT FROM _tarefa_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;     -- já está a contar nisso mesmo
  END IF;

  PERFORM public.ops_sessao_fechar(_ordem_id, _user, 'troca', _agora);

  INSERT INTO public.ops_sessao_trabalho (ordem_id, utilizador_id, inicio, origem, ordem_tarefa_id)
  VALUES (_ordem_id, _user, _agora, 'web', _tarefa_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_sessao_abrir(uuid, uuid, uuid, timestamp with time zone) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_sessao_abrir(uuid, uuid, uuid, timestamp with time zone) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_sessao_fechar(uuid, uuid, text, timestamp with time zone)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_sessao_fechar(_ordem_id uuid, _user uuid, _motivo text, _agora timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_n integer;
BEGIN
  UPDATE public.ops_sessao_trabalho
     SET fim = GREATEST(_agora, inicio), motivo_fim = _motivo
   WHERE ordem_id = _ordem_id AND fim IS NULL
     AND (_user IS NULL OR utilizador_id = _user);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_sessao_fechar(uuid, uuid, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_sessao_fechar(uuid, uuid, text, timestamp with time zone) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_stock_calcular(uuid, uuid[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_stock_calcular(p_org uuid, p_produtos uuid[])
 RETURNS TABLE(produto_id uuid, nome text, sku text, unidade text, gere_stock boolean, fisico numeric, reservado numeric, a_chegar numeric, disponivel numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_unidade text := 'NULL::text';
  v_join    text := '';
  v_res     text := 'SELECT NULL::uuid AS product_id, 0::numeric AS q WHERE false';
  v_chega   text := 'SELECT NULL::uuid AS product_id, 0::numeric AS q WHERE false';
BEGIN
  IF p_org IS NULL OR p_produtos IS NULL OR cardinality(p_produtos) = 0
     OR NOT public.ops_stock_ha_inventario() THEN
    RETURN;
  END IF;

  IF public.ops_stock_tem('products', ARRAY['uom_id'])
     AND public.ops_stock_tem('uom', ARRAY['id','code']) THEN
    v_unidade := 'u.code::text';
    v_join    := 'LEFT JOIN public.uom u ON u.id = p.uom_id';
  END IF;

  -- Reservas das ECs: a função do CRM, tal e qual.
  IF to_regprocedure('public.fn_client_order_line_reservations(uuid,uuid[])') IS NOT NULL THEN
    v_res := 'SELECT r.product_id, SUM(COALESCE(r.qty_reserved, 0))::numeric AS q
                FROM public.fn_client_order_line_reservations($1, ARRAY(SELECT id FROM prod)) r
               WHERE r.product_id IS NOT NULL
               GROUP BY r.product_id';
  END IF;

  IF public.ops_stock_tem('purchase_orders', ARRAY['id','organization_id','status','deleted_at','source_type'])
     AND public.ops_stock_tem('purchase_order_items', ARRAY['purchase_order_id','product_id','quantity','received_quantity','units_per_uom']) THEN
    v_chega := 'SELECT poi.product_id,
                       SUM(GREATEST(0, poi.quantity - COALESCE(poi.received_quantity, 0))
                           * COALESCE(poi.units_per_uom, 1))::numeric AS q
                  FROM public.purchase_orders po
                  JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
                 WHERE po.organization_id = $1
                   AND po.deleted_at IS NULL
                   AND po.status IN (''pending'', ''ordered'', ''partially_received'')
                   AND po.source_type IS DISTINCT FROM ''contract''
                   AND poi.product_id IN (SELECT id FROM prod)
                 GROUP BY poi.product_id';
  END IF;

  RETURN QUERY EXECUTE format($q$
    WITH prod AS (
      SELECT p.id, p.name::text AS nome, NULLIF(p.sku::text, '') AS sku,
             %1$s AS unidade, COALESCE(p.manages_stock, true) AS gere
        FROM public.products p
        %2$s
       WHERE p.id = ANY ($2)
         AND p.deleted_at IS NULL
         AND %3$s
    ),
    fis AS (
      SELECT s.product_id, SUM(s.quantity)::numeric AS q
        FROM public.stocks s
        JOIN public.warehouses w ON w.id = s.warehouse_id
       WHERE w.organization_id = $1
         AND w.deleted_at IS NULL
         AND s.deleted_at IS NULL
         AND s.product_id IN (SELECT id FROM prod)
       GROUP BY s.product_id
    ),
    res   AS (%4$s),
    chega AS (%5$s)
    SELECT pr.id, pr.nome, pr.sku, pr.unidade, pr.gere,
           COALESCE(f.q, 0), COALESCE(r.q, 0), COALESCE(c.q, 0),
           CASE WHEN pr.gere THEN COALESCE(f.q, 0) - COALESCE(r.q, 0) END
      FROM prod pr
      LEFT JOIN fis   f ON f.product_id = pr.id
      LEFT JOIN res   r ON r.product_id = pr.id
      LEFT JOIN chega c ON c.product_id = pr.id
  $q$, v_unidade, v_join, public.ops_stock_filtro_org(), v_res, v_chega)
  USING p_org, p_produtos;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_stock_calcular(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_stock_calcular(uuid, uuid[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_stock_filtro_org()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_stock_filtro_org()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN public.ops_stock_tem('product_organizations', ARRAY['product_id','organization_id']) THEN
      '(p.organization_id = $1 OR EXISTS (SELECT 1 FROM public.product_organizations po_'
      || ' WHERE po_.product_id = p.id AND po_.organization_id = $1))'
    ELSE 'p.organization_id = $1'
  END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_stock_filtro_org() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_stock_filtro_org() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_stock_ha_inventario()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_stock_ha_inventario()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.ops_stock_tem('products',   ARRAY['id','name','sku','organization_id','deleted_at','manages_stock'])
     AND public.ops_stock_tem('stocks',     ARRAY['product_id','warehouse_id','quantity','deleted_at'])
     AND public.ops_stock_tem('warehouses', ARRAY['id','organization_id','deleted_at'])
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_stock_ha_inventario() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_stock_ha_inventario() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_stock_tem(text, text[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_stock_tem(p_tabela text, p_colunas text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT to_regclass('public.' || p_tabela) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM unnest(p_colunas) c(nome)
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_attribute a
           WHERE a.attrelid = to_regclass('public.' || p_tabela)
             AND a.attname = c.nome AND a.attnum > 0 AND NOT a.attisdropped))
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_stock_tem(text, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_stock_tem(text, text[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_stock_verificar(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_stock_verificar(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_org IS NULL OR NOT public.ops_pode(p_org, 'operations.view') THEN
    RAISE EXCEPTION 'Sem acesso ao stock desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_stock_verificar(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_stock_verificar(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_tarefa_tempo_antes()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_tarefa_tempo_antes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado <> 'pendente' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.inicio := COALESCE(
      (SELECT min(s.inicio) FROM public.ops_sessao_trabalho s WHERE s.ordem_tarefa_id = NEW.id),
      OLD.inicio, NEW.inicio);
  END IF;
  RETURN NEW;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_tarefa_tempo_antes() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_tarefa_tempo_antes() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_tarefa_tempo_depois()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_tarefa_tempo_depois()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r       record;
  v_agora timestamptz := now();
  v_curso boolean;
BEGIN
  IF NEW.estado = 'pendente' OR NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NULL;
  END IF;

  SELECT estado = 'em_curso' INTO v_curso FROM public.ops_ordem WHERE id = NEW.ordem_id;

  FOR r IN
    UPDATE public.ops_sessao_trabalho
       SET fim = GREATEST(v_agora, inicio), motivo_fim = 'tarefa'
     WHERE ordem_tarefa_id = NEW.id AND fim IS NULL
    RETURNING utilizador_id
  LOOP
    IF v_curso THEN
      INSERT INTO public.ops_sessao_trabalho (ordem_id, utilizador_id, inicio, origem)
      VALUES (NEW.ordem_id, r.utilizador_id, v_agora, 'web')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NULL;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_tarefa_tempo_depois() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_tarefa_tempo_depois() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.ops_valores_da_lista(text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.ops_valores_da_lista(_lista text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _lista
    WHEN 'prioridade'  THEN ARRAY['baixa','normal','alta','urgente']
    WHEN 'criticidade' THEN ARRAY['baixa','normal','alta','critica']
    WHEN 'tipo_tarefa' THEN ARRAY['inspecao','correcao','limpeza','proacao','substituicao']
    WHEN 'tipo_local'  THEN ARRAY['morada','edificio','piso','espaco']
    WHEN 'origem'      THEN ARRAY['preventiva','corretiva','obra']
    ELSE NULL
  END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.ops_valores_da_lista(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_valores_da_lista(text) TO PUBLIC;
    GRANT EXECUTE ON FUNCTION public.ops_valores_da_lista(text) TO anon;
    GRANT EXECUTE ON FUNCTION public.ops_valores_da_lista(text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.ops_valores_da_lista(text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_acrescentar_tarefa(uuid, text, text, boolean, text, numeric, numeric, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_acrescentar_tarefa(p_ordem_id uuid, p_nome text, p_tipo text DEFAULT 'inspecao'::text, p_obrigatoria boolean DEFAULT true, p_unidade text DEFAULT NULL::text, p_limite_min numeric DEFAULT NULL::numeric, p_limite_max numeric DEFAULT NULL::numeric, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_user    uuid;
  v_funcao  text;
  v_o       record;
  v_alvo    uuid;
  v_pos     integer;
  v_tipo    text;
  v_nome    text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id      uuid;
BEGIN
  v_user := public.current_business_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'A tarefa precisa de um nome — é o que o técnico vai ler no telemóvel.';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Essa ordem não existe.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    public.is_system_admin_user(v_uid)
    OR v_o.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = v_o.organization_id AND ativo;
  IF v_funcao IS NULL THEN
    IF public.is_system_admin_user(v_uid) THEN v_funcao := 'admin';
    ELSE RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Uma ordem fechada é uma fotografia do que aconteceu. Acrescentar trabalho
  -- depois de a fechar é reescrever o passado — e o relatório do cliente já
  -- pode ter saído.
  IF v_o.estado IN ('fechada', 'confirmada', 'cancelada') THEN
    RAISE EXCEPTION 'Esta ordem já está %. Reabre-a, ou abre uma ordem nova.', v_o.estado;
  END IF;

  -- Limites sem número não querem dizer nada, e um número sem limites é uma
  -- leitura sem veredicto — que também é legítima (um contador, por exemplo).
  v_tipo := coalesce(nullif(btrim(p_tipo), ''), 'inspecao');
  IF p_limite_min IS NOT NULL OR p_limite_max IS NOT NULL THEN
    v_tipo := 'numero';
  END IF;
  IF v_tipo NOT IN ('inspecao','medicao','numero','texto','foto','assinatura') THEN
    RAISE EXCEPTION 'Feitio de tarefa desconhecido: %.', v_tipo;
  END IF;

  IF p_limite_min IS NOT NULL AND p_limite_max IS NOT NULL
     AND p_limite_min > p_limite_max THEN
    RAISE EXCEPTION 'O mínimo não pode ser maior do que o máximo.';
  END IF;

  -- Vai para o fim da lista, e junto ao mesmo alvo das outras: uma tarefa
  -- pendurada noutro sítio aparecia sozinha num grupo só dela.
  SELECT COALESCE(max(posicao), 0) + 1 INTO v_pos
    FROM public.ops_ordem_tarefa WHERE ordem_id = p_ordem_id;

  SELECT id INTO v_alvo FROM public.ops_ordem_alvo
   WHERE ordem_id = p_ordem_id ORDER BY id LIMIT 1;

  INSERT INTO public.ops_ordem_tarefa
    (ordem_id, ordem_alvo_id, posicao, nome, tipo, obrigatoria,
     unidade, limite_min, limite_max, observacoes)
  VALUES
    (p_ordem_id, v_alvo, v_pos, v_nome, v_tipo, coalesce(p_obrigatoria, true),
     nullif(btrim(coalesce(p_unidade, '')), ''), p_limite_min, p_limite_max,
     nullif(btrim(coalesce(p_observacoes, '')), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'tarefa_acrescentada',
     v_nome, v_user,
     jsonb_build_object('tarefa_id', v_id, 'tipo', v_tipo,
                        'unidade', p_unidade,
                        'limite_min', p_limite_min, 'limite_max', p_limite_max));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'tipo', v_tipo, 'posicao', v_pos);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_acrescentar_tarefa(uuid, text, text, boolean, text, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_acrescentar_tarefa(uuid, text, text, boolean, text, numeric, numeric, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_acrescentar_tarefa(uuid, text, text, boolean, text, numeric, numeric, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_agenda_do_dia(uuid, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_agenda_do_dia(_org_id uuid, _dia date)
 RETURNS TABLE(utilizador_id uuid, tipo text, detalhe text, desde date, ate date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.current_business_user_id();
  v_p    record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Alias obrigatório: `utilizador_id` é ao mesmo tempo uma coluna desta tabela
  -- e um parâmetro de saída do RETURNS TABLE. Sem qualificar, o plpgsql recusa
  -- a função por referência ambígua — e só na primeira vez que é chamada.
  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil eu
     WHERE eu.utilizador_id = v_user AND eu.organization_id = _org_id AND eu.ativo
       AND eu.funcao IN ('admin', 'gestor', 'operador')
  ) AND NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Só quem coordena vê a agenda da equipa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_p IN
    SELECT up.utilizador_id
      FROM public.ops_utilizador_perfil up
     WHERE up.organization_id = _org_id AND up.ativo
  LOOP
    RETURN QUERY
    SELECT v_p.utilizador_id, d.tipo, d.detalhe, d.desde, d.ate
      FROM public.ops_disponibilidade(
             v_p.utilizador_id, _org_id,
             (_dia + time '00:00')::timestamptz,
             (_dia + time '23:59')::timestamptz) d;
  END LOOP;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_agenda_do_dia(uuid, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_agenda_do_dia(uuid, date) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_agenda_do_dia(uuid, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_agenda_periodo(uuid, date, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_agenda_periodo(_org_id uuid, _de date, _ate date)
 RETURNS TABLE(utilizador_id uuid, dia date, tipo text, detalhe text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.current_business_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil eu
     WHERE eu.utilizador_id = v_user AND eu.organization_id = _org_id AND eu.ativo
       AND eu.funcao IN ('admin', 'gestor', 'operador')
  ) AND NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Só quem coordena vê a agenda da equipa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Um período aberto podia ser uma varredura enorme. Um mês mais folga chega.
  IF _ate - _de > 62 THEN
    RAISE EXCEPTION 'Período demasiado longo: % dias. O máximo são 62.', _ate - _de;
  END IF;

  IF to_regclass('public.schedule_resources') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH equipa AS (
    SELECT up.utilizador_id, sr.id AS recurso_id
      FROM public.ops_utilizador_perfil up
      LEFT JOIN public.schedule_resources sr
        ON sr.user_id = up.utilizador_id
       AND (sr.organization_id = _org_id OR sr.organization_id IS NULL)
       AND COALESCE(sr.is_active, true)
     WHERE up.organization_id = _org_id AND up.ativo
  ),
  dias AS (SELECT d::date AS dia FROM generate_series(_de, _ate, interval '1 day') d)

  -- Feriados: de toda a gente, mesmo de quem ainda não está na agenda do CRM.
  SELECT e.utilizador_id, h.holiday_date, 'feriado'::text, h.name::text
    FROM equipa e
    JOIN public.schedule_holidays h
      ON h.holiday_date BETWEEN _de AND _ate
     AND (h.organization_id = _org_id OR h.organization_id IS NULL)

  UNION ALL

  -- Ausências aprovadas. Ver a nota de privacidade no topo: só datas.
  SELECT e.utilizador_id, d.dia, 'ausente'::text, 'Ausência marcada e aprovada'::text
    FROM equipa e
    JOIN public.resource_time_off t ON t.resource_id = e.recurso_id
    JOIN dias d ON d.dia BETWEEN t.start_date AND t.end_date
   WHERE COALESCE(t.approved, false)

  UNION ALL

  -- Dias da semana em que a pessoa não trabalha. Só para quem TEM horário
  -- declarado — sem regras nenhumas, o silêncio quer dizer "não sabemos".
  SELECT e.utilizador_id, d.dia, 'fora_de_horario'::text,
         'Não trabalha neste dia'::text
    FROM equipa e
    CROSS JOIN dias d
   WHERE EXISTS (SELECT 1 FROM public.resource_availability_rules r
                  WHERE r.resource_id = e.recurso_id AND COALESCE(r.is_available, true))
     AND NOT EXISTS (
       SELECT 1 FROM public.resource_availability_rules r
        WHERE r.resource_id = e.recurso_id
          AND COALESCE(r.is_available, true)
          AND r.day_of_week = EXTRACT(dow FROM d.dia)::int
          AND (r.valid_from  IS NULL OR r.valid_from  <= d.dia)
          AND (r.valid_until IS NULL OR r.valid_until >= d.dia));
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_agenda_periodo(uuid, date, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_agenda_periodo(uuid, date, date) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_agenda_periodo(uuid, date, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_agendar_ordem(uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_agendar_ordem(p_ordem_id uuid, p_agendada_para timestamp with time zone, p_janela_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_janela_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user      uuid;
  v_funcao    text;
  v_o         record;
  v_conflitos jsonb := '[]'::jsonb;
  v_ini       timestamptz;
  v_fim       timestamptz;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF v_funcao = 'tecnico' THEN
    RAISE EXCEPTION 'Só quem coordena marca as datas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.ops_pode(v_o.organization_id, 'operations.orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('fechada','confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se agenda uma ordem % — o trabalho já acabou.',
      replace(v_o.estado, '_', ' ');
  END IF;

  IF p_agendada_para IS NULL THEN
    RAISE EXCEPTION 'Falta a data.';
  END IF;

  IF p_janela_inicio IS NOT NULL AND p_janela_fim IS NOT NULL
     AND p_janela_fim <= p_janela_inicio THEN
    RAISE EXCEPTION 'A janela de visita acaba antes de começar.';
  END IF;

  v_ini := COALESCE(p_janela_inicio, p_agendada_para);
  v_fim := COALESCE(p_janela_fim, v_ini + interval '1 hour');

  UPDATE public.ops_ordem
     SET agendada_para = p_agendada_para,
         janela_inicio = p_janela_inicio,
         janela_fim    = p_janela_fim,
         atualizada_em = now()
   WHERE id = p_ordem_id;

  -- Os conflitos só se procuram dentro desta organização: a agenda de uma
  -- pessoa noutra empresa não é da conta de quem marca aqui.
  IF v_o.responsavel_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'codigo', c.codigo, 'titulo', c.titulo, 'agendada_para', c.agendada_para)), '[]'::jsonb)
      INTO v_conflitos
      FROM public.ops_conflitos_de_agenda(v_o.responsavel_id, v_ini, v_fim, p_ordem_id) c
      JOIN public.ops_ordem x ON x.id = c.ordem_id
     WHERE x.organization_id = v_o.organization_id;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'agendada',
     to_char(p_agendada_para, 'YYYY-MM-DD HH24:MI'), v_user,
     jsonb_build_object('agendada_para', v_o.agendada_para),
     jsonb_build_object('agendada_para', p_agendada_para,
                        'janela_inicio', p_janela_inicio,
                        'janela_fim', p_janela_fim,
                        'conflitos', jsonb_array_length(v_conflitos)));

  RETURN jsonb_build_object(
    'ok', true,
    'agendada_para', p_agendada_para,
    'conflitos', v_conflitos
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_agendar_ordem(uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_agendar_ordem(uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_agendar_ordem(uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_assinar_ordem(uuid, text, text, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_assinar_ordem(p_ordem_id uuid, p_caminho text, p_nome text, p_qualidade text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_user     uuid := public.current_business_user_id();
  v_o        record;
  v_funcao   text;
  v_esperado text;
  v_antes    text;
  v_nome     text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    public.is_system_admin_user(v_uid)
    OR v_o.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = v_o.organization_id AND ativo;

  IF v_funcao IS NULL AND NOT public.is_system_admin_user(v_uid) THEN
    RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Um técnico só recolhe a assinatura das ordens em que esteve. Foi ele que
  -- lá foi; quem não foi não tem o cliente à frente para assinar.
  IF v_funcao = 'tecnico'
     AND v_o.responsavel_id IS DISTINCT FROM v_user
     AND NOT EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                      WHERE ordem_id = p_ordem_id AND utilizador_id = v_user) THEN
    RAISE EXCEPTION 'Só quem esteve na ordem recolhe a assinatura.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado <> 'fechada' THEN
    RAISE EXCEPTION
      'A assinatura recolhe-se numa ordem fechada (esta está %). Fecha o trabalho primeiro.',
      replace(v_o.estado, '_', ' ');
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Falta o nome de quem assinou. Uma assinatura sem nome não prova nada.';
  END IF;

  -- O caminho tem de ser desta ordem. Sem esta verificação, alguém podia
  -- apontar a assinatura desta ordem para o ficheiro de outra.
  v_esperado := public.ops_caminho_da_ordem(p_ordem_id, '');
  IF p_caminho IS NULL OR position(v_esperado in p_caminho) <> 1 THEN
    RAISE EXCEPTION 'O caminho do ficheiro não corresponde a esta ordem.';
  END IF;

  SELECT caminho INTO v_antes FROM public.ops_assinatura WHERE ordem_id = p_ordem_id;

  INSERT INTO public.ops_assinatura
    (organization_id, ordem_id, nome, qualidade, caminho, recolhida_por)
  VALUES
    (v_o.organization_id, p_ordem_id, v_nome,
     nullif(btrim(coalesce(p_qualidade, '')), ''), p_caminho, v_user)
  ON CONFLICT (ordem_id) DO UPDATE
    SET nome = EXCLUDED.nome,
        qualidade = EXCLUDED.qualidade,
        caminho = EXCLUDED.caminho,
        recolhida_por = EXCLUDED.recolhida_por,
        assinada_em = now();

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id,
     CASE WHEN v_antes IS NULL THEN 'assinada' ELSE 'assinatura_substituida' END,
     'Assinada por ' || v_nome
       || COALESCE(' (' || nullif(btrim(coalesce(p_qualidade, '')), '') || ')', ''),
     v_user,
     CASE WHEN v_antes IS NULL THEN NULL ELSE jsonb_build_object('caminho', v_antes) END,
     jsonb_build_object('nome', v_nome, 'caminho', p_caminho));

  RETURN jsonb_build_object('ok', true, 'substituiu', v_antes IS NOT NULL);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_assinar_ordem(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_assinar_ordem(uuid, text, text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_assinar_ordem(uuid, text, text, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_atribuir_ordem(uuid, uuid, uuid[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_atribuir_ordem(p_ordem_id uuid, p_responsavel_id uuid, p_equipa uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_o      record;
  v_antes  uuid;
  v_equipa uuid[];
  v_mau    uuid;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF v_funcao = 'tecnico' THEN
    RAISE EXCEPTION 'Só quem coordena distribui o trabalho.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.ops_pode(v_o.organization_id, 'operations.orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('fechada','confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se atribui uma ordem % — o trabalho já acabou.',
      replace(v_o.estado, '_', ' ');
  END IF;

  v_equipa := COALESCE(p_equipa, ARRAY[]::uuid[]);
  IF p_responsavel_id IS NOT NULL AND NOT (p_responsavel_id = ANY (v_equipa)) THEN
    v_equipa := v_equipa || p_responsavel_id;
  END IF;

  SELECT u INTO v_mau FROM unnest(v_equipa) AS u
   WHERE NOT EXISTS (
     SELECT 1 FROM public.ops_utilizador_perfil
      WHERE utilizador_id = u AND organization_id = v_o.organization_id AND ativo)
   LIMIT 1;

  IF v_mau IS NOT NULL THEN
    RAISE EXCEPTION '% não está ativo em Operações nesta organização.',
      COALESCE((SELECT name FROM public.anew_users WHERE id = v_mau), 'Essa pessoa');
  END IF;

  v_antes := v_o.responsavel_id;

  UPDATE public.ops_ordem
     SET responsavel_id = p_responsavel_id, atualizada_em = now()
   WHERE id = p_ordem_id;

  DELETE FROM public.ops_ordem_pessoa
   WHERE ordem_id = p_ordem_id AND NOT (utilizador_id = ANY (v_equipa));

  INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel)
  SELECT p_ordem_id, u,
         CASE WHEN u = p_responsavel_id THEN 'responsavel' ELSE 'executante' END
    FROM unnest(v_equipa) AS u
  ON CONFLICT (ordem_id, utilizador_id) DO UPDATE
    SET papel = EXCLUDED.papel;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'atribuida',
     COALESCE((SELECT name FROM public.anew_users WHERE id = p_responsavel_id),
              'sem responsável'),
     v_user,
     jsonb_build_object('responsavel_id', v_antes),
     jsonb_build_object('responsavel_id', p_responsavel_id,
                        'equipa', to_jsonb(v_equipa)));

  RETURN jsonb_build_object(
    'ok', true,
    'responsavel_id', p_responsavel_id,
    'equipa', (SELECT count(*) FROM public.ops_ordem_pessoa WHERE ordem_id = p_ordem_id)
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_atribuir_ordem(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_atribuir_ordem(uuid, uuid, uuid[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_atribuir_ordem(uuid, uuid, uuid[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_avisar_atrasos()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_avisar_atrasos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.current_business_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = v_user AND ativo AND funcao IN ('admin', 'gestor')
  ) THEN
    RAISE EXCEPTION 'Só quem coordena verifica os atrasos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object('ok', true, 'avisos', public.ops_avisar_atrasos());
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_avisar_atrasos() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_avisar_atrasos() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_avisar_atrasos() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_compromissos_crm(uuid, date, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_compromissos_crm(_org_id uuid, _de date, _ate date)
 RETURNS TABLE(utilizador_id uuid, compromisso_id uuid, titulo text, inicio timestamp with time zone, fim timestamp with time zone, dia_inteiro boolean, onde text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.current_business_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil eu
     WHERE eu.utilizador_id = v_user AND eu.organization_id = _org_id AND eu.ativo
       AND eu.funcao IN ('admin', 'gestor', 'operador')
  ) AND NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Só quem coordena vê a agenda da equipa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _ate - _de > 62 THEN
    RAISE EXCEPTION 'Período demasiado longo: % dias. O máximo são 62.', _ate - _de;
  END IF;

  IF to_regclass('public.schedule_items') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (dono.utilizador_id, si.id)
         dono.utilizador_id, si.id, si.title::text,
         si.start_datetime, si.end_datetime,
         COALESCE(si.all_day, false), si.location::text
    FROM public.schedule_items si
    -- Os dois caminhos numa lista só. `DISTINCT ON` evita duplicar quem
    -- estiver ligado pelos dois ao mesmo tempo.
    CROSS JOIN LATERAL (
      SELECT si.user_id AS utilizador_id
      UNION
      SELECT sr.user_id
        FROM public.schedule_item_assignees sia
        JOIN public.schedule_resources sr ON sr.id = sia.resource_id
       WHERE sia.item_id = si.id
    ) AS dono
   WHERE dono.utilizador_id IS NOT NULL
     AND si.organization_id = _org_id
     AND si.status NOT IN ('cancelled', 'rescheduled')
     -- Ausências vêm pela outra porta. Ver a nota acima.
     AND si.time_off_type IS NULL
     AND si.vacation_id IS NULL
     AND si.start_datetime < (_ate + 1)::timestamptz
     AND si.end_datetime   >= _de::timestamptz
     -- E só de quem é da equipa de Operações: a agenda comercial de quem não
     -- faz trabalho de campo não tem que aparecer aqui.
     AND EXISTS (SELECT 1 FROM public.ops_utilizador_perfil up
                  WHERE up.utilizador_id = dono.utilizador_id
                    AND up.organization_id = _org_id AND up.ativo);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_compromissos_crm(uuid, date, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_compromissos_crm(uuid, date, date) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_compromissos_crm(uuid, date, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_criar_local(uuid, text, text, uuid, uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_criar_local(p_cliente_id uuid, p_nome text DEFAULT NULL::text, p_tipo text DEFAULT 'morada'::text, p_parent_id uuid DEFAULT NULL::uuid, p_address_id uuid DEFAULT NULL::uuid, p_morada text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_org    uuid;
  v_nome   text := nullif(btrim(coalesce(p_nome, '')), '');
  v_codigo text;
  v_id     uuid;
  v_m      record;
  v_morada text := nullif(btrim(coalesce(p_morada, '')), '');
  v_cidade text;
  v_cp     text;
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Um local precisa de um cliente.';
  END IF;

  SELECT organization_id INTO v_org FROM public.anew_clients WHERE id = p_cliente_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(v_org) q;

  IF NOT public.ops_pode(v_org, 'operations.locations.manage') THEN
    RAISE EXCEPTION 'Sem permissão para criar locais.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tipo NOT IN ('morada','edificio','piso','espaco') THEN
    RAISE EXCEPTION 'Tipo de local inválido: %.', p_tipo;
  END IF;

  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_local WHERE id = p_parent_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Esse local-pai não é desta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_address_id IS NOT NULL THEN
    SELECT * INTO v_m FROM public.ops_v_morada_cliente
     WHERE address_id = p_address_id AND cliente_id = p_cliente_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Essa morada não é deste cliente.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_m.ja_e_local THEN
      SELECT id, codigo, nome INTO v_id, v_codigo, v_nome
        FROM public.ops_local
       WHERE address_id = p_address_id AND cliente_id = p_cliente_id
       LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true, 'id', v_id, 'codigo', v_codigo, 'nome', v_nome, 'ja_existia', true);
    END IF;

    IF v_nome IS NULL THEN
      v_nome := COALESCE(
        nullif(btrim(concat_ws(' ', v_m.street, v_m.number,
                               nullif(v_m.floor, ''), nullif(v_m.unit, ''))), ''),
        v_m.morada,
        'Local sem nome');
    END IF;

    v_morada := COALESCE(v_morada, v_m.morada);
    v_cidade := v_m.city;
    v_cp     := v_m.postal_code;
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Um local precisa de um nome. É por ele que se encontra na lista.';
  END IF;

  v_codigo := public.ops_proximo_codigo_interno(v_org, 'LOC');

  INSERT INTO public.ops_local (
    organization_id, cliente_id, parent_id, codigo, nome, tipo,
    morada, cidade, cod_postal, address_id)
  VALUES (
    v_org, p_cliente_id, p_parent_id, v_codigo, v_nome, p_tipo,
    v_morada, v_cidade, v_cp, p_address_id)
  RETURNING id INTO v_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_org, 'local', v_id, 'criado', v_nome, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'tipo', p_tipo,
                        'da_morada_do_crm', p_address_id IS NOT NULL));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'codigo', v_codigo, 'nome', v_nome, 'ja_existia', false);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_criar_local(uuid, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_criar_local(uuid, text, text, uuid, uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_criar_local(uuid, text, text, uuid, uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_criar_ordem(text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_criar_ordem(p_titulo text, p_cliente_id uuid, p_origem text DEFAULT 'corretiva'::text, p_prioridade text DEFAULT 'normal'::text, p_descricao text DEFAULT NULL::text, p_local_id uuid DEFAULT NULL::uuid, p_ativo_id uuid DEFAULT NULL::uuid, p_checklist_id uuid DEFAULT NULL::uuid, p_area text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_contacto_nome text DEFAULT NULL::text, p_contacto_telefone text DEFAULT NULL::text, p_agendada_para timestamp with time zone DEFAULT NULL::timestamp with time zone, p_responsavel_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('ops.medicao', 'autorizada', true);
  r := public.ops_criar_ordem_impl(
         p_titulo, p_cliente_id, p_origem, p_prioridade, p_descricao, p_local_id,
         p_ativo_id, p_checklist_id, p_area, p_tipo, p_contacto_nome,
         p_contacto_telefone, p_agendada_para, p_responsavel_id);
  PERFORM set_config('ops.medicao', '', true);
  RETURN r;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_criar_ordem(text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_criar_ordem(text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_criar_ordem(text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_definir(uuid, text, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_definir(p_org_id uuid, p_chave text, p_valor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_funcao text;
  v_antes  text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do teu alcance.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = p_org_id;

  -- Ligar o envio ao cliente é uma decisão da casa, não de quem executa.
  IF COALESCE(v_funcao, '') NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Só quem gere é que muda definições.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_chave = 'relatorio_automatico' AND p_valor NOT IN ('sim', 'nao') THEN
    RAISE EXCEPTION 'O relatório automático só pode ser "sim" ou "nao".';
  END IF;

  SELECT valor INTO v_antes
    FROM public.ops_definicao
   WHERE organization_id = p_org_id AND chave = p_chave;

  INSERT INTO public.ops_definicao (organization_id, chave, valor, atualizada_por)
  VALUES (p_org_id, p_chave, p_valor, v_user)
  ON CONFLICT (organization_id, chave) DO UPDATE
    SET valor = EXCLUDED.valor,
        atualizada_em = now(),
        atualizada_por = EXCLUDED.atualizada_por;

  -- Ligar isto faz sair emails da empresa. É das decisões mais consequentes
  -- que o módulo permite, e ficava sem registo nenhum de quem a tomou.
  IF v_antes IS DISTINCT FROM p_valor THEN
    INSERT INTO public.ops_evento
      (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
    VALUES
      (p_org_id, 'definicao', p_org_id, 'definicao_alterada',
       CASE WHEN p_chave = 'relatorio_automatico'
            THEN CASE WHEN p_valor = 'sim'
                      THEN 'Relatório automatico ao cliente: LIGADO'
                      ELSE 'Relatório automatico ao cliente: DESLIGADO' END
            ELSE p_chave || ' = ' || p_valor END,
       v_user,
       jsonb_build_object('chave', p_chave, 'valor', v_antes),
       jsonb_build_object('chave', p_chave, 'valor', p_valor));
  END IF;

  RETURN jsonb_build_object('ok', true, 'chave', p_chave, 'valor', p_valor);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_definir(uuid, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_definir(uuid, text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_definir(uuid, text, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_destino_do_relatorio(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_destino_do_relatorio(p_ordem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := public.current_business_user_id();
  v_o     record;
  v_email text;
  v_ja    timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, organization_id, cliente_id, estado INTO v_o
    FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Essa ordem não existe.'; END IF;

  IF v_o.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Essa ordem é de outra organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT m.email INTO v_email
    FROM public.anew_clients cl
    JOIN public.anew_entity_emails m ON m.entity_id = cl.entity_id
   WHERE cl.id = v_o.cliente_id
   ORDER BY m.is_primary DESC NULLS LAST, m.created_at
   LIMIT 1;

  SELECT max(created_at) INTO v_ja
    FROM public.scheduled_emails
   WHERE entity_type = 'ops_ordem' AND entity_id = p_ordem_id
     AND status IN ('pending', 'sent');

  RETURN jsonb_build_object(
    'email',      nullif(btrim(COALESCE(v_email, '')), ''),
    'estado',     v_o.estado,
    'ja_enviado', v_ja
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_destino_do_relatorio(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_destino_do_relatorio(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_destino_do_relatorio(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_duplicar_checklist(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_duplicar_checklist(p_checklist_id uuid, p_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o      record;
  v_user   uuid;
  v_novo   uuid;
  v_codigo text;
  v_nome   text;
  v_n      integer := 0;
BEGIN
  SELECT * INTO v_o FROM public.ops_checklist WHERE id = p_checklist_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Essa checklist não existe.'; END IF;

  v_user   := public.ops_exige_criacao(v_o.organization_id);
  v_codigo := public.ops_proximo_codigo_interno(v_o.organization_id, 'CL');
  v_nome   := COALESCE(nullif(btrim(p_nome), ''), v_o.nome || ' (cópia)');

  INSERT INTO public.ops_checklist (organization_id, codigo, nome, versao, estado)
  VALUES (v_o.organization_id, v_codigo, v_nome, 1, 'rascunho')
  RETURNING id INTO v_novo;

  -- As tarefas, com os ids novos guardados para as medições os apanharem.
  WITH copiadas AS (
    INSERT INTO public.ops_checklist_tarefa
      (checklist_id, posicao, codigo, nome, descricao, tipo, unidade,
       limite_min, limite_max, obrigatoria, foto_obrigatoria, tempo_estimado)
    SELECT v_novo, t.posicao, t.codigo, t.nome, t.descricao, t.tipo, t.unidade,
           t.limite_min, t.limite_max, t.obrigatoria, t.foto_obrigatoria, t.tempo_estimado
      FROM public.ops_checklist_tarefa t
     WHERE t.checklist_id = p_checklist_id
     ORDER BY t.posicao, t.nome
    RETURNING id, posicao, nome
  )
  SELECT count(*) INTO v_n FROM copiadas;

  -- As medições de cada tarefa. Emparelha-se por (posição, nome), que é o que
  -- identifica uma tarefa dentro de uma checklist — os ids são novos.
  IF to_regclass('public.ops_checklist_tarefa_medicao') IS NOT NULL THEN
    INSERT INTO public.ops_checklist_tarefa_medicao
      (checklist_tarefa_id, medicao_def_id, posicao)
    SELECT nova.id, m.medicao_def_id, m.posicao
      FROM public.ops_checklist_tarefa velha
      JOIN public.ops_checklist_tarefa_medicao m ON m.checklist_tarefa_id = velha.id
      JOIN public.ops_checklist_tarefa nova
        ON nova.checklist_id = v_novo
       AND nova.posicao = velha.posicao
       AND nova.nome = velha.nome
     WHERE velha.checklist_id = p_checklist_id;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'checklist', v_novo, 'duplicada',
     'Cópia de ' || v_o.codigo || ' — ' || v_o.nome, v_user,
     jsonb_build_object('de', p_checklist_id, 'codigo', v_o.codigo),
     jsonb_build_object('codigo', v_codigo, 'tarefas', v_n));

  RETURN jsonb_build_object('ok', true, 'id', v_novo, 'codigo', v_codigo, 'tarefas', v_n);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_duplicar_checklist(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_checklist(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_checklist(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_duplicar_local(uuid, text, boolean, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_duplicar_local(p_local_id uuid, p_nome text, p_com_ativos boolean DEFAULT true, p_com_espacos boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o        record;
  v_user     uuid;
  v_novo     uuid;
  v_codigo   text;
  v_ativos   integer := 0;
  v_espacos  integer := 0;
  -- id antigo -> id novo. Um espaço só se pode criar depois do pai dele, e
  -- é daqui que se sabe qual é o pai novo.
  v_mapa     jsonb := '{}'::jsonb;
  v_pai      uuid;
  v_id       uuid;
  r          record;
BEGIN
  SELECT * INTO v_o FROM public.ops_local WHERE id = p_local_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esse local não existe.'; END IF;
  IF nullif(btrim(coalesce(p_nome, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A cópia precisa de um nome — senão ficam dois locais iguais na árvore.';
  END IF;

  v_user   := public.ops_exige_criacao(v_o.organization_id);
  v_codigo := public.ops_proximo_codigo_interno(v_o.organization_id, 'LOC');

  -- ── 1. O próprio ────────────────────────────────────────────
  -- O `parent_id` copia-se: a cópia de um espaço nasce dentro do mesmo local,
  -- e a cópia de uma morada nasce como morada.
  INSERT INTO public.ops_local
    (organization_id, parent_id, cliente_id, codigo, nome, tipo, morada,
     cidade, zona, latitude, longitude)
  VALUES
    (v_o.organization_id, v_o.parent_id, v_o.cliente_id, v_codigo, btrim(p_nome),
     v_o.tipo, v_o.morada, v_o.cidade, v_o.zona,
     -- As coordenadas NÃO se copiam. Dois apartamentos na mesma torre não são
     -- o mesmo ponto, e um ponto errado é pior do que ponto nenhum: manda o
     -- técnico com confiança para o sítio errado.
     NULL, NULL)
  RETURNING id INTO v_novo;

  v_mapa := jsonb_build_object(p_local_id::text, v_novo::text);

  -- ── 2. Os espaços, de cima para baixo ─────────────────────────────
  -- Por nível, porque um filho precisa do pai já criado. O limite de 20 níveis
  -- é um travão contra dados em ciclo: uma árvore que qualquer pessoa edita
  -- acaba por ter um nó pendurado em si próprio, e isso não pode pendurar a
  -- base.
  IF p_com_espacos THEN
    FOR r IN
      WITH RECURSIVE descendentes AS (
        SELECT l.*, 1 AS nivel
          FROM public.ops_local l
         WHERE l.parent_id = p_local_id AND l.ativo
        UNION ALL
        SELECT f.*, d.nivel + 1
          FROM public.ops_local f
          JOIN descendentes d ON f.parent_id = d.id
         WHERE f.ativo AND d.nivel < 20
      )
      SELECT * FROM descendentes ORDER BY nivel, nome
    LOOP
      v_pai := (v_mapa ->> r.parent_id::text)::uuid;
      -- Sem pai copiado não há onde pendurar. Não devia acontecer; se
      -- acontecer, salta-se este ramo em vez de rebentar a cópia toda.
      CONTINUE WHEN v_pai IS NULL;

      INSERT INTO public.ops_local
        (organization_id, parent_id, cliente_id, codigo, nome, tipo, morada,
         cidade, zona, latitude, longitude)
      VALUES
        (v_o.organization_id, v_pai, r.cliente_id,
         public.ops_proximo_codigo_interno(v_o.organization_id, 'LOC'),
         r.nome, r.tipo, r.morada, r.cidade, r.zona, NULL, NULL)
      RETURNING id INTO v_id;

      v_mapa   := v_mapa || jsonb_build_object(r.id::text, v_id::text);
      v_espacos := v_espacos + 1;
    END LOOP;
  END IF;

  -- ── 3. Os equipamentos, de todos os locais copiados ─────────────────
  IF p_com_ativos THEN
    FOR r IN
      SELECT a.*
        FROM public.ops_ativo a
       WHERE a.ativo
         -- `->> ... IS NOT NULL` e não o operador `?`: há clientes de SQL
         -- que tratam o ponto de interrogação como marcador de parâmetro.
         AND (v_mapa ->> a.local_id::text) IS NOT NULL
       ORDER BY a.codigo
    LOOP
      INSERT INTO public.ops_ativo
        (organization_id, local_id, categoria_id, codigo, nome, descricao,
         marca, modelo, criticidade, centro_custo_id)
      VALUES
        (v_o.organization_id, (v_mapa ->> r.local_id::text)::uuid, r.categoria_id,
         public.ops_proximo_codigo_interno(v_o.organization_id, 'AT'),
         r.nome, r.descricao, r.marca, r.modelo, r.criticidade, r.centro_custo_id);
      -- O número de série NÃO se copia: é único de cada máquina, e duas com o
      -- mesmo número tornam o histórico inútil.
      v_ativos := v_ativos + 1;
    END LOOP;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'local', v_novo, 'duplicado',
     'Cópia de ' || v_o.codigo || ' — ' || v_o.nome, v_user,
     jsonb_build_object('de', p_local_id, 'codigo', v_o.codigo),
     jsonb_build_object('codigo', v_codigo, 'equipamentos', v_ativos,
                        'espacos', v_espacos));

  RETURN jsonb_build_object('ok', true, 'id', v_novo, 'codigo', v_codigo,
                            'equipamentos', v_ativos, 'espacos', v_espacos);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_duplicar_local(uuid, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_local(uuid, text, boolean, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_local(uuid, text, boolean, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_duplicar_ordem(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_duplicar_ordem(p_ordem_id uuid, p_titulo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o      record;
  v_user   uuid;
  v_novo   uuid;
  v_codigo text;
  v_n      integer := 0;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Essa ordem não existe.'; END IF;

  v_user   := public.ops_exige_criacao(v_o.organization_id);
  v_codigo := public.ops_proximo_codigo_interno(v_o.organization_id, 'OT');

  INSERT INTO public.ops_ordem
    (organization_id, codigo, origem, estado, prioridade, area, tipo,
     cliente_id, local_id, titulo, descricao,
     contacto_nome, contacto_telefone,
     tipo_trabalho_id, centro_custo_id, fornecedor_id, fecha_automatico)
  VALUES
    (v_o.organization_id, v_codigo, v_o.origem,
     -- Agendada, e não em curso: uma cópia é trabalho por fazer. Sem data:
     -- a data da original é do dia dela, e herdá-la nasceria já atrasada.
     'agendada',
     v_o.prioridade, v_o.area, v_o.tipo,
     v_o.cliente_id, v_o.local_id,
     COALESCE(nullif(btrim(p_titulo), ''), v_o.titulo),
     v_o.descricao, v_o.contacto_nome, v_o.contacto_telefone,
     v_o.tipo_trabalho_id, v_o.centro_custo_id, v_o.fornecedor_id,
     v_o.fecha_automatico)
  RETURNING id INTO v_novo;

  INSERT INTO public.ops_ordem_alvo (ordem_id, local_id, ativo_id, checklist_id)
  SELECT v_novo, a.local_id, a.ativo_id, a.checklist_id
    FROM public.ops_ordem_alvo a
   WHERE a.ordem_id = p_ordem_id;

  -- As tarefas vão como perguntas: sem estado, sem valores, sem quem as fez e
  -- sem os tempos. Levar as respostas seria inventar trabalho que ninguém fez.
  WITH copiadas AS (
    INSERT INTO public.ops_ordem_tarefa
      (ordem_id, ordem_alvo_id, posicao, codigo, nome, tipo, estado,
       unidade, limite_min, limite_max, obrigatoria, tempo_estimado)
    SELECT v_novo, NULL, t.posicao, t.codigo, t.nome, t.tipo, 'pendente',
           t.unidade, t.limite_min, t.limite_max, t.obrigatoria, t.tempo_estimado
      FROM public.ops_ordem_tarefa t
     WHERE t.ordem_id = p_ordem_id
     ORDER BY t.posicao
    RETURNING id
  )
  SELECT count(*) INTO v_n FROM copiadas;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', v_novo, 'criada',
     'Cópia de ' || v_o.codigo, v_user,
     jsonb_build_object('de', p_ordem_id, 'codigo', v_o.codigo),
     jsonb_build_object('codigo', v_codigo, 'tarefas', v_n, 'duplicada', true));

  RETURN jsonb_build_object('ok', true, 'id', v_novo, 'codigo', v_codigo, 'tarefas', v_n);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_duplicar_ordem(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_ordem(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_ordem(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_duplicar_plano(uuid, text, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_duplicar_plano(p_plano_id uuid, p_nome text DEFAULT NULL::text, p_cliente_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o       record;
  v_user    uuid;
  v_novo    uuid;
  v_codigo  text;
  v_cliente uuid;
  v_alvos   integer := 0;
BEGIN
  SELECT * INTO v_o FROM public.ops_plano WHERE id = p_plano_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esse plano não existe.'; END IF;

  v_user   := public.ops_exige_criacao(v_o.organization_id);
  v_codigo := public.ops_proximo_codigo_interno(v_o.organization_id, 'PLN');
  v_cliente := COALESCE(p_cliente_id, v_o.cliente_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_clients
     WHERE id = v_cliente AND organization_id = v_o.organization_id
  ) THEN
    RAISE EXCEPTION 'Esse cliente não é desta organização.';
  END IF;

  INSERT INTO public.ops_plano
    (organization_id, codigo, nome, cliente_id, estado, regra_recorrencia,
     hora_prevista, duracao_estimada, responsavel_id, inicio_em, fim_em,
     materializado_ate)
  VALUES
    (v_o.organization_id, v_codigo,
     COALESCE(nullif(btrim(p_nome), ''), v_o.nome || ' (cópia)'),
     v_cliente,
     -- Suspenso, e não ativo. Um plano copiado ainda não tem alvos revistos,
     -- e um plano ativo começa a gerar ordens na próxima passagem do relógio.
     'suspenso',
     v_o.regra_recorrencia, v_o.hora_prevista, v_o.duracao_estimada,
     v_o.responsavel_id, GREATEST(v_o.inicio_em, current_date), v_o.fim_em,
     -- Nada materializado: as ordens desta cópia são as que ela vier a gerar.
     NULL)
  RETURNING id INTO v_novo;

  IF p_cliente_id IS NULL OR p_cliente_id = v_o.cliente_id THEN
    WITH copiados AS (
      INSERT INTO public.ops_plano_alvo (plano_id, local_id, ativo_id, checklist_id)
      SELECT v_novo, a.local_id, a.ativo_id, a.checklist_id
        FROM public.ops_plano_alvo a
       WHERE a.plano_id = p_plano_id
      RETURNING id
    )
    SELECT count(*) INTO v_alvos FROM copiados;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'plano', v_novo, 'duplicado',
     'Cópia de ' || v_o.codigo || ' — ' || v_o.nome, v_user,
     jsonb_build_object('de', p_plano_id, 'codigo', v_o.codigo),
     jsonb_build_object('codigo', v_codigo, 'alvos', v_alvos,
                        'estado', 'suspenso'));

  RETURN jsonb_build_object('ok', true, 'id', v_novo, 'codigo', v_codigo,
                            'alvos', v_alvos, 'estado', 'suspenso');
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_duplicar_plano(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_plano(uuid, text, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_duplicar_plano(uuid, text, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_entrar_como_terminar(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_entrar_como_terminar(p_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.ops_entrar_como_log
     SET fim = now()
   WHERE id = p_log_id
     AND admin_id = public.current_business_user_id()
     AND fim IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_n > 0);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_entrar_como_terminar(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_entrar_como_terminar(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_entrar_como_terminar(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_enviar_relatorio(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_enviar_relatorio(p_ordem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_funcao text;
  v_o      record;
  v_email  text;
  v_html   text;
  v_autor  uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF to_regclass('public.scheduled_emails') IS NULL THEN
    RAISE EXCEPTION 'Esta instalação não tem fila de emails.';
  END IF;

  SELECT id, organization_id, cliente_id, codigo, titulo, estado INTO v_o
    FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Essa ordem não existe.'; END IF;

  IF v_o.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Essa ordem é de outra organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Escrever a um cliente é um ato para fora da empresa. O técnico faz o
  -- trabalho; quem responde pelo que sai é quem gere.
  SELECT funcao INTO v_funcao
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = v_o.organization_id AND ativo;

  IF COALESCE(v_funcao, '') NOT IN ('admin', 'gestor')
     AND NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Mandar o relatório ao cliente é de quem gere.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Um relatório de trabalho a meio não é um relatório: é uma promessa.
  IF v_o.estado NOT IN ('fechada', 'confirmada') THEN
    RAISE EXCEPTION 'A ordem ainda não está fechada. O relatório sai quando o trabalho acaba.';
  END IF;

  SELECT m.email INTO v_email
    FROM public.anew_clients cl
    JOIN public.anew_entity_emails m ON m.entity_id = cl.entity_id
   WHERE cl.id = v_o.cliente_id
   ORDER BY m.is_primary DESC NULLS LAST, m.created_at
   LIMIT 1;

  v_email := nullif(btrim(COALESCE(v_email, '')), '');
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'A ficha deste cliente não tem email. Põe-lhe um e volta a tentar.';
  END IF;

  v_html := public.ops_relatorio_html(p_ordem_id);
  IF v_html IS NULL THEN
    RAISE EXCEPTION 'Não foi possível montar o relatório desta ordem.';
  END IF;

  SELECT COALESCE(u.auth_user_id, u.id) INTO v_autor
    FROM public.anew_users u WHERE u.id = v_user;
  IF v_autor IS NULL THEN
    RAISE EXCEPTION 'Não se sabe por que conta havia de sair este email.';
  END IF;

  INSERT INTO public.scheduled_emails
    (user_id, organization_id, entity_type, entity_id,
     to_email, subject, body_html, scheduled_for, status)
  VALUES
    (v_autor, v_o.organization_id, 'ops_ordem', p_ordem_id,
     v_email, v_o.codigo || ' — ' || v_o.titulo, v_html, now(), 'pending');

  /* Ao contrário do automático, aqui não há guarda contra repetir: se alguém
     carrega no botão outra vez é porque quer mandar outra vez — o cliente
     apagou, mudou de email, pediu ao telefone. O que fica é o rasto: cada
     envio é um evento, com quem mandou e para onde. */
  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'relatorio_enviado',
     'Relatório enviado à mão para ' || v_email,
     v_user, NULL,
     jsonb_build_object('para', v_email, 'automatico', false));

  RETURN jsonb_build_object('ok', true, 'para', v_email);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_enviar_relatorio(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_enviar_relatorio(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_enviar_relatorio(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_equipa_crm(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_equipa_crm(p_org uuid)
 RETURNS TABLE(utilizador_id uuid, nome text, email text, telefone text, avatar_url text, cargo_crm text, local_crm text, papel_crm text, papel_crm_codigo text, equipa_crm text, distritos text[], codigos_postais text[], em_operacoes boolean, funcao text, ativo boolean, zona_base text, skills uuid[], skills_nomes text[], custo_hora numeric, pode_ver_custos boolean, rh_disponivel boolean, rh_ligado boolean, numero_interno text, cargo text, local_trabalho text, tipo_contrato text, regime text, categoria_funcao text, estado_contrato text, data_admissao date, ausencia_tipo text, ausencia_inicio date, ausencia_fim date, ausencia_origem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_custos  boolean;
  v_gerir   boolean;
  v_rh      boolean := to_regclass('public.pessoas_contas') IS NOT NULL
                       AND to_regclass('public.pessoas') IS NOT NULL;
  v_agenda  boolean := to_regclass('public.schedule_resources') IS NOT NULL;

  f_equipa  text := 'NULL::text';
  f_dist    text := 'NULL::text[]';
  f_cps     text := 'NULL::text[]';
  j_rh      text := 'LEFT JOIN LATERAL (SELECT NULL::uuid AS pessoa_id, NULL::jsonb AS j) pe ON true';
  f_cargo   text := 'NULL::text';
  j_vinc    text := 'LEFT JOIN LATERAL (SELECT NULL::jsonb AS vj) vi ON true';
  f_local   text := 'NULL::text';
  q_aus     text[] := '{}';
  j_aus     text;
  v_sql     text;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'Falta a organização.';
  END IF;

  IF NOT public.ops_pode(p_org, 'operations.view') THEN
    RAISE EXCEPTION 'Sem acesso a Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_custos := public.ops_pode(p_org, 'operations.costs.view');
  v_gerir  := public.ops_pode(p_org, 'operations.settings.manage');

  -- ── CRM: equipa ─────────────────────────────────────────────────────────
  IF to_regclass('public.organization_teams') IS NOT NULL
     AND to_regclass('public.organization_team_members') IS NOT NULL THEN
    f_equipa := $q$(SELECT string_agg(t.name::text, ', ' ORDER BY t.name::text)
         FROM public.organization_team_members tm
         JOIN public.organization_teams t ON t.id = tm.team_id
        WHERE tm.user_id = u.id AND t.organization_id = $1
          AND COALESCE((to_jsonb(t)->>'is_active')::boolean, true))$q$;
  END IF;

  -- ── CRM: distritos e códigos postais da agenda ──────────────────────────
  IF v_agenda AND to_regclass('public.resource_districts') IS NOT NULL
     AND to_regclass('public.administrative_divisions') IS NOT NULL THEN
    f_dist := $q$ARRAY(
        SELECT x.nome FROM (
          SELECT ad.name::text AS nome, min(rd.priority) AS pr
            FROM public.schedule_resources sr
            JOIN public.resource_districts rd ON rd.resource_id = sr.id AND rd.is_active
            JOIN public.administrative_divisions ad ON ad.id = rd.district_id
           WHERE sr.user_id = u.id AND sr.organization_id = $1
             AND COALESCE(sr.is_active, true)
           GROUP BY ad.name) x
        ORDER BY x.pr, x.nome)$q$;
  END IF;

  IF v_agenda AND to_regclass('public.resource_service_areas') IS NOT NULL THEN
    f_cps := $q$ARRAY(
        SELECT DISTINCT sa.postal_code_prefix::text
          FROM public.schedule_resources sr
          JOIN public.resource_service_areas sa ON sa.resource_id = sr.id
                AND COALESCE(sa.is_active, true)
         WHERE sr.user_id = u.id AND sr.organization_id = $1
           AND COALESCE(sr.is_active, true)
         ORDER BY 1)$q$;
  END IF;

  -- ── CRM: ausências aprovadas na agenda (só o título — nunca o motivo) ──
  IF v_agenda AND to_regclass('public.resource_time_off') IS NOT NULL THEN
    q_aus := array_append(q_aus, $q$SELECT COALESCE(nullif(btrim(t.title), ''), 'Ausência')::text AS tipo,
             t.start_date::date AS inicio, t.end_date::date AS fim, 'crm'::text AS origem
        FROM public.schedule_resources sr
        JOIN public.resource_time_off t ON t.resource_id = sr.id
       WHERE sr.user_id = u.id AND sr.organization_id = $1
         AND t.approved IS TRUE
         AND t.end_date >= current_date
         AND t.start_date <= current_date + 60$q$);
  END IF;

  -- ── RH (só se o módulo existir nesta base) ──────────────────────────────
  IF v_rh THEN
    -- A ficha ligada à conta, nesta organização. `to_jsonb(pe)` lê colunas
    -- que podem ainda não existir sem rebentar; e do resultado só se tiram
    -- os campos listados abaixo.
    j_rh := $q$LEFT JOIN LATERAL (
        SELECT pe0.id AS pessoa_id, to_jsonb(pe0) AS j
          FROM public.pessoas_contas pc
          JOIN public.pessoas pe0 ON pe0.id = pc.pessoa_id
                                 AND pe0.organization_id = pc.organization_id
         WHERE pc.anew_user_id = u.id AND pc.organization_id = $1
           AND pc.estado = 'activa'
           AND pe0.deleted_at IS NULL
         ORDER BY pc.ligada_em DESC
         LIMIT 1) pe ON true$q$;

    f_cargo := $q$nullif(btrim(pe.j->>'cargo'), '')$q$;
    IF to_regclass('public.hr_cargos') IS NOT NULL THEN
      -- Só o nome. O salário-base vive na mesma linha e não sai daqui.
      f_cargo := $q$COALESCE(
          (SELECT c.nome FROM public.hr_cargos c
            WHERE c.id::text = pe.j->>'cargo_id' AND c.organization_id = $1
              AND c.deleted_at IS NULL),
          nullif(btrim(pe.j->>'cargo'), ''))$q$;
    END IF;

    f_local := $q$nullif(btrim(pe.j->>'local_trabalho'), '')$q$;
    IF to_regclass('public.hr_locais_trabalho') IS NOT NULL THEN
      f_local := $q$(SELECT l.nome FROM public.hr_locais_trabalho l
                      WHERE l.id::text = pe.j->>'local_id' AND l.organization_id = $1
                        AND l.deleted_at IS NULL)$q$;
      IF to_regclass('public.pessoas_afectacoes') IS NOT NULL THEN
        f_local := $q$(SELECT l.nome FROM public.pessoas_afectacoes a
                        JOIN public.hr_locais_trabalho l ON l.id = a.local_id
                       WHERE a.pessoa_id = pe.pessoa_id AND a.organization_id = $1
                         AND a.deleted_at IS NULL
                         AND a.valido_de <= current_date
                         AND (a.valido_ate IS NULL OR a.valido_ate >= current_date)
                       ORDER BY a.valido_de DESC LIMIT 1)$q$ || ', ' || f_local;
      END IF;
      f_local := 'COALESCE(' || f_local || $q$, nullif(btrim(pe.j->>'local_trabalho'), ''))$q$;
    END IF;

    IF to_regclass('public.pessoas_vinculos') IS NOT NULL THEN
      -- O vínculo ativo; se ainda não houver, o futuro mais próximo.
      j_vinc := $q$LEFT JOIN LATERAL (
          SELECT to_jsonb(v) AS vj FROM public.pessoas_vinculos v
           WHERE v.pessoa_id = pe.pessoa_id AND v.organization_id = $1
             AND v.deleted_at IS NULL AND v.estado IN ('activo','futuro')
           ORDER BY (v.estado = 'activo') DESC, v.data_inicio DESC
           LIMIT 1) vi ON true$q$;
    END IF;

    IF to_regclass('public.pessoas_ausencias_pedidos') IS NOT NULL
       AND to_regclass('public.hr_ausencias_tipos') IS NOT NULL THEN
      -- Doença e parentalidade são dados de saúde/família: só "Ausência".
      q_aus := array_append(q_aus, $q$SELECT (CASE WHEN ti.categoria IN ('doenca','parentalidade') THEN 'Ausência'
                    ELSE ti.nome END)::text AS tipo,
             ap.data_inicio::date AS inicio, ap.data_fim::date AS fim, 'rh'::text AS origem
        FROM public.pessoas_ausencias_pedidos ap
        JOIN public.hr_ausencias_tipos ti ON ti.id = ap.tipo_id
       WHERE ap.pessoa_id = pe.pessoa_id AND ap.organization_id = $1
         AND ap.estado = 'aprovado'
         AND ap.data_fim >= current_date
         AND ap.data_inicio <= current_date + 60$q$);
    END IF;
  END IF;

  IF cardinality(q_aus) = 0 THEN
    j_aus := 'LEFT JOIN LATERAL (SELECT NULL::text AS tipo, NULL::date AS inicio, '
          || 'NULL::date AS fim, NULL::text AS origem) au ON true';
  ELSE
    j_aus := 'LEFT JOIN LATERAL (SELECT x.* FROM ('
          || array_to_string(q_aus, ' UNION ALL ')
          || ') x ORDER BY x.inicio, x.fim LIMIT 1) au ON true';
  END IF;

  v_sql := $q$
    SELECT
      u.id,
      COALESCE(nullif(btrim(u.name), ''), u.email, '—')::text,
      u.email::text,
      nullif(btrim(u.phone), '')::text,
      nullif(btrim(u.avatar_url), '')::text,
      nullif(btrim(to_jsonb(u)->>'position'), ''),
      nullif(btrim(to_jsonb(u)->>'location'), ''),
      pap.nome,
      pap.codigo,
      $q$ || f_equipa || $q$,
      $q$ || f_dist || $q$,
      $q$ || f_cps || $q$,
      (p.utilizador_id IS NOT NULL),
      p.funcao::text,
      p.ativo,
      nullif(btrim(p.zona_base), '')::text,
      COALESCE(sk.ids, '{}'::uuid[]),
      COALESCE(sk.nomes, '{}'::text[]),
      CASE WHEN $2 THEN p.custo_hora::numeric END,
      $2,
      $4,
      (pe.pessoa_id IS NOT NULL),
      nullif(btrim(pe.j->>'numero_interno'), ''),
      $q$ || f_cargo || $q$,
      $q$ || f_local || $q$,
      CASE WHEN $3 THEN vi.vj->>'tipo_contrato' END,
      CASE WHEN $3 THEN vi.vj->>'regime' END,
      CASE WHEN $3 THEN vi.vj->>'categoria_funcao' END,
      CASE WHEN $3 THEN pe.j->>'estado_contrato' END,
      CASE WHEN $3 THEN (pe.j->>'data_admissao')::date END,
      au.tipo,
      au.inicio,
      au.fim,
      au.origem
    FROM (SELECT DISTINCT m.user_id
            FROM public.anew_memberships m
           WHERE m.organization_id = $1 AND m.status = 'active') mm
    JOIN public.anew_users u ON u.id = mm.user_id
    LEFT JOIN public.ops_utilizador_perfil p
           ON p.utilizador_id = u.id AND p.organization_id = $1
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT r.name::text, ', ') AS nome,
             string_agg(DISTINCT (to_jsonb(r)->>'code'), ', ') AS codigo
        FROM public.anew_memberships m2
        JOIN public.anew_roles r ON r.id = m2.role_id
       WHERE m2.user_id = u.id AND m2.organization_id = $1 AND m2.status = 'active'
    ) pap ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(k.id ORDER BY k.nome) AS ids,
             array_agg(k.nome::text ORDER BY k.nome) AS nomes
        FROM public.ops_utilizador_skill us
        JOIN public.ops_skill k ON k.id = us.skill_id AND k.organization_id = $1
       WHERE us.utilizador_id = u.id
    ) sk ON true
    $q$ || j_rh || $q$
    $q$ || j_vinc || $q$
    $q$ || j_aus || $q$
    ORDER BY 2$q$;

  RETURN QUERY EXECUTE v_sql USING p_org, v_custos, v_gerir, v_rh;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_equipa_crm(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_equipa_crm(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_equipa_crm(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_escrever_mensagem(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_escrever_mensagem(p_ordem_id uuid, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := public.current_business_user_id();
  v_o     record;
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_id    uuid;
  v_nome  text;
  r       record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_texto IS NULL THEN
    RAISE EXCEPTION 'A mensagem está vazia.';
  END IF;

  SELECT id, organization_id, codigo, titulo, responsavel_id
    INTO v_o
    FROM public.ops_ordem
   WHERE id = p_ordem_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Essa ordem não existe.'; END IF;

  IF v_o.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Essa ordem é de outra organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ops_mensagem (ordem_id, canal, autor_id, texto)
  VALUES (p_ordem_id, 'interno', v_user, v_texto)
  RETURNING id INTO v_id;

  SELECT name INTO v_nome FROM public.anew_users WHERE id = v_user;

  -- O responsável e a equipa, sem repetições e sem quem escreveu.
  IF to_regprocedure('public.ops_notificar(uuid,uuid,text,text,text,text,uuid,text)')
     IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT p AS quem
        FROM (
          SELECT v_o.responsavel_id AS p
          UNION
          SELECT op.utilizador_id FROM public.ops_ordem_pessoa op
           WHERE op.ordem_id = p_ordem_id
        ) t(p)
       WHERE p IS NOT NULL AND p <> v_user
    LOOP
      PERFORM public.ops_notificar(
        v_o.organization_id, r.quem, 'operacoes_mensagem',
        v_o.codigo || ': mensagem nova',
        COALESCE(v_nome, 'Alguém') || ' — ' || left(v_texto, 120),
        '/operacao/ordens/' || v_o.codigo,
        p_ordem_id, 'medium'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_escrever_mensagem(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_escrever_mensagem(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_escrever_mensagem(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_experimentar_regra(text, date, integer)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_experimentar_regra(p_regra text, p_de date DEFAULT NULL::date, p_quantas integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_de    date := COALESCE(p_de, CURRENT_DATE);
  v_datas date[];
BEGIN
  BEGIN
    SELECT array_agg(d ORDER BY d) INTO v_datas
      FROM (
        SELECT d FROM public.ops_expandir_rrule(p_regra, v_de, v_de + 730) d
         ORDER BY d LIMIT GREATEST(1, LEAST(COALESCE(p_quantas, 6), 24))
      ) x;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'datas', COALESCE(to_jsonb(v_datas), '[]'::jsonb)
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_experimentar_regra(text, date, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_experimentar_regra(text, date, integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_experimentar_regra(text, date, integer) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_fechar_se_completa(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_fechar_se_completa(p_ordem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o        record;
  v_por_ler  integer;
  v_user     uuid := public.current_business_user_id();
BEGIN
  SELECT id, organization_id, estado, fecha_automatico
    INTO v_o
    FROM public.ops_ordem
   WHERE id = p_ordem_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('fechou', false, 'porque', 'nao_existe'); END IF;
  IF NOT v_o.fecha_automatico THEN
    RETURN jsonb_build_object('fechou', false, 'porque', 'nao_e_automatica');
  END IF;
  IF v_o.estado <> 'em_curso' THEN
    RETURN jsonb_build_object('fechou', false, 'porque', 'nao_esta_em_curso');
  END IF;

  SELECT count(*) INTO v_por_ler
    FROM public.ops_ordem_tarefa t
   WHERE t.ordem_id = p_ordem_id
     AND t.obrigatoria
     AND t.estado = 'pendente';

  IF v_por_ler > 0 THEN
    RETURN jsonb_build_object('fechou', false, 'porque', 'faltam_tarefas',
                              'faltam', v_por_ler);
  END IF;

  PERFORM set_config('ops.transicao', 'autorizada', true);
  UPDATE public.ops_ordem
     SET estado = 'fechada', fechada_em = now(), atualizada_em = now()
   WHERE id = p_ordem_id;
  PERFORM set_config('ops.transicao', '', true);

  UPDATE public.ops_sessao_trabalho SET fim = now()
   WHERE ordem_id = p_ordem_id AND fim IS NULL;

  IF to_regprocedure('public.ops_recalcular_custo_mao_obra(uuid)') IS NOT NULL THEN
    PERFORM public.ops_recalcular_custo_mao_obra(p_ordem_id);
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'fechar',
     'Fechada sozinha: as tarefas obrigatórias ficaram todas respondidas.',
     v_user,
     jsonb_build_object('estado', 'em_curso'),
     jsonb_build_object('estado', 'fechada', 'automatico', true));

  RETURN jsonb_build_object('fechou', true);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_fechar_se_completa(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_fechar_se_completa(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_fechar_se_completa(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_area(uuid, text, uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_area(p_org_id uuid, p_nome text, p_id uuid DEFAULT NULL::uuid, p_ativo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.ops_exige_gestao(p_org_id);
  v_id   uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Uma área precisa de nome.'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ops_area (organization_id, nome, ativo, posicao)
    VALUES (p_org_id, v_nome, COALESCE(p_ativo, true),
            COALESCE((SELECT max(posicao) + 1 FROM public.ops_area
                       WHERE organization_id = p_org_id), 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_area
       SET nome = v_nome, ativo = COALESCE(p_ativo, ativo)
     WHERE id = p_id AND organization_id = p_org_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Essa área não existe nesta organização.'; END IF;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
  VALUES
    (p_org_id, 'area', v_id, CASE WHEN p_id IS NULL THEN 'criada' ELSE 'alterada' END,
     v_nome, v_user, jsonb_build_object('nome', v_nome));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_area(uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_area(uuid, text, uuid, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_area(uuid, text, uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_area_tipo(uuid, text, uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_area_tipo(p_area_id uuid, p_nome text, p_id uuid DEFAULT NULL::uuid, p_ativo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org  uuid;
  v_user uuid;
  v_id   uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  SELECT organization_id INTO v_org FROM public.ops_area WHERE id = p_area_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Essa área não existe.'; END IF;
  v_user := public.ops_exige_gestao(v_org);

  IF v_nome IS NULL THEN RAISE EXCEPTION 'Um tipo precisa de nome.'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ops_area_tipo (area_id, nome, ativo, posicao)
    VALUES (p_area_id, v_nome, COALESCE(p_ativo, true),
            COALESCE((SELECT max(posicao) + 1 FROM public.ops_area_tipo
                       WHERE area_id = p_area_id), 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_area_tipo
       SET nome = v_nome, ativo = COALESCE(p_ativo, ativo)
     WHERE id = p_id AND area_id = p_area_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Esse tipo não existe nessa área.'; END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_area_tipo(uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_area_tipo(uuid, text, uuid, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_area_tipo(uuid, text, uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_centro_custo(uuid, text, text, uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_centro_custo(p_org_id uuid, p_codigo text, p_nome text, p_id uuid DEFAULT NULL::uuid, p_ativo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := public.ops_exige_gestao(p_org_id);
  v_id     uuid;
  v_codigo text := nullif(btrim(coalesce(p_codigo, '')), '');
  v_nome   text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  IF v_codigo IS NULL OR v_nome IS NULL THEN
    RAISE EXCEPTION 'Um centro de custo precisa de código e de nome.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ops_centro_custo (organization_id, codigo, nome, ativo)
    VALUES (p_org_id, v_codigo, v_nome, COALESCE(p_ativo, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_centro_custo
       SET codigo = v_codigo, nome = v_nome,
           ativo = COALESCE(p_ativo, ativo), atualizado_em = now()
     WHERE id = p_id AND organization_id = p_org_id
     RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Esse centro de custo não existe nesta organização.';
    END IF;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
  VALUES
    (p_org_id, 'centro_custo', v_id,
     CASE WHEN p_id IS NULL THEN 'criado' ELSE 'alterado' END,
     v_codigo || ' · ' || v_nome, v_user,
     jsonb_build_object('codigo', v_codigo, 'nome', v_nome));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_centro_custo(uuid, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_centro_custo(uuid, text, text, uuid, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_centro_custo(uuid, text, text, uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_checklist(uuid, text, uuid, jsonb, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_checklist(p_checklist_id uuid, p_nome text, p_org_id uuid, p_tarefas jsonb DEFAULT '[]'::jsonb, p_publicar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid;
  v_funcao   text;
  v_nome     text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id       uuid := p_checklist_id;
  v_codigo   text;
  v_versao   integer := 1;
  v_estado   text;
  v_t        jsonb;
  v_tid      uuid;
  v_pos      integer := 0;
  v_n        integer := 0;
  v_nova     boolean := false;
  v_med      jsonb;
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Uma checklist precisa de um nome.';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(p_org_id) q;

  IF NOT public.ops_pode(p_org_id, 'operations.checklists.manage') THEN
    RAISE EXCEPTION 'Sem permissão para gerir checklists.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_id IS NULL THEN
    v_codigo := public.ops_proximo_codigo_interno(p_org_id, 'CL');
    v_nova := true;
  ELSE
    SELECT codigo, versao, estado INTO v_codigo, v_versao, v_estado
      FROM public.ops_checklist WHERE id = v_id AND organization_id = p_org_id;

    IF v_codigo IS NULL THEN
      RAISE EXCEPTION 'Checklist não encontrada nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_estado = 'publicada' THEN
      UPDATE public.ops_checklist SET estado = 'arquivada' WHERE id = v_id;
      v_versao := v_versao + 1;
      v_id := NULL;
      v_nova := true;
    END IF;
  END IF;

  IF v_nova THEN
    INSERT INTO public.ops_checklist (organization_id, codigo, nome, versao, estado, publicada_em)
    VALUES (p_org_id, v_codigo, v_nome, v_versao,
            CASE WHEN p_publicar THEN 'publicada' ELSE 'rascunho' END,
            CASE WHEN p_publicar THEN now() END)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_checklist SET
      nome         = v_nome,
      estado       = CASE WHEN p_publicar THEN 'publicada' ELSE estado END,
      publicada_em = CASE WHEN p_publicar THEN now() ELSE publicada_em END
    WHERE id = v_id;
  END IF;

  DELETE FROM public.ops_checklist_tarefa WHERE checklist_id = v_id;

  FOR v_t IN SELECT * FROM jsonb_array_elements(COALESCE(p_tarefas, '[]'::jsonb)) LOOP
    IF nullif(btrim(coalesce(v_t->>'nome', '')), '') IS NULL THEN
      RAISE EXCEPTION 'A tarefa na posição % não tem nome.', v_pos + 1;
    END IF;

    IF COALESCE(v_t->>'tipo', 'inspecao')
       NOT IN ('inspecao','correcao','limpeza','proacao','substituicao') THEN
      RAISE EXCEPTION 'Tipo de tarefa inválido: %.', v_t->>'tipo';
    END IF;

    -- Um tempo estimado negativo não quer dizer nada; recusa-se em vez de
    -- deixar o "real contra estimado" mentir.
    IF COALESCE((v_t->>'tempo_estimado')::integer, 0) < 0 THEN
      RAISE EXCEPTION 'O tempo estimado da tarefa "%" não pode ser negativo.', btrim(v_t->>'nome');
    END IF;

    INSERT INTO public.ops_checklist_tarefa (
      checklist_id, posicao, nome, descricao, tipo, obrigatoria, privada,
      foto_obrigatoria, tempo_estimado)
    VALUES (
      v_id, v_pos, btrim(v_t->>'nome'),
      nullif(btrim(coalesce(v_t->>'descricao', '')), ''),
      COALESCE(v_t->>'tipo', 'inspecao'),
      COALESCE((v_t->>'obrigatoria')::boolean, true),
      COALESCE((v_t->>'privada')::boolean, false),
      COALESCE((v_t->>'foto_obrigatoria')::boolean, false),
      COALESCE((v_t->>'tempo_estimado')::integer, 0))
    RETURNING id INTO v_tid;

    FOR v_med IN SELECT * FROM jsonb_array_elements(COALESCE(v_t->'medicoes', '[]'::jsonb)) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.ops_medicao_def
                      WHERE id = (v_med#>>'{}')::uuid AND organization_id = p_org_id) THEN
        RAISE EXCEPTION 'Uma das medições não existe nesta organização.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      INSERT INTO public.ops_checklist_tarefa_medicao (checklist_tarefa_id, medicao_def_id, posicao)
      VALUES (v_tid, (v_med#>>'{}')::uuid, 0)
      ON CONFLICT DO NOTHING;
    END LOOP;

    v_pos := v_pos + 1;
    v_n := v_n + 1;
  END LOOP;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (p_org_id, 'checklist', v_id,
     CASE WHEN p_publicar THEN 'publicada' ELSE 'gravada' END, v_nome, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'versao', v_versao, 'tarefas', v_n));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'codigo', v_codigo, 'versao', v_versao,
    'tarefas', v_n, 'publicada', p_publicar);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_checklist(uuid, text, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_checklist(uuid, text, uuid, jsonb, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_checklist(uuid, text, uuid, jsonb, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_medicao(uuid, uuid, text, text, uuid, text, numeric, numeric, jsonb)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_medicao(p_medicao_id uuid, p_org_id uuid, p_nome text, p_tipo text, p_categoria_id uuid DEFAULT NULL::uuid, p_unidade text DEFAULT NULL::text, p_limite_min numeric DEFAULT NULL::numeric, p_limite_max numeric DEFAULT NULL::numeric, p_opcoes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_funcao text;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id   uuid := p_medicao_id;
  v_o    jsonb;
  v_pos  integer := 0;
  v_n    integer := 0;
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Uma medição precisa de um nome.';
  END IF;

  IF p_tipo NOT IN ('gama','acumulado','escolha','texto') THEN
    RAISE EXCEPTION 'Tipo de medição inválido: %.', p_tipo;
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(p_org_id) q;

  IF NOT (
    public.ops_pode(p_org_id, 'operations.checklists.manage')
    OR public.ops_pode(p_org_id, 'operations.settings.manage')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerir medições.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tipo = 'escolha' AND jsonb_array_length(COALESCE(p_opcoes, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION
      'Uma medição de escolha precisa de pelo menos uma opção — senão é uma pergunta sem respostas.';
  END IF;

  IF p_tipo = 'gama' AND p_limite_min IS NULL AND p_limite_max IS NULL THEN
    RAISE EXCEPTION
      'Uma gama sem limites nunca dá veredicto nenhum. Põe um mínimo, um máximo, ou os dois.';
  END IF;

  IF p_limite_min IS NOT NULL AND p_limite_max IS NOT NULL AND p_limite_min > p_limite_max THEN
    RAISE EXCEPTION 'O mínimo (%) é maior do que o máximo (%).', p_limite_min, p_limite_max;
  END IF;

  IF p_categoria_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_categoria_ativo
     WHERE id = p_categoria_id AND organization_id = p_org_id) THEN
    RAISE EXCEPTION 'Essa categoria não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.ops_medicao_def (
      organization_id, categoria_ativo_id, nome, tipo, unidade, limite_min, limite_max)
    VALUES (p_org_id, p_categoria_id, v_nome, p_tipo, nullif(btrim(coalesce(p_unidade,'')), ''),
            p_limite_min, p_limite_max)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_medicao_def SET
      categoria_ativo_id = p_categoria_id,
      nome       = v_nome,
      tipo       = p_tipo,
      unidade    = nullif(btrim(coalesce(p_unidade,'')), ''),
      limite_min = p_limite_min,
      limite_max = p_limite_max
    WHERE id = v_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Medição não encontrada nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  DELETE FROM public.ops_medicao_opcao o
   WHERE o.medicao_def_id = v_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(p_opcoes, '[]'::jsonb)) x
        WHERE btrim(x->>'nome') = o.nome);

  FOR v_o IN SELECT * FROM jsonb_array_elements(COALESCE(p_opcoes, '[]'::jsonb)) LOOP
    INSERT INTO public.ops_medicao_opcao
      (medicao_def_id, nome, posicao, e_nao_conforme, cria_corretiva)
    VALUES (
      v_id, btrim(v_o->>'nome'), v_pos,
      COALESCE((v_o->>'e_nao_conforme')::boolean, false),
      COALESCE((v_o->>'cria_corretiva')::boolean, false))
    ON CONFLICT (medicao_def_id, nome) DO UPDATE SET
      posicao        = EXCLUDED.posicao,
      e_nao_conforme = EXCLUDED.e_nao_conforme,
      cria_corretiva = EXCLUDED.cria_corretiva;
    v_pos := v_pos + 1;
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'opcoes', v_n);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_medicao(uuid, uuid, text, text, uuid, text, numeric, numeric, jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_medicao(uuid, uuid, text, text, uuid, text, numeric, numeric, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_medicao(uuid, uuid, text, text, uuid, text, numeric, numeric, jsonb) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_motivo_pausa(uuid, text, text[], boolean, uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_motivo_pausa(p_org_id uuid, p_nome text, p_funcoes text[] DEFAULT NULL::text[], p_exige_retoma boolean DEFAULT true, p_id uuid DEFAULT NULL::uuid, p_ativo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.ops_exige_gestao(p_org_id);
  v_id   uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_f    text[] := COALESCE(p_funcoes, ARRAY['admin','gestor','operador','tecnico']);
BEGIN
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Um motivo de pausa precisa de nome.'; END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_f) f
              WHERE f NOT IN ('admin','gestor','operador','tecnico')) THEN
    RAISE EXCEPTION 'Função desconhecida na lista.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ops_motivo_pausa
      (organization_id, nome, funcoes, exige_retoma, ativo, posicao)
    VALUES
      (p_org_id, v_nome, v_f, COALESCE(p_exige_retoma, true), COALESCE(p_ativo, true),
       COALESCE((SELECT max(posicao) + 1 FROM public.ops_motivo_pausa
                  WHERE organization_id = p_org_id), 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_motivo_pausa
       SET nome = v_nome, funcoes = v_f,
           exige_retoma = COALESCE(p_exige_retoma, exige_retoma),
           ativo = COALESCE(p_ativo, ativo)
     WHERE id = p_id AND organization_id = p_org_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Esse motivo não existe nesta organização.'; END IF;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
  VALUES
    (p_org_id, 'motivo_pausa', v_id,
     CASE WHEN p_id IS NULL THEN 'criado' ELSE 'alterado' END,
     v_nome, v_user, jsonb_build_object('nome', v_nome, 'funcoes', v_f));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_motivo_pausa(uuid, text, text[], boolean, uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_motivo_pausa(uuid, text, text[], boolean, uuid, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_motivo_pausa(uuid, text, text[], boolean, uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_perfil(uuid, uuid, text, numeric, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_perfil(p_org_id uuid, p_utilizador uuid, p_funcao text, p_custo_hora numeric DEFAULT NULL::numeric, p_ativo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid;
  v_funcao  text;
  v_sistema boolean := public.is_system_admin_user(auth.uid());
  v_antes   record;
BEGIN
  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(p_org_id) q;

  IF NOT v_sistema AND v_funcao NOT IN ('admin','gestor') THEN
    RAISE EXCEPTION 'Só um administrador ou gestor desta organização gere a equipa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.ops_pode(p_org_id, 'operations.settings.manage') THEN
    RAISE EXCEPTION 'Sem permissão para gerir a equipa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_funcao NOT IN ('admin','gestor','supervisor','operador','tecnico') THEN
    RAISE EXCEPTION 'Função inválida: %.', p_funcao;
  END IF;

  IF NOT v_sistema
     AND public.ops_nivel_funcao(p_funcao) < public.ops_nivel_funcao(v_funcao) THEN
    RAISE EXCEPTION 'Não podes dar uma função acima da tua (%).', v_funcao
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_custo_hora IS NOT NULL AND p_custo_hora < 0 THEN
    RAISE EXCEPTION 'O custo à hora não pode ser negativo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_memberships
     WHERE user_id = p_utilizador AND organization_id = p_org_id AND status = 'active') THEN
    RAISE EXCEPTION 'Essa pessoa não tem acesso ativo a esta organização no Olyvia.';
  END IF;

  IF p_utilizador = v_user AND v_funcao IN ('admin','gestor')
     AND (p_funcao NOT IN ('admin','gestor') OR NOT p_ativo) THEN
    RAISE EXCEPTION
      'Não te podes tirar a ti próprio a gestão. Pede a outra pessoa com acesso.';
  END IF;

  SELECT funcao, custo_hora, ativo INTO v_antes
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = p_utilizador AND organization_id = p_org_id;

  IF NOT v_sistema AND v_antes.funcao IS NOT NULL
     AND public.ops_nivel_funcao(v_antes.funcao) < public.ops_nivel_funcao(v_funcao) THEN
    RAISE EXCEPTION 'Não podes alterar o perfil de quem está acima de ti.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ops_utilizador_perfil
    (organization_id, utilizador_id, funcao, custo_hora, ativo)
  VALUES (p_org_id, p_utilizador, p_funcao, p_custo_hora, COALESCE(p_ativo, true))
  ON CONFLICT (organization_id, utilizador_id) DO UPDATE SET
    funcao     = EXCLUDED.funcao,
    custo_hora = EXCLUDED.custo_hora,
    ativo      = EXCLUDED.ativo;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (p_org_id, 'perfil', p_utilizador, 'perfil_alterado',
     COALESCE((SELECT name FROM public.anew_users WHERE id = p_utilizador), '—'), v_user,
     CASE WHEN v_antes.funcao IS NULL THEN NULL
          ELSE jsonb_build_object('funcao', v_antes.funcao,
                                  'custo_hora', v_antes.custo_hora,
                                  'ativo', v_antes.ativo) END,
     jsonb_build_object('funcao', p_funcao, 'custo_hora', p_custo_hora, 'ativo', p_ativo));

  RETURN jsonb_build_object('ok', true, 'utilizador_id', p_utilizador);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_perfil(uuid, uuid, text, numeric, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_perfil(uuid, uuid, text, numeric, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_perfil(uuid, uuid, text, numeric, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_plano(uuid, text, uuid, text, text, integer, time without time zone, date, date, uuid, text, integer, jsonb)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_plano(p_plano_id uuid, p_nome text, p_cliente_id uuid, p_tipo_recorrencia text DEFAULT 'calendario'::text, p_regra text DEFAULT NULL::text, p_intervalo_horas integer DEFAULT NULL::integer, p_hora_prevista time without time zone DEFAULT '09:00:00'::time without time zone, p_inicio_em date DEFAULT NULL::date, p_fim_em date DEFAULT NULL::date, p_responsavel_id uuid DEFAULT NULL::uuid, p_estado text DEFAULT 'ativo'::text, p_duracao integer DEFAULT 0, p_alvos jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('ops.medicao', 'autorizada', true);
  r := public.ops_gravar_plano_impl(
         p_plano_id, p_nome, p_cliente_id, p_tipo_recorrencia, p_regra,
         p_intervalo_horas, p_hora_prevista, p_inicio_em, p_fim_em,
         p_responsavel_id, p_estado, p_duracao, p_alvos);
  PERFORM set_config('ops.medicao', '', true);
  RETURN r;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_plano(uuid, text, uuid, text, text, integer, time without time zone, date, date, uuid, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_plano(uuid, text, uuid, text, text, integer, time without time zone, date, date, uuid, text, integer, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_plano(uuid, text, uuid, text, text, integer, time without time zone, date, date, uuid, text, integer, jsonb) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_rotulo(uuid, text, text, text, integer, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_rotulo(p_org_id uuid, p_lista text, p_valor text, p_nome text, p_ordem integer DEFAULT NULL::integer, p_ativo boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := public.ops_exige_gestao(p_org_id);
  v_valores  text[] := public.ops_valores_da_lista(p_lista);
  v_nome     text := nullif(btrim(coalesce(p_nome, '')), '');
  v_ativo    boolean := COALESCE(p_ativo, true);
  v_sobram   integer;
  v_id       uuid;
BEGIN
  IF v_valores IS NULL THEN
    RAISE EXCEPTION 'A lista "%" não existe.', p_lista;
  END IF;

  -- Um valor inventado aqui partia a aplicação semanas depois, longe daqui.
  IF NOT (p_valor = ANY (v_valores)) THEN
    RAISE EXCEPTION 'A lista "%" não tem o valor "%". Estes nomes mudam-se; os valores não se inventam.',
      p_lista, p_valor;
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'O nome não pode ficar vazio. Para não usar esta opção, esconde-a.';
  END IF;

  -- Uma lista sem nenhuma opção deixa de se poder criar trabalho, e o erro
  -- aparece a quem está no local, não a quem carregou no botão.
  IF NOT v_ativo THEN
    SELECT count(*) INTO v_sobram
      FROM unnest(v_valores) AS t(v)
      LEFT JOIN public.ops_rotulo r
        ON r.organization_id = p_org_id AND r.lista = p_lista AND r.valor = t.v
     WHERE COALESCE(r.ativo, true) AND t.v <> p_valor;

    IF v_sobram = 0 THEN
      RAISE EXCEPTION 'Tem de sobrar pelo menos uma opção em "%".', p_lista;
    END IF;
  END IF;

  INSERT INTO public.ops_rotulo (organization_id, lista, valor, nome, ordem, ativo)
  VALUES (
    p_org_id, p_lista, p_valor, v_nome,
    COALESCE(p_ordem, array_position(v_valores, p_valor)),
    v_ativo
  )
  ON CONFLICT (organization_id, lista, valor) DO UPDATE
     SET nome          = EXCLUDED.nome,
         ordem         = COALESCE(p_ordem, public.ops_rotulo.ordem),
         ativo         = v_ativo,
         atualizado_em = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'por', v_user);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_rotulo(uuid, text, text, text, integer, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_rotulo(uuid, text, text, text, integer, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_rotulo(uuid, text, text, text, integer, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_skill(uuid, text, uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_skill(p_org_id uuid, p_nome text, p_id uuid DEFAULT NULL::uuid, p_ativo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.ops_exige_gestao(p_org_id);
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id   uuid;
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'A especialidade precisa de nome.';
  END IF;

  IF p_id IS NULL THEN
    -- Repetir o nome não é erro de quem escreve: é uma lista que já lá estava.
    INSERT INTO public.ops_skill (organization_id, nome, ativo)
    VALUES (p_org_id, v_nome, COALESCE(p_ativo, true))
    ON CONFLICT (organization_id, nome) DO UPDATE
       SET ativo = COALESCE(p_ativo, true)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_skill
       SET nome = v_nome, ativo = COALESCE(p_ativo, ativo)
     WHERE id = p_id AND organization_id = p_org_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Essa especialidade não é desta organização.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'por', v_user);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_skill(uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_skill(uuid, text, uuid, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_skill(uuid, text, uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_gravar_tipo_trabalho(uuid, text, text, boolean, uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_tipo_trabalho(p_org_id uuid, p_nome text, p_codigo text DEFAULT NULL::text, p_fecha_automatico boolean DEFAULT false, p_id uuid DEFAULT NULL::uuid, p_ativo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.ops_exige_gestao(p_org_id);
  v_id   uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Um tipo de trabalho precisa de nome.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ops_tipo_trabalho
      (organization_id, codigo, nome, fecha_automatico, ativo,
       posicao)
    VALUES
      (p_org_id, COALESCE(nullif(btrim(p_codigo), ''), ''), v_nome,
       COALESCE(p_fecha_automatico, false), COALESCE(p_ativo, true),
       COALESCE((SELECT max(posicao) + 1 FROM public.ops_tipo_trabalho
                  WHERE organization_id = p_org_id), 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_tipo_trabalho
       SET nome = v_nome,
           codigo = COALESCE(nullif(btrim(p_codigo), ''), codigo),
           fecha_automatico = COALESCE(p_fecha_automatico, fecha_automatico),
           ativo = COALESCE(p_ativo, ativo),
           atualizado_em = now()
     WHERE id = p_id AND organization_id = p_org_id
     RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Esse tipo de trabalho não existe nesta organização.';
    END IF;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
  VALUES
    (p_org_id, 'tipo_trabalho', v_id,
     CASE WHEN p_id IS NULL THEN 'criado' ELSE 'alterado' END,
     v_nome, v_user,
     jsonb_build_object('nome', v_nome, 'fecha_automatico', p_fecha_automatico));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_gravar_tipo_trabalho(uuid, text, text, boolean, uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_tipo_trabalho(uuid, text, text, boolean, uuid, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_tipo_trabalho(uuid, text, text, boolean, uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_instalar_pack(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_instalar_pack(_org_id uuid, _pack text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_c      jsonb := public.ops_pack_conteudo(_pack);
  v_item   jsonb;
  v_tarefa jsonb;
  v_opcao  jsonb;
  v_med    text;

  v_cat_id  uuid;
  v_def_id  uuid;
  v_chk_id  uuid;
  v_tar_id  uuid;

  v_criadas  jsonb := jsonb_build_object('categorias', 0, 'medicoes', 0, 'checklists', 0);
  v_saltadas jsonb := jsonb_build_object('categorias', 0, 'medicoes', 0, 'checklists', 0);
  v_pos      integer;

BEGIN
  IF v_c IS NULL THEN
    RAISE EXCEPTION 'Não existe nenhum pack chamado "%".', _pack;
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil up
     WHERE up.utilizador_id = v_user AND up.organization_id = _org_id AND up.ativo
       AND up.funcao IN ('admin', 'gestor')
  ) AND NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Só quem coordena instala um pack de configuração.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Categorias ────────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_c->'categorias') LOOP
    SELECT id INTO v_cat_id FROM public.ops_categoria_ativo
     WHERE organization_id = _org_id AND codigo = v_item->>'codigo';

    IF v_cat_id IS NULL THEN
      INSERT INTO public.ops_categoria_ativo (organization_id, codigo, nome)
      VALUES (_org_id, v_item->>'codigo', v_item->>'nome');
      v_criadas := jsonb_set(v_criadas, '{categorias}',
                             to_jsonb((v_criadas->>'categorias')::int + 1));
    ELSE
      v_saltadas := jsonb_set(v_saltadas, '{categorias}',
                              to_jsonb((v_saltadas->>'categorias')::int + 1));
    END IF;
  END LOOP;

  -- ── Medições ──────────────────────────────────────────────────────────
  -- Sem constraint única em (organização, nome): a verificação é explícita.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_c->'medicoes') LOOP
    SELECT id INTO v_def_id FROM public.ops_medicao_def
     WHERE organization_id = _org_id AND nome = v_item->>'nome';

    IF v_def_id IS NOT NULL THEN
      v_saltadas := jsonb_set(v_saltadas, '{medicoes}',
                              to_jsonb((v_saltadas->>'medicoes')::int + 1));
      CONTINUE;
    END IF;

    SELECT id INTO v_cat_id FROM public.ops_categoria_ativo
     WHERE organization_id = _org_id AND codigo = v_item->>'categoria';

    INSERT INTO public.ops_medicao_def
      (organization_id, categoria_ativo_id, nome, tipo, unidade, limite_min, limite_max)
    VALUES
      (_org_id, v_cat_id, v_item->>'nome', v_item->>'tipo', v_item->>'unidade',
       (v_item->>'min')::numeric, (v_item->>'max')::numeric)
    RETURNING id INTO v_def_id;

    v_pos := 0;
    FOR v_opcao IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'opcoes', '[]'::jsonb)) LOOP
      INSERT INTO public.ops_medicao_opcao
        (medicao_def_id, nome, posicao, e_nao_conforme, cria_corretiva)
      VALUES
        (v_def_id, v_opcao->>'nome', v_pos,
         COALESCE((v_opcao->>'mau')::boolean, false),
         COALESCE((v_opcao->>'corretiva')::boolean, false))
      ON CONFLICT (medicao_def_id, nome) DO NOTHING;
      v_pos := v_pos + 1;
    END LOOP;

    v_criadas := jsonb_set(v_criadas, '{medicoes}',
                           to_jsonb((v_criadas->>'medicoes')::int + 1));
  END LOOP;

  -- ── Checklists ────────────────────────────────────────────────────────
  -- Nascem publicadas. Um pack que chega em rascunho obriga a mais um passo
  -- antes de servir para alguma coisa, e o ponto é poder abrir a primeira
  -- ordem no mesmo dia. Editar depois cria a versão 2, como sempre.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_c->'checklists') LOOP
    IF EXISTS (
      SELECT 1 FROM public.ops_checklist
       WHERE organization_id = _org_id AND codigo = v_item->>'codigo'
    ) THEN
      v_saltadas := jsonb_set(v_saltadas, '{checklists}',
                              to_jsonb((v_saltadas->>'checklists')::int + 1));
      CONTINUE;
    END IF;

    INSERT INTO public.ops_checklist
      (organization_id, codigo, nome, versao, estado, publicada_em)
    VALUES
      (_org_id, v_item->>'codigo', v_item->>'nome', 1, 'publicada', now())
    RETURNING id INTO v_chk_id;

    v_pos := 0;
    FOR v_tarefa IN SELECT * FROM jsonb_array_elements(v_item->'tarefas') LOOP
      INSERT INTO public.ops_checklist_tarefa
        (checklist_id, posicao, nome, tipo, obrigatoria, foto_obrigatoria)
      VALUES
        (v_chk_id, v_pos, v_tarefa->>'nome', COALESCE(v_tarefa->>'tipo', 'inspecao'),
         COALESCE((v_tarefa->>'obrigatoria')::boolean, true),
         COALESCE((v_tarefa->>'foto')::boolean, false))
      RETURNING id INTO v_tar_id;

      FOREACH v_med IN ARRAY
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_tarefa->'medicoes')),
          ARRAY[]::text[])
      LOOP
        SELECT id INTO v_def_id FROM public.ops_medicao_def
         WHERE organization_id = _org_id AND nome = v_med;

        IF v_def_id IS NOT NULL THEN
          INSERT INTO public.ops_checklist_tarefa_medicao (checklist_tarefa_id, medicao_def_id)
          VALUES (v_tar_id, v_def_id)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;

      v_pos := v_pos + 1;
    END LOOP;

    v_criadas := jsonb_set(v_criadas, '{checklists}',
                           to_jsonb((v_criadas->>'checklists')::int + 1));
  END LOOP;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (_org_id, 'configuracao', _org_id, 'pack_instalado',
     'Pack "' || (v_c->>'nome') || '" instalado', v_user, NULL,
     jsonb_build_object('pack', _pack, 'criadas', v_criadas, 'saltadas', v_saltadas));

  RETURN jsonb_build_object(
    'ok', true, 'pack', _pack, 'nome', v_c->>'nome',
    'criadas', v_criadas, 'saltadas', v_saltadas
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_instalar_pack(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_instalar_pack(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_instalar_pack(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_lancar_custo(uuid, text, text, numeric, numeric, text, uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_lancar_custo(p_ordem_id uuid, p_tipo text, p_descricao text, p_quantidade numeric DEFAULT 1, p_valor_unit numeric DEFAULT 0, p_unidade text DEFAULT NULL::text, p_catalog_item_id uuid DEFAULT NULL::uuid, p_compra_linha_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_o      record;
  v_desc   text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_qt     numeric(12,3) := COALESCE(p_quantidade, 1);
  v_unit   numeric(12,2) := COALESCE(p_valor_unit, 0);
  v_origem text := 'manual';
  v_id     uuid;
  v_livre  numeric(12,3);
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF NOT public.ops_pode(v_o.organization_id, 'operations.costs.view') THEN
    RAISE EXCEPTION 'Sem permissão para mexer em custos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se lançam custos numa ordem % — o processo está encerrado.',
      replace(v_o.estado, '_', ' ');
  END IF;

  IF p_tipo = 'mao_obra' THEN
    RAISE EXCEPTION
      'A mão de obra sai das sessões de trabalho e do custo/hora de cada pessoa. Não se lança à mão.';
  END IF;

  IF p_tipo NOT IN ('material','servico','outro') THEN
    RAISE EXCEPTION 'Tipo de custo inválido: %. Vale material, servico ou outro.', p_tipo;
  END IF;

  IF v_qt <= 0 THEN
    RAISE EXCEPTION 'A quantidade tem de ser maior do que zero.';
  END IF;

  IF p_catalog_item_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.catalog_items
       WHERE id = p_catalog_item_id AND organization_id = v_o.organization_id) THEN
      RAISE EXCEPTION 'Esse item de catálogo não é desta organização.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_origem := 'catalogo';

    IF v_desc IS NULL THEN
      SELECT nullif(btrim(descricao), '') INTO v_desc
        FROM public.catalog_items WHERE id = p_catalog_item_id;
    END IF;

    IF p_valor_unit IS NULL THEN
      SELECT COALESCE(custo_material, 0) + COALESCE(custo_mao_obra, 0) INTO v_unit
        FROM public.catalog_items WHERE id = p_catalog_item_id;
    END IF;
  END IF;

  IF p_compra_linha_id IS NOT NULL THEN
    SELECT (l.quantidade - l.ja_atribuido) INTO v_livre
      FROM public.ops_v_compra_linha l
     WHERE l.id = p_compra_linha_id AND l.organization_id = v_o.organization_id;

    IF v_livre IS NULL THEN
      RAISE EXCEPTION 'Essa linha de compra não existe nesta organização.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_qt > v_livre THEN
      RAISE EXCEPTION
        'Dessa compra só sobram % por atribuir, e estás a lançar %.', v_livre, v_qt;
    END IF;

    v_origem := 'compra';

    IF v_desc IS NULL THEN
      SELECT descricao INTO v_desc FROM public.ops_v_compra_linha WHERE id = p_compra_linha_id;
    END IF;

    IF p_valor_unit IS NULL THEN
      SELECT preco_unit INTO v_unit FROM public.ops_v_compra_linha WHERE id = p_compra_linha_id;
    END IF;
  END IF;

  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Um custo precisa de uma descrição. É o que aparece no mapa de custos.';
  END IF;

  INSERT INTO public.ops_custo (
    ordem_id, tipo, descricao, quantidade, valor_unit, total, unidade,
    origem, catalog_item_id, compra_linha_id, criado_por)
  VALUES (
    p_ordem_id, p_tipo, v_desc, v_qt, v_unit, (v_qt * v_unit)::numeric(12,2),
    nullif(btrim(coalesce(p_unidade, '')), ''),
    v_origem, p_catalog_item_id, p_compra_linha_id, v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'custo_lancado', v_desc, v_user, NULL,
     jsonb_build_object('custo_id', v_id, 'tipo', p_tipo, 'origem', v_origem,
                        'total', (v_qt * v_unit)));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'total', (v_qt * v_unit)::numeric(12,2), 'origem', v_origem);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_lancar_custo(uuid, text, text, numeric, numeric, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_lancar_custo(uuid, text, text, numeric, numeric, text, uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_lancar_custo(uuid, text, text, numeric, numeric, text, uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_materializar_planos(uuid, integer)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_materializar_planos(_org_id uuid DEFAULT NULL::uuid, _horizonte_dias integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_plano     record;
  v_dia       date;
  v_ate       date := (now() + (_horizonte_dias || ' days')::interval)::date;
  v_criadas   integer := 0;
  v_planos    integer := 0;
  v_ignorados jsonb := '[]'::jsonb;
  v_codigo    text;
  v_ordem_id  uuid;
  v_desde     date;
BEGIN
  FOR v_plano IN
    SELECT p.* FROM public.ops_plano p
     WHERE p.estado = 'ativo'
       AND p.tipo_recorrencia = 'calendario'      -- ← as dinâmicas ficam de fora
       AND (_org_id IS NULL OR p.organization_id = _org_id)
       AND (p.fim_em IS NULL OR p.fim_em >= current_date)
       AND (v_uid IS NULL
            OR public.is_system_admin_user(v_uid)
            OR p.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid)))
  LOOP
    v_planos := v_planos + 1;
    v_desde := GREATEST(COALESCE(v_plano.materializado_ate + 1, v_plano.inicio_em), current_date);

    BEGIN
      FOR v_dia IN SELECT public.ops_expandir_rrule(v_plano.regra_recorrencia, v_desde, v_ate)
      LOOP
        CONTINUE WHEN EXISTS (
          SELECT 1 FROM public.ops_ordem o
           WHERE o.plano_id = v_plano.id AND o.agendada_para::date = v_dia
        );

        v_codigo := public.ops_proximo_codigo_interno(v_plano.organization_id, 'OT');

        INSERT INTO public.ops_ordem (
          organization_id, codigo, origem, estado, cliente_id, plano_id,
          titulo, responsavel_id, agendada_para
        ) VALUES (
          v_plano.organization_id, v_codigo, 'preventiva', 'agendada',
          v_plano.cliente_id, v_plano.id, v_plano.nome, v_plano.responsavel_id,
          (v_dia + v_plano.hora_prevista)::timestamptz
        ) RETURNING id INTO v_ordem_id;

        INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id, local_id, checklist_id, checklist_versao)
        SELECT v_ordem_id, pa.ativo_id, pa.local_id, pa.checklist_id, c.versao
          FROM public.ops_plano_alvo pa
          LEFT JOIN public.ops_checklist c ON c.id = pa.checklist_id
         WHERE pa.plano_id = v_plano.id;

        INSERT INTO public.ops_ordem_tarefa (
          ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome,
          tipo, skill_id, privada, obrigatoria, tempo_estimado
        )
        SELECT v_ordem_id, oa.id, ct.id, ct.posicao, ct.codigo, ct.nome,
               ct.tipo, ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
          FROM public.ops_ordem_alvo oa
          JOIN public.ops_checklist_tarefa ct ON ct.checklist_id = oa.checklist_id
         WHERE oa.ordem_id = v_ordem_id;

        -- As medições nascem com a ordem, vazias. Congeladas aqui, como a versão da
        -- checklist: mudar os limites amanhã não reescreve o veredicto de ontem.
        INSERT INTO public.ops_ordem_tarefa_medicao (
          ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
        SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
          FROM public.ops_ordem_tarefa ot
          JOIN public.ops_checklist_tarefa_medicao ctm
            ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
          JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
         WHERE ot.ordem_id = v_ordem_id
        ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;

        v_criadas := v_criadas + 1;
      END LOOP;

      UPDATE public.ops_plano SET materializado_ate = v_ate, atualizado_em = now()
       WHERE id = v_plano.id;

    EXCEPTION WHEN OTHERS THEN
      v_ignorados := v_ignorados || jsonb_build_object(
        'plano', v_plano.codigo, 'regra', v_plano.regra_recorrencia, 'erro', SQLERRM);

      -- Um plano que falha em silêncio é a pior falha desta aplicação: as
      -- ordens preventivas deixam de nascer, e só se dá por isso quando o
      -- cliente pergunta pela manutenção que não foi feita.
      --
      -- O `entity_id` vai NULL de propósito — isto não é sobre uma ordem. O
      -- guarda de duplicados usa (tipo, entity_id, pessoa), por isso só se
      -- repete depois de alguém ler o primeiro aviso.
      IF to_regprocedure('public.ops_notificar_coordenacao(uuid,text,text,text,text,uuid,text,uuid)')
         IS NOT NULL THEN
        PERFORM public.ops_notificar_coordenacao(
          v_plano.organization_id, 'operacoes_plano_falhou',
          'O plano ' || v_plano.codigo || ' não gerou ordens',
          'A regra de repetição foi recusada: ' || SQLERRM
            || ' Enquanto não for corrigida, este plano não cria trabalho.',
          '/operacao/planos', NULL, 'urgent');
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'planos_vistos', v_planos, 'ordens_criadas', v_criadas,
    'materializado_ate', v_ate, 'ignorados', v_ignorados
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_materializar_planos(uuid, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_materializar_planos(uuid, integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_materializar_planos(uuid, integer) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_motivos_de_pausa(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_motivos_de_pausa(_org_id uuid)
 RETURNS TABLE(id uuid, nome text, exige_retoma boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_funcao text;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  IF _org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN RETURN; END IF;

  SELECT p.funcao INTO v_funcao
    FROM public.ops_utilizador_perfil p
   WHERE p.utilizador_id = v_user AND p.organization_id = _org_id AND p.ativo;

  RETURN QUERY
    SELECT m.id, m.nome, m.exige_retoma
      FROM public.ops_motivo_pausa m
     WHERE m.organization_id = _org_id
       AND m.ativo
       AND COALESCE(v_funcao, '') = ANY (m.funcoes)
     ORDER BY m.posicao;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_motivos_de_pausa(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_motivos_de_pausa(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_motivos_de_pausa(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_alertas(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_alertas(p_org uuid)
 RETURNS TABLE(tipo text, gravidade smallint, tarefa_id uuid, obra_id uuid, obra_codigo text, obra_titulo text, tarefa_nome text, pessoas uuid[], pessoas_nomes text[], desde timestamp with time zone, minutos_atraso integer, detalhe text, atraso_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_eu     uuid;
  v_funcao text;
BEGIN
  -- Primeiro quem chama (recusa quem não é desta organização), depois o resto.
  SELECT q.utilizador_id, q.funcao INTO v_eu, v_funcao FROM public.ops_quem_sou(p_org) q;
  IF NOT public.ops_pode(p_org, 'operations.orders.view') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.tipo, a.gravidade, a.tarefa_id, a.obra_id, a.obra_codigo, a.obra_titulo, a.tarefa_nome,
         a.pessoas,
         COALESCE((SELECT array_agg(COALESCE(u.name, 'Sem nome') ORDER BY p.k)
                     FROM unnest(a.pessoas) WITH ORDINALITY AS p(id, k)
                     LEFT JOIN public.anew_users u ON u.id = p.id), '{}'::text[]),
         a.desde, a.minutos_atraso, a.detalhe, a.atraso_id
    FROM public.ops_obra_alertas_lista(p_org, NULL) a
   WHERE v_funcao IN ('admin','gestor') OR a.supervisor_id = v_eu
   ORDER BY a.gravidade, a.minutos_atraso DESC NULLS LAST, a.obra_codigo, a.tarefa_nome;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_alertas(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_alertas(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_alertas(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_apagar_tarefa(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_apagar_tarefa(p_tarefa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t    record;
  v_quem record;
BEGIN
  SELECT * INTO v_t FROM public.ops_obra_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia apaga tarefas.');
  IF EXISTS (SELECT 1 FROM public.ops_obra_registo WHERE tarefa_id = p_tarefa_id) THEN
    RAISE EXCEPTION 'Esta tarefa já tem tempo registado. Não se apaga trabalho feito.';
  END IF;
  DELETE FROM public.ops_obra_tarefa WHERE id = p_tarefa_id;
  RETURN jsonb_build_object('ok', true);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_apagar_tarefa(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_apagar_tarefa(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_apagar_tarefa(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_atribuir_tarefa(uuid, uuid[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_atribuir_tarefa(p_tarefa_id uuid, p_pessoas uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t      record;
  v_quem   record;
  v_lista  uuid[] := COALESCE(p_pessoas, ARRAY[]::uuid[]);
  v_mau    uuid;
BEGIN
  SELECT * INTO v_t FROM public.ops_obra_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia distribui o trabalho.');

  SELECT u INTO v_mau FROM unnest(v_lista) AS u
   WHERE NOT EXISTS (
     SELECT 1 FROM public.ops_utilizador_perfil p
      WHERE p.utilizador_id = u AND p.organization_id = v_t.organization_id AND p.ativo)
   LIMIT 1;
  IF v_mau IS NOT NULL THEN
    RAISE EXCEPTION '% não está ativo em Operações nesta organização.',
      COALESCE((SELECT name FROM public.anew_users WHERE id = v_mau), 'Essa pessoa');
  END IF;

  DELETE FROM public.ops_obra_tarefa_pessoa
   WHERE tarefa_id = p_tarefa_id AND NOT (utilizador_id = ANY (v_lista));

  INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id)
  SELECT p_tarefa_id, u, v_t.organization_id, v_t.obra_id FROM (SELECT DISTINCT unnest(v_lista) AS u) x
  ON CONFLICT (tarefa_id, utilizador_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true,
    'pessoas', (SELECT count(*) FROM public.ops_obra_tarefa_pessoa WHERE tarefa_id = p_tarefa_id),
    'conflitos', public.ops_obra_conflitos_impl(p_tarefa_id));
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_atribuir_tarefa(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_atribuir_tarefa(uuid, uuid[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_atribuir_tarefa(uuid, uuid[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_atualizar(uuid, text, text, uuid, uuid, integer, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_atualizar(p_obra_id uuid, p_titulo text, p_morada text, p_gestor_id uuid, p_supervisor_id uuid, p_tolerancia integer DEFAULT NULL::integer, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o    record;
  v_quem record;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia altera a obra.');

  IF nullif(btrim(coalesce(p_titulo,'')), '') IS NULL THEN
    RAISE EXCEPTION 'Uma obra precisa de um título.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[p_gestor_id, p_supervisor_id]) u
     WHERE u IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_utilizador_perfil p
        WHERE p.utilizador_id = u AND p.organization_id = v_o.organization_id AND p.ativo)) THEN
    RAISE EXCEPTION 'O gestor ou o supervisor não está ativo em Operações nesta organização.';
  END IF;

  UPDATE public.ops_obra
     SET titulo = btrim(p_titulo),
         morada = nullif(btrim(coalesce(p_morada,'')), ''),
         gestor_id = p_gestor_id,
         supervisor_id = p_supervisor_id,
         tolerancia_percent = COALESCE(p_tolerancia, tolerancia_percent),
         notas = COALESCE(nullif(btrim(coalesce(p_notas,'')), ''), notas),
         atualizada_em = now()
   WHERE id = p_obra_id;

  RETURN jsonb_build_object('ok', true);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_atualizar(uuid, text, text, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_atualizar(uuid, text, text, uuid, uuid, integer, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_atualizar(uuid, text, text, uuid, uuid, integer, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_aviso_bancada(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_aviso_bancada(p_obra_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT jsonb_build_object(
           'enviado_em', a.enviado_em,
           'sem_especialidade', a.sem_especialidade,
           'para', COALESCE((SELECT jsonb_agg(COALESCE(u.name, 'Sem nome') ORDER BY u.name)
                               FROM public.anew_users u WHERE u.id = ANY (a.destinatarios)), '[]'::jsonb),
           'primeira', a.detalhe->>'primeira',
           'datas', a.detalhe->>'datas',
           'medidas', a.detalhe->>'medidas',
           'local', a.detalhe->>'local')
    INTO v
    FROM public.ops_obra_aviso a
   WHERE a.obra_id = p_obra_id AND a.tipo = 'bancada';
  RETURN COALESCE(v, '{}'::jsonb);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_aviso_bancada(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_aviso_bancada(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_aviso_bancada(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_cliente_avisado(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_cliente_avisado(p_atraso_id uuid, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_a    record;
  v_quem record;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
BEGIN
  SELECT a.*, o.supervisor_id AS obra_supervisor, o.estado AS obra_estado, t.nome AS tarefa_nome
    INTO v_a
    FROM public.ops_obra_tarefa_atraso a
    JOIN public.ops_obra o ON o.id = a.obra_id
    JOIN public.ops_obra_tarefa t ON t.id = a.tarefa_id
   WHERE a.id = p_atraso_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atraso não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_quem FROM public.ops_quem_sou(v_a.organization_id) q;
  IF NOT (
       (v_quem.funcao IN ('admin','gestor') AND public.ops_pode(v_a.organization_id, 'operations.orders.edit'))
    OR (v_a.obra_supervisor = v_quem.utilizador_id
        AND public.ops_pode(v_a.organization_id, 'operations.orders.confirm'))
  ) THEN
    RAISE EXCEPTION 'Só o supervisor da obra ou o gestor marcam o cliente como avisado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_a.cliente_avisado THEN
    RETURN jsonb_build_object('ok', true, 'ja_avisado', true, 'cliente_avisado_em', v_a.cliente_avisado_em);
  END IF;

  UPDATE public.ops_obra_tarefa_atraso
     SET cliente_avisado = true, cliente_avisado_em = now(),
         cliente_avisado_por = v_quem.utilizador_id, nota_cliente = v_nota
   WHERE id = p_atraso_id;

  PERFORM public.ops_obra_evento(v_a.organization_id, v_a.obra_id, 'cliente_avisado',
    v_a.tarefa_nome || COALESCE(': ' || v_nota, ''), v_quem.utilizador_id,
    jsonb_build_object('atraso_id', p_atraso_id, 'tarefa_id', v_a.tarefa_id, 'nota', v_nota));

  RETURN jsonb_build_object('ok', true, 'ja_avisado', false);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_cliente_avisado(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_cliente_avisado(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_cliente_avisado(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_criar(uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_criar(p_org uuid, p_titulo text DEFAULT NULL::text, p_cliente_id uuid DEFAULT NULL::uuid, p_modelo_id uuid DEFAULT NULL::uuid, p_data_inicio date DEFAULT NULL::date, p_orcamento_id uuid DEFAULT NULL::uuid, p_contrato_id uuid DEFAULT NULL::uuid, p_morada text DEFAULT NULL::text, p_gestor_id uuid DEFAULT NULL::uuid, p_supervisor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quem     record;
  v_titulo   text := nullif(btrim(coalesce(p_titulo, '')), '');
  v_cliente  uuid := p_cliente_id;
  v_orc      uuid := p_orcamento_id;
  v_morada   text := p_morada;
  v_q        record;
  v_c        record;
  v_existe   text;
  v_ctr_num  text;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.create', ARRAY['gestor'],
    'Só quem planeia abre obras.');

  -- Do contrato assinado.
  IF p_contrato_id IS NOT NULL THEN
    SELECT c.id, c.organization_id, c.client_id, c.contract_number, c.status,
           c.quote_id, c.notes
      INTO v_c
      FROM public.client_contracts c
     WHERE c.id = p_contrato_id AND c.deleted_at IS NULL;
    IF NOT FOUND OR v_c.organization_id <> p_org THEN
      RAISE EXCEPTION 'Contrato não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_c.status NOT IN ('signed','assinado','active') THEN
      RAISE EXCEPTION 'Só um contrato assinado vira obra (este está "%").', v_c.status;
    END IF;
    SELECT codigo INTO v_existe FROM public.ops_obra
     WHERE contrato_id = p_contrato_id AND estado <> 'cancelada' LIMIT 1;
    IF v_existe IS NOT NULL THEN
      RAISE EXCEPTION 'Esse contrato já tem obra: %.', v_existe;
    END IF;
    IF v_orc IS NOT NULL AND v_c.quote_id IS DISTINCT FROM v_orc THEN
      RAISE EXCEPTION 'Esse contrato não é desse orçamento.';
    END IF;
    v_orc := COALESCE(v_orc, v_c.quote_id);
    v_cliente := COALESCE(v_cliente, v_c.client_id);
    v_ctr_num := COALESCE(v_c.contract_number, 's/ número');
    -- Com orçamento, o título vem dele (mais legível); senão, o número do contrato.
    IF v_orc IS NULL THEN
      v_titulo := COALESCE(v_titulo, 'Obra — contrato ' || v_ctr_num);
    END IF;
  END IF;

  -- Do orçamento aceite (ou do orçamento do contrato).
  IF v_orc IS NOT NULL THEN
    SELECT q.id, q.organization_id, q.cliente_id, q.quote_number, q.title,
           q.obra_endereco, q.estado
      INTO v_q
      FROM public.quotes q
     WHERE q.id = v_orc AND q.deleted_at IS NULL;
    IF NOT FOUND OR v_q.organization_id <> p_org THEN
      RAISE EXCEPTION 'Orçamento não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
    -- Vindo de contrato assinado, o estado do orçamento já não interessa.
    IF p_contrato_id IS NULL AND v_q.estado NOT IN ('aceite','finalizado') THEN
      RAISE EXCEPTION 'Só um orçamento aceite vira obra (este está "%").', v_q.estado;
    END IF;
    SELECT codigo INTO v_existe FROM public.ops_obra
     WHERE orcamento_id = v_orc AND estado <> 'cancelada' LIMIT 1;
    IF v_existe IS NOT NULL THEN
      RAISE EXCEPTION 'Esse orçamento já tem obra: %.', v_existe;
    END IF;
    v_cliente := COALESCE(v_cliente, v_q.cliente_id);
    v_titulo  := COALESCE(v_titulo, nullif(btrim(v_q.title), ''),
                          CASE WHEN p_contrato_id IS NOT NULL
                               THEN 'Obra — contrato ' || v_ctr_num
                               ELSE 'Obra — orçamento ' || COALESCE(v_q.quote_number, '') END);
    v_morada  := COALESCE(nullif(btrim(coalesce(v_morada,'')), ''), v_q.obra_endereco);
  END IF;

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'Uma obra precisa de um título.';
  END IF;

  -- Sem morada escrita: a do orçamento (site) ou a do cliente.
  IF nullif(btrim(coalesce(v_morada, '')), '') IS NULL THEN
    v_morada := public.ops_obra_morada_do_crm(v_cliente, v_orc);
  END IF;

  IF v_cliente IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.anew_clients WHERE id = v_cliente AND organization_id = p_org) THEN
    RAISE EXCEPTION 'Esse cliente não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_modelo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_obra_modelo WHERE id = p_modelo_id AND organization_id = p_org) THEN
    RAISE EXCEPTION 'Esse modelo não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_gestor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = p_gestor_id AND organization_id = p_org AND ativo) THEN
    RAISE EXCEPTION 'O gestor indicado não está ativo em Operações nesta organização.';
  END IF;
  IF p_supervisor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = p_supervisor_id AND organization_id = p_org AND ativo) THEN
    RAISE EXCEPTION 'O supervisor indicado não está ativo em Operações nesta organização.';
  END IF;

  -- Sem supervisor escolhido, ops_obra_criar_impl escolhe um livre nessas datas.
  RETURN public.ops_obra_criar_impl(
    p_org, v_quem.o_utilizador, v_titulo, v_cliente, p_modelo_id, p_data_inicio,
    v_orc, p_contrato_id, v_morada, p_gestor_id, p_supervisor_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_criar(uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_criar(uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_criar(uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_custos(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_custos(p_obra_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o        record;
  v_custos   boolean;
  v_media    numeric;
  v_r        jsonb;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada, ou sem permissão para a ver.' USING ERRCODE = 'no_data_found';
  END IF;

  v_custos := public.ops_pode(v_o.organization_id, 'operations.costs.view');

  SELECT avg(custo_hora) INTO v_media FROM public.ops_utilizador_perfil
   WHERE organization_id = v_o.organization_id AND ativo AND custo_hora IS NOT NULL;

  WITH tarefas AS (
    SELECT t.id, t.fase_id, t.minutos_previstos,
           public.ops_obra_minutos_reais(t.id) AS minutos_reais,
           (SELECT avg(p.custo_hora) FROM public.ops_obra_tarefa_pessoa tp
              JOIN public.ops_utilizador_perfil p
                ON p.utilizador_id = tp.utilizador_id AND p.organization_id = t.organization_id
             WHERE tp.tarefa_id = t.id) AS custo_hora_medio
      FROM public.ops_obra_tarefa t WHERE t.obra_id = p_obra_id
  ),
  pessoas AS (
    SELECT r.utilizador_id,
           round(sum(EXTRACT(EPOCH FROM (COALESCE(r.fim, now()) - r.inicio))) / 60.0, 1) AS minutos,
           max(p.custo_hora) AS custo_hora
      FROM public.ops_obra_registo r
      LEFT JOIN public.ops_utilizador_perfil p
        ON p.utilizador_id = r.utilizador_id AND p.organization_id = r.organization_id
     WHERE r.obra_id = p_obra_id
     GROUP BY r.utilizador_id
  )
  SELECT jsonb_build_object(
    'obra_id', p_obra_id,
    've_custos', v_custos,
    'minutos_previstos', (SELECT COALESCE(sum(minutos_previstos), 0) FROM tarefas),
    'minutos_reais', (SELECT COALESCE(sum(minutos_reais), 0) FROM tarefas),
    'por_fase', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'fase_id', f.id, 'ordem', f.ordem, 'nome', f.nome,
               'minutos_previstos', COALESCE(x.prev, 0), 'minutos_reais', COALESCE(x.reais, 0))
             ORDER BY f.ordem), '[]'::jsonb)
        FROM public.ops_obra_fase f
        LEFT JOIN (SELECT fase_id, sum(minutos_previstos) prev, sum(minutos_reais) reais
                     FROM tarefas GROUP BY fase_id) x ON x.fase_id = f.id
       WHERE f.obra_id = p_obra_id),
    'por_pessoa', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'utilizador_id', pe.utilizador_id,
               'nome', COALESCE(u.name, 'Sem nome'),
               'minutos', pe.minutos,
               'custo', CASE WHEN v_custos AND pe.custo_hora IS NOT NULL
                             THEN round(pe.minutos / 60.0 * pe.custo_hora, 2) END,
               'sem_tarifa', CASE WHEN v_custos THEN pe.custo_hora IS NULL END)
             ORDER BY pe.minutos DESC), '[]'::jsonb)
        FROM pessoas pe LEFT JOIN public.anew_users u ON u.id = pe.utilizador_id),
    'custo_previsto', CASE WHEN v_custos THEN (
       SELECT round(COALESCE(sum(minutos_previstos / 60.0 * COALESCE(custo_hora_medio, v_media, 0)), 0), 2)
         FROM tarefas) END,
    'custo_real', CASE WHEN v_custos THEN (
       SELECT round(COALESCE(sum(minutos / 60.0 * COALESCE(custo_hora, 0)), 0), 2) FROM pessoas) END,
    'sem_tarifa', CASE WHEN v_custos THEN (
       SELECT count(*) FROM pessoas WHERE custo_hora IS NULL) END,
    'orcado_mao_obra', CASE WHEN v_custos AND v_o.orcamento_id IS NOT NULL THEN (
       SELECT round(COALESCE(sum(COALESCE(l.custo_mao_obra_unit, 0) * COALESCE(l.qt, 1)), 0), 2)
         FROM public.quote_lines l
         JOIN public.quotes q ON q.id = l.quote_id
        WHERE l.quote_id = v_o.orcamento_id AND q.organization_id = v_o.organization_id) END
  ) INTO v_r;

  RETURN v_r;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_custos(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_custos(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_custos(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_de_orcamento(uuid, uuid, uuid, timestamp with time zone, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_de_orcamento(p_orcamento_id uuid, p_local_id uuid DEFAULT NULL::uuid, p_checklist_id uuid DEFAULT NULL::uuid, p_agendada_para timestamp with time zone DEFAULT NULL::timestamp with time zone, p_responsavel_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('ops.medicao', 'autorizada', true);
  r := public.ops_obra_de_orcamento_impl(
         p_orcamento_id, p_local_id, p_checklist_id, p_agendada_para, p_responsavel_id);
  PERFORM set_config('ops.medicao', '', true);
  RETURN r;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_de_orcamento(uuid, uuid, uuid, timestamp with time zone, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_de_orcamento(uuid, uuid, uuid, timestamp with time zone, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_de_orcamento(uuid, uuid, uuid, timestamp with time zone, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_decidir_extra(uuid, text, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_decidir_extra(p_extra_id uuid, p_acao text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_e      record;
  v_quem   record;
  v_novo   text;
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')), '');
BEGIN
  SELECT * INTO v_e FROM public.ops_obra_extra WHERE id = p_extra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trabalho extra não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_e.organization_id, 'operations.orders.approve', ARRAY['gestor'],
    'Só o gestor decide os trabalhos extra.');

  v_novo := CASE
    WHEN p_acao = 'aprovar' AND v_e.estado = 'registado' THEN 'aprovado'
    WHEN p_acao = 'recusar' AND v_e.estado IN ('registado','aprovado') THEN 'recusado'
    WHEN p_acao = 'enviar'  AND v_e.estado = 'aprovado' THEN 'enviado'
  END;
  IF v_novo IS NULL THEN
    RAISE EXCEPTION 'Não se pode "%" um extra %.', p_acao, v_e.estado;
  END IF;
  IF v_novo = 'recusado' AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Recusar exige motivo.';
  END IF;

  UPDATE public.ops_obra_extra
     SET estado = v_novo,
         motivo_recusa = CASE WHEN v_novo = 'recusado' THEN v_motivo ELSE motivo_recusa END,
         decidido_por = v_quem.o_utilizador,
         decidido_em = now(),
         enviado_em = CASE WHEN v_novo = 'enviado' THEN now() ELSE enviado_em END
   WHERE id = p_extra_id;

  PERFORM public.ops_obra_evento(v_e.organization_id, v_e.obra_id, 'extra_' || v_novo,
    v_e.descricao, v_quem.o_utilizador, jsonb_build_object('extra_id', p_extra_id, 'motivo', v_motivo));

  RETURN jsonb_build_object('ok', true, 'estado', v_novo);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_decidir_extra(uuid, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_decidir_extra(uuid, text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_decidir_extra(uuid, text, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_distribuir(uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_distribuir(p_obra_id uuid, p_refazer boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o    record;
  v_quem record;
  v_n    integer;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia distribui o trabalho.');
  IF v_o.estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %; já não se planeia.', v_o.estado;
  END IF;

  IF p_refazer THEN
    DELETE FROM public.ops_obra_tarefa_pessoa tp
     USING public.ops_obra_tarefa t
     WHERE t.id = tp.tarefa_id AND t.obra_id = p_obra_id
       AND t.estado IN ('por_fazer','rejeitada')
       AND NOT EXISTS (SELECT 1 FROM public.ops_obra_registo r WHERE r.tarefa_id = t.id);
  END IF;

  v_n := public.ops_obra_distribuir_impl(p_obra_id);
  PERFORM public.ops_obra_evento(v_o.organization_id, p_obra_id, 'distribuida', NULL,
    v_quem.o_utilizador, jsonb_build_object('tarefas', v_n, 'refazer', p_refazer));
  RETURN jsonb_build_object('ok', true, 'tarefas', v_n);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_distribuir(uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_distribuir(uuid, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_distribuir(uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_ficha_local(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_ficha_local(p_obra_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o   record;
  v_orc uuid;
  v_f   jsonb;
BEGIN
  SELECT id, organization_id, orcamento_id, contrato_id INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  v_orc := v_o.orcamento_id;
  IF v_orc IS NULL AND v_o.contrato_id IS NOT NULL THEN
    v_orc := public.ops_contrato_orcamento(v_o.contrato_id);
  END IF;
  IF v_orc IS NULL
     OR NOT public.ops_obra_crm_tem('anew_address_building', ARRAY['address_id'])
     OR NOT public.ops_obra_crm_tem('anew_addresses', ARRAY['id','floor'])
     OR NOT public.ops_obra_crm_tem('quotes', ARRAY['id','site_address_id']) THEN
    RETURN '{}'::jsonb;
  END IF;

  EXECUTE 'SELECT (to_jsonb(b) - ''created_by'' - ''updated_by'' - ''created_at'')
                  || jsonb_build_object(''piso'', a.floor)
             FROM public.quotes q
             JOIN public.anew_address_building b ON b.address_id = q.site_address_id
             LEFT JOIN public.anew_addresses a ON a.id = q.site_address_id
            WHERE q.id = $1'
     INTO v_f USING v_orc;
  RETURN COALESCE(v_f, '{}'::jsonb);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_ficha_local(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_ficha_local(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_ficha_local(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_gravar_dependencias(uuid, uuid[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_gravar_dependencias(p_tarefa_id uuid, p_depende_de uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t     record;
  v_quem  record;
  v_lista uuid[];
  v_mau   uuid;
BEGIN
  SELECT t.*, o.estado AS obra_estado INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia muda as dependências.');
  IF v_t.obra_estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %; já não se planeia.', v_t.obra_estado;
  END IF;

  -- Sem repetidos, pela ordem dada.
  SELECT COALESCE(array_agg(u ORDER BY pos), '{}') INTO v_lista
    FROM (SELECT u, min(pos) AS pos
            FROM unnest(COALESCE(p_depende_de, '{}'::uuid[])) WITH ORDINALITY AS x(u, pos)
           WHERE u IS NOT NULL GROUP BY u) z;
  IF p_tarefa_id = ANY (v_lista) THEN
    RAISE EXCEPTION 'Uma tarefa não pode depender de si própria.';
  END IF;
  SELECT u INTO v_mau FROM unnest(v_lista) u
   WHERE NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa d WHERE d.id = u AND d.obra_id = v_t.obra_id)
   LIMIT 1;
  IF v_mau IS NOT NULL THEN
    RAISE EXCEPTION 'Uma tarefa só pode depender de outra da mesma obra.';
  END IF;

  -- Primeiro a coluna (o trigger tira a antiga e põe a nova), depois o resto.
  UPDATE public.ops_obra_tarefa SET depende_de = v_lista[1], atualizada_em = now()
   WHERE id = p_tarefa_id AND depende_de IS DISTINCT FROM v_lista[1];
  DELETE FROM public.ops_obra_tarefa_dependencia
   WHERE tarefa_id = p_tarefa_id AND NOT (depende_de_id = ANY (v_lista));
  INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
  SELECT p_tarefa_id, u, v_t.organization_id, v_t.obra_id FROM unnest(v_lista) u
  ON CONFLICT DO NOTHING;

  PERFORM public.ops_obra_evento(v_t.organization_id, v_t.obra_id, 'dependencias', v_t.nome,
    v_quem.o_utilizador, jsonb_build_object('tarefa_id', p_tarefa_id, 'depende_de', to_jsonb(v_lista)));

  RETURN jsonb_build_object(
    'ok', true,
    'dependencias', to_jsonb(v_lista),
    'antes_de_acabar', COALESCE((
       SELECT jsonb_agg(d.id) FROM public.ops_obra_tarefa d
        WHERE d.id = ANY (v_lista) AND v_t.inicio_planeado IS NOT NULL
          AND COALESCE(d.fim_planeado, d.inicio_planeado) > v_t.inicio_planeado), '[]'::jsonb));
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_gravar_dependencias(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_dependencias(uuid, uuid[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_dependencias(uuid, uuid[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_gravar_fase(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_gravar_fase(p_fase_id uuid, p_nome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f    record;
  v_quem record;
BEGIN
  SELECT * INTO v_f FROM public.ops_obra_fase WHERE id = p_fase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fase não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_f.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia muda as fases.');
  IF nullif(btrim(coalesce(p_nome,'')), '') IS NULL THEN
    RAISE EXCEPTION 'Uma fase precisa de nome.';
  END IF;
  UPDATE public.ops_obra_fase SET nome = btrim(p_nome) WHERE id = p_fase_id;
  RETURN jsonb_build_object('ok', true);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_gravar_fase(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_fase(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_fase(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_gravar_modelo(uuid, uuid, text, text, text, jsonb, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_gravar_modelo(p_org uuid, p_modelo_id uuid, p_nome text, p_descricao text, p_tipo_servico text, p_fases jsonb, p_ativo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quem    record;
  v_id      uuid := p_modelo_id;
  v_nome    text := nullif(btrim(coalesce(p_nome, '')), '');
  v_fase    jsonb;
  v_tarefa  jsonb;
  v_fase_id uuid;
  v_tid     uuid;
  v_ordens  smallint[] := '{}';
  v_manter  uuid[] := '{}';
  v_pos     integer;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.checklists.manage', ARRAY['gestor'],
    'Só quem planeia gere os modelos de obra.');

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Um modelo precisa de nome.';
  END IF;
  IF p_fases IS NULL OR jsonb_typeof(p_fases) <> 'array' OR jsonb_array_length(p_fases) = 0 THEN
    RAISE EXCEPTION 'Um modelo precisa de pelo menos uma fase.';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.ops_obra_modelo (organization_id, nome, descricao, tipo_servico, ativo)
    VALUES (p_org, v_nome, nullif(btrim(coalesce(p_descricao,'')), ''),
            nullif(btrim(coalesce(p_tipo_servico,'')), ''), COALESCE(p_ativo, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_obra_modelo
       SET nome = v_nome,
           descricao = nullif(btrim(coalesce(p_descricao,'')), ''),
           tipo_servico = nullif(btrim(coalesce(p_tipo_servico,'')), ''),
           ativo = COALESCE(p_ativo, true),
           atualizado_em = now()
     WHERE id = v_id AND organization_id = p_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Modelo não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  FOR v_fase IN SELECT * FROM jsonb_array_elements(p_fases) LOOP
    IF nullif(btrim(coalesce(v_fase->>'nome','')), '') IS NULL THEN
      RAISE EXCEPTION 'Há uma fase sem nome.';
    END IF;

    INSERT INTO public.ops_obra_modelo_fase (organization_id, modelo_id, ordem, nome)
    VALUES (p_org, v_id, (v_fase->>'ordem')::smallint, btrim(v_fase->>'nome'))
    ON CONFLICT (modelo_id, ordem) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id INTO v_fase_id;

    v_ordens := v_ordens || (v_fase->>'ordem')::smallint;
    v_pos := 0;

    FOR v_tarefa IN SELECT * FROM jsonb_array_elements(COALESCE(v_fase->'tarefas', '[]'::jsonb)) LOOP
      v_pos := v_pos + 1;
      IF nullif(btrim(coalesce(v_tarefa->>'nome','')), '') IS NULL THEN
        RAISE EXCEPTION 'Há uma tarefa sem nome na fase "%".', v_fase->>'nome';
      END IF;
      IF COALESCE((v_tarefa->>'minutos_previstos')::integer, 0) <= 0 THEN
        RAISE EXCEPTION 'A tarefa "%" precisa de um tempo previsto maior que zero.', v_tarefa->>'nome';
      END IF;

      v_tid := NULL;
      IF v_tarefa ? 'id' AND nullif(v_tarefa->>'id','') IS NOT NULL THEN
        UPDATE public.ops_obra_modelo_tarefa
           SET modelo_fase_id = v_fase_id, ordem = v_pos,
               nome = btrim(v_tarefa->>'nome'),
               procedimento = nullif(btrim(coalesce(v_tarefa->>'procedimento','')), ''),
               materiais = nullif(btrim(coalesce(v_tarefa->>'materiais','')), ''),
               ferramentas = nullif(btrim(coalesce(v_tarefa->>'ferramentas','')), ''),
               minutos_previstos = (v_tarefa->>'minutos_previstos')::integer
         WHERE id = (v_tarefa->>'id')::uuid AND modelo_id = v_id
        RETURNING id INTO v_tid;
      END IF;

      IF v_tid IS NULL THEN
        INSERT INTO public.ops_obra_modelo_tarefa
          (organization_id, modelo_id, modelo_fase_id, ordem, nome, procedimento,
           materiais, ferramentas, minutos_previstos)
        VALUES (p_org, v_id, v_fase_id, v_pos, btrim(v_tarefa->>'nome'),
                nullif(btrim(coalesce(v_tarefa->>'procedimento','')), ''),
                nullif(btrim(coalesce(v_tarefa->>'materiais','')), ''),
                nullif(btrim(coalesce(v_tarefa->>'ferramentas','')), ''),
                (v_tarefa->>'minutos_previstos')::integer)
        RETURNING id INTO v_tid;
      END IF;

      v_manter := v_manter || v_tid;
    END LOOP;
  END LOOP;

  DELETE FROM public.ops_obra_modelo_tarefa
   WHERE modelo_id = v_id AND NOT (id = ANY (v_manter));
  DELETE FROM public.ops_obra_modelo_fase
   WHERE modelo_id = v_id AND NOT (ordem = ANY (v_ordens));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id,
    'tarefas', (SELECT count(*) FROM public.ops_obra_modelo_tarefa WHERE modelo_id = v_id));
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_gravar_modelo(uuid, uuid, text, text, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_modelo(uuid, uuid, text, text, text, jsonb, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_modelo(uuid, uuid, text, text, text, jsonb, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_gravar_tarefa(uuid, uuid, uuid, text, integer, text, text, text, date, date, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_gravar_tarefa(p_obra_id uuid, p_tarefa_id uuid, p_fase_id uuid, p_nome text, p_minutos integer, p_procedimento text DEFAULT NULL::text, p_materiais text DEFAULT NULL::text, p_ferramentas text DEFAULT NULL::text, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_depende_de uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o     record;
  v_quem  record;
  v_id    uuid := p_tarefa_id;
  v_nome  text := nullif(btrim(coalesce(p_nome,'')), '');
  v_ordem integer;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia cria ou altera tarefas.');

  IF v_o.estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %; já não se planeia.', v_o.estado;
  END IF;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Uma tarefa precisa de nome.';
  END IF;
  IF COALESCE(p_minutos, 0) <= 0 THEN
    RAISE EXCEPTION 'O tempo previsto tem de ser maior que zero.';
  END IF;
  IF p_inicio IS NOT NULL AND p_fim IS NOT NULL AND p_fim < p_inicio THEN
    RAISE EXCEPTION 'A tarefa acaba antes de começar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ops_obra_fase WHERE id = p_fase_id AND obra_id = p_obra_id) THEN
    RAISE EXCEPTION 'Essa fase não é desta obra.';
  END IF;
  IF p_depende_de IS NOT NULL AND (p_depende_de = v_id OR NOT EXISTS (
    SELECT 1 FROM public.ops_obra_tarefa WHERE id = p_depende_de AND obra_id = p_obra_id)) THEN
    RAISE EXCEPTION 'A tarefa de que depende tem de ser outra tarefa desta obra.';
  END IF;

  IF v_id IS NULL THEN
    SELECT COALESCE(max(ordem), 0) + 1 INTO v_ordem FROM public.ops_obra_tarefa WHERE fase_id = p_fase_id;
    INSERT INTO public.ops_obra_tarefa (
      organization_id, obra_id, fase_id, ordem, nome, procedimento, materiais,
      ferramentas, minutos_previstos, inicio_planeado, fim_planeado, depende_de)
    VALUES (
      v_o.organization_id, p_obra_id, p_fase_id, v_ordem, v_nome,
      nullif(btrim(coalesce(p_procedimento,'')), ''),
      nullif(btrim(coalesce(p_materiais,'')), ''),
      nullif(btrim(coalesce(p_ferramentas,'')), ''),
      p_minutos, p_inicio, COALESCE(p_fim, p_inicio), p_depende_de)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_obra_tarefa
       SET fase_id = p_fase_id, nome = v_nome,
           procedimento = nullif(btrim(coalesce(p_procedimento,'')), ''),
           materiais = nullif(btrim(coalesce(p_materiais,'')), ''),
           ferramentas = nullif(btrim(coalesce(p_ferramentas,'')), ''),
           minutos_previstos = p_minutos,
           inicio_planeado = p_inicio,
           fim_planeado = COALESCE(p_fim, p_inicio),
           depende_de = p_depende_de,
           atualizada_em = now()
     WHERE id = v_id AND obra_id = p_obra_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tarefa não encontrada nesta obra.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id,
                            'conflitos', public.ops_obra_conflitos_impl(v_id));
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_gravar_tarefa(uuid, uuid, uuid, text, integer, text, text, text, date, date, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_tarefa(uuid, uuid, uuid, text, integer, text, text, text, date, date, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_tarefa(uuid, uuid, uuid, text, integer, text, text, text, date, date, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_iniciar_tarefa(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_iniciar_tarefa(p_tarefa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t      record;
  v_quem   record;
  v_outra  text;
  v_dep    record;
BEGIN
  SELECT t.*, o.estado AS obra_estado INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.execute', NULL, NULL);

  IF v_quem.o_funcao NOT IN ('admin','gestor') AND NOT EXISTS (
    SELECT 1 FROM public.ops_obra_tarefa_pessoa
     WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador) THEN
    RAISE EXCEPTION 'Não estás nesta tarefa. Pede ao gestor para te atribuir.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_t.obra_estado NOT IN ('planeada','em_curso') THEN
    RAISE EXCEPTION 'A obra está %. Não se começa trabalho nela.', v_t.obra_estado;
  END IF;
  IF v_t.estado NOT IN ('por_fazer','em_curso','rejeitada') THEN
    RAISE EXCEPTION 'Esta tarefa já está %.', v_t.estado;
  END IF;

  IF v_t.depende_de IS NOT NULL THEN
    SELECT nome, estado INTO v_dep FROM public.ops_obra_tarefa WHERE id = v_t.depende_de;
    IF v_dep.estado NOT IN ('feita','validada') THEN
      RAISE EXCEPTION 'Esta tarefa depende de "%", que ainda não está feita.', v_dep.nome;
    END IF;
  END IF;

  SELECT t.nome INTO v_outra
    FROM public.ops_obra_registo r JOIN public.ops_obra_tarefa t ON t.id = r.tarefa_id
   WHERE r.utilizador_id = v_quem.o_utilizador AND r.fim IS NULL LIMIT 1;
  IF v_outra IS NOT NULL THEN
    RAISE EXCEPTION 'Já tens "%" a correr. Termina essa primeiro.', v_outra;
  END IF;

  INSERT INTO public.ops_obra_registo (organization_id, obra_id, tarefa_id, utilizador_id)
  VALUES (v_t.organization_id, v_t.obra_id, p_tarefa_id, v_quem.o_utilizador);

  UPDATE public.ops_obra_tarefa
     SET estado = 'em_curso',
         iniciada_em = COALESCE(iniciada_em, now()),
         atualizada_em = now()
   WHERE id = p_tarefa_id;

  -- A primeira tarefa a arrancar põe a obra em curso.
  UPDATE public.ops_obra
     SET estado = 'em_curso', iniciada_em = COALESCE(iniciada_em, now()), atualizada_em = now()
   WHERE id = v_t.obra_id AND estado = 'planeada';

  RETURN jsonb_build_object('ok', true, 'estado', 'em_curso',
    'minutos_reais', public.ops_obra_minutos_reais(p_tarefa_id),
    'minutos_previstos', v_t.minutos_previstos);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_iniciar_tarefa(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_iniciar_tarefa(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_iniciar_tarefa(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_material_chega(uuid, date, text, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_material_chega(p_tarefa_id uuid, p_data date, p_nota text DEFAULT NULL::text, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t       record;
  v_quem    record;
  v_ini     date;
  v_fim     date;
  v_mexidas jsonb := '{}'::jsonb;
  v_obra_ant date;
  v_obra_novo date;
  v_res     jsonb;
  v_moveu   boolean := false;
BEGIN
  SELECT t.*, o.estado AS obra_estado, o.supervisor_id AS obra_supervisor
    INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_quem FROM public.ops_quem_sou(v_t.organization_id) q;
  IF NOT (
       (v_quem.funcao IN ('admin','gestor') AND public.ops_pode(v_t.organization_id, 'operations.orders.edit'))
    OR (v_t.obra_supervisor = v_quem.utilizador_id
        AND public.ops_pode(v_t.organization_id, 'operations.orders.confirm'))
  ) THEN
    RAISE EXCEPTION 'Só o gestor ou o supervisor da obra dizem quando chega o material.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_t.obra_estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %.', v_t.obra_estado;
  END IF;

  SELECT max(COALESCE(fim_planeado, inicio_planeado)) INTO v_obra_ant
    FROM public.ops_obra_tarefa WHERE obra_id = v_t.obra_id;

  BEGIN
    UPDATE public.ops_obra_tarefa
       SET material_chega_em     = p_data,
           material_chega_origem = CASE WHEN p_data IS NULL THEN NULL ELSE 'manual' END,
           material_chega_nota   = CASE WHEN p_data IS NULL THEN NULL
                                        ELSE left(nullif(btrim(COALESCE(p_nota, '')), ''), 500) END,
           atualizada_em         = now()
     WHERE id = p_tarefa_id;

    IF p_data IS NOT NULL AND v_t.estado = 'por_fazer' AND v_t.inicio_planeado IS NOT NULL
       AND v_t.inicio_planeado < p_data
       AND NOT EXISTS (SELECT 1 FROM public.ops_obra_registo r WHERE r.tarefa_id = p_tarefa_id) THEN
      v_ini := public.ops_obra_somar_dias_uteis_org(v_t.organization_id, p_data, 0);
      v_fim := public.ops_obra_somar_dias_uteis_org(v_t.organization_id, v_ini,
                 public.ops_obra_dias_uteis_entre_org(v_t.organization_id, v_t.inicio_planeado,
                                                      COALESCE(v_t.fim_planeado, v_t.inicio_planeado)));
      UPDATE public.ops_obra_tarefa
         SET inicio_original = CASE WHEN inicio_original IS NULL AND fim_original IS NULL
                                    THEN inicio_planeado ELSE inicio_original END,
             fim_original    = CASE WHEN inicio_original IS NULL AND fim_original IS NULL
                                    THEN fim_planeado ELSE fim_original END,
             inicio_planeado = v_ini,
             fim_planeado    = v_fim
       WHERE id = p_tarefa_id;
      v_moveu := true;
      v_mexidas := public.ops_obra_empurrar_dependentes_impl(
                     p_tarefa_id, COALESCE(v_t.fim_planeado, v_t.inicio_planeado));
    END IF;

    SELECT max(COALESCE(fim_planeado, inicio_planeado)) INTO v_obra_novo
      FROM public.ops_obra_tarefa WHERE obra_id = v_t.obra_id;

    IF NOT COALESCE(p_simular, false) THEN
      PERFORM public.ops_obra_evento(v_t.organization_id, v_t.obra_id, 'material',
        v_t.nome || ': material ' || COALESCE('chega a ' || to_char(p_data, 'DD/MM/YYYY'), 'já não condiciona'),
        v_quem.utilizador_id,
        jsonb_build_object('tarefa_id', p_tarefa_id, 'data', p_data, 'moveu', v_moveu,
                           'empurradas', (SELECT count(*) FROM jsonb_object_keys(v_mexidas)),
                           'fim_obra_anterior', v_obra_ant, 'fim_obra_novo', v_obra_novo));
    END IF;

    v_res := jsonb_build_object(
      'ok', true,
      'simulado', COALESCE(p_simular, false),
      'moveu', v_moveu,
      'novo_inicio', CASE WHEN v_moveu THEN v_ini END,
      'novo_fim', CASE WHEN v_moveu THEN v_fim END,
      'empurradas', COALESCE((SELECT jsonb_agg(e.value ORDER BY e.value->>'novo_inicio', e.value->>'nome')
                                FROM jsonb_each(v_mexidas) e), '[]'::jsonb),
      'fim_obra_anterior', v_obra_ant,
      'fim_obra_novo', v_obra_novo);

    IF COALESCE(p_simular, false) THEN
      RAISE EXCEPTION 'simulação' USING ERRCODE = 'OB001';
    END IF;
  EXCEPTION WHEN SQLSTATE 'OB001' THEN
    NULL;
  END;

  RETURN v_res;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_material_chega(uuid, date, text, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_material_chega(uuid, date, text, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_material_chega(uuid, date, text, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_modelo_por_defeito(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_modelo_por_defeito(p_modelo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.ops_obra_modelo WHERE id = p_modelo_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Tipo de obra não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.ops_obra_pode_gerir_modelos(v_org) THEN
    RAISE EXCEPTION 'Sem permissão para gerir modelos nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.ops_obra_modelo SET por_defeito = false WHERE organization_id = v_org AND por_defeito AND id <> p_modelo_id;
  UPDATE public.ops_obra_modelo SET por_defeito = true, ativo = true, atualizado_em = now() WHERE id = p_modelo_id;
  RETURN jsonb_build_object('ok', true);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_modelo_por_defeito(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_modelo_por_defeito(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_modelo_por_defeito(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_morada_sugerida(uuid, uuid, uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_morada_sugerida(p_org uuid, p_cliente_id uuid DEFAULT NULL::uuid, p_orcamento_id uuid DEFAULT NULL::uuid, p_contrato_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quem    record;
  v_cliente uuid := p_cliente_id;
  v_orc     uuid := p_orcamento_id;
  v_org     uuid;
  v_texto   text;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.create', ARRAY['gestor'], 'Só quem planeia abre obras.');

  IF p_contrato_id IS NOT NULL AND to_regclass('public.client_contracts') IS NOT NULL THEN
    EXECUTE 'SELECT organization_id, quote_id, client_id FROM public.client_contracts
              WHERE id = $1 AND deleted_at IS NULL'
       INTO v_org, v_orc, v_cliente USING p_contrato_id;
    IF v_org IS DISTINCT FROM p_org THEN RETURN NULL; END IF;
  END IF;

  IF v_orc IS NOT NULL THEN
    SELECT q.organization_id, COALESCE(v_cliente, q.cliente_id), nullif(btrim(q.obra_endereco), '')
      INTO v_org, v_cliente, v_texto
      FROM public.quotes q WHERE q.id = v_orc AND q.deleted_at IS NULL;
    IF v_org IS DISTINCT FROM p_org THEN RETURN NULL; END IF;
  END IF;

  IF v_cliente IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.anew_clients WHERE id = v_cliente AND organization_id = p_org) THEN
    RETURN NULL;
  END IF;

  RETURN COALESCE(v_texto, public.ops_obra_morada_do_crm(v_cliente, v_orc));
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_morada_sugerida(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_morada_sugerida(uuid, uuid, uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_morada_sugerida(uuid, uuid, uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_mudar_estado(uuid, text, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_mudar_estado(p_obra_id uuid, p_estado text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o      record;
  v_quem   record;
  v_falta  integer;
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')), '');
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia muda o estado da obra.');

  IF NOT (
       (v_o.estado = 'planeada' AND p_estado IN ('em_curso','suspensa','cancelada'))
    OR (v_o.estado = 'em_curso' AND p_estado IN ('suspensa','concluida','cancelada'))
    OR (v_o.estado = 'suspensa' AND p_estado IN ('em_curso','cancelada'))
  ) THEN
    RAISE EXCEPTION 'Uma obra % não passa a %.', replace(v_o.estado,'_',' '), replace(p_estado,'_',' ');
  END IF;

  IF p_estado IN ('suspensa','cancelada') AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Suspender ou cancelar uma obra exige motivo.';
  END IF;

  IF p_estado = 'concluida' THEN
    SELECT count(*) INTO v_falta FROM public.ops_obra_tarefa
     WHERE obra_id = p_obra_id AND estado <> 'validada';
    IF v_falta > 0 THEN
      RAISE EXCEPTION 'Faltam % tarefa(s) por validar. Uma obra só se conclui com tudo validado.', v_falta;
    END IF;
  END IF;

  -- Suspender pára os relógios de quem estiver a trabalhar nela.
  IF p_estado IN ('suspensa','cancelada') THEN
    UPDATE public.ops_obra_registo SET fim = now()
     WHERE obra_id = p_obra_id AND fim IS NULL;
  END IF;

  UPDATE public.ops_obra
     SET estado = p_estado,
         motivo_estado = COALESCE(v_motivo, motivo_estado),
         iniciada_em = CASE WHEN p_estado = 'em_curso' THEN COALESCE(iniciada_em, now()) ELSE iniciada_em END,
         concluida_em = CASE WHEN p_estado = 'concluida' THEN now() ELSE concluida_em END,
         atualizada_em = now()
   WHERE id = p_obra_id;

  PERFORM public.ops_obra_evento(v_o.organization_id, p_obra_id, 'estado', v_motivo,
    v_quem.o_utilizador, jsonb_build_object('de', v_o.estado, 'para', p_estado));

  RETURN jsonb_build_object('ok', true, 'estado', p_estado);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_mudar_estado(uuid, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_mudar_estado(uuid, text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_mudar_estado(uuid, text, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_planear_tarefa(uuid, date, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_planear_tarefa(p_tarefa_id uuid, p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t    record;
  v_quem record;
BEGIN
  SELECT t.*, o.estado AS obra_estado INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia mexe nas datas.');
  IF v_t.obra_estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %; já não se planeia.', v_t.obra_estado;
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN
    RAISE EXCEPTION 'Datas inválidas: a tarefa tem de começar e acabar, por esta ordem.';
  END IF;

  UPDATE public.ops_obra_tarefa
     SET inicio_planeado = p_inicio, fim_planeado = p_fim, atualizada_em = now()
   WHERE id = p_tarefa_id;

  RETURN jsonb_build_object('ok', true, 'conflitos', public.ops_obra_conflitos_impl(p_tarefa_id));
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_planear_tarefa(uuid, date, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_planear_tarefa(uuid, date, date) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_planear_tarefa(uuid, date, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_porque_inicio(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_porque_inicio(p_obra_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o      record;
  v_inicio date;
  v_desde  date;
  v_funcs  text[];
BEGIN
  SELECT id, organization_id, estado, inicio_auto, data_inicio_prevista,
         (criada_em AT TIME ZONE 'Europe/Lisbon')::date AS criada
    INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT COALESCE(min(inicio_planeado), v_o.data_inicio_prevista) INTO v_inicio
    FROM public.ops_obra_tarefa WHERE obra_id = p_obra_id;
  -- Desde o último replaneamento, se houve; senão, desde a criação.
  SELECT COALESCE(max((e.criado_em AT TIME ZONE 'Europe/Lisbon')::date), v_o.criada) INTO v_desde
    FROM public.ops_evento e
   WHERE e.entidade = 'obra' AND e.entidade_id = p_obra_id AND e.tipo IN ('criada','replaneada');
  v_desde := GREATEST(v_desde, v_o.criada);
  v_funcs := CASE WHEN EXISTS (SELECT 1 FROM public.ops_utilizador_perfil
                                WHERE organization_id = v_o.organization_id AND ativo
                                  AND funcao IN ('tecnico','operador'))
                  THEN ARRAY['tecnico','operador']
                  ELSE ARRAY['admin','gestor','supervisor','tecnico','operador'] END;

  RETURN jsonb_build_object(
    'inicio', v_inicio,
    'desde', v_desde,
    'auto', v_o.inicio_auto,
    'equipa', (SELECT count(*) FROM public.ops_utilizador_perfil
                WHERE organization_id = v_o.organization_id AND ativo AND funcao = ANY (v_funcs)),
    'nesta_obra', COALESCE((
      SELECT jsonb_agg(DISTINCT COALESCE(u.name, 'Sem nome'))
        FROM public.ops_obra_tarefa_pessoa tp
        LEFT JOIN public.anew_users u ON u.id = tp.utilizador_id
       WHERE tp.obra_id = p_obra_id), '[]'::jsonb),
    'ocupacao', COALESCE((
      SELECT jsonb_agg(x ORDER BY x.inicio, x.codigo)
        FROM (
          SELECT o.id AS obra_id, o.codigo, o.titulo,
                 min(t.inicio_planeado) AS inicio,
                 max(COALESCE(t.fim_planeado, t.inicio_planeado)) AS fim,
                 jsonb_agg(DISTINCT COALESCE(u.name, 'Sem nome')) AS pessoas,
                 count(DISTINCT tp.utilizador_id)::integer AS n
            FROM public.ops_obra o
            JOIN public.ops_obra_tarefa t ON t.obra_id = o.id
            JOIN public.ops_obra_tarefa_pessoa tp ON tp.tarefa_id = t.id
            JOIN public.ops_utilizador_perfil p
              ON p.utilizador_id = tp.utilizador_id AND p.organization_id = o.organization_id
             AND p.ativo AND p.funcao = ANY (v_funcs)
            LEFT JOIN public.anew_users u ON u.id = tp.utilizador_id
           WHERE o.organization_id = v_o.organization_id
             AND o.id <> p_obra_id
             AND o.estado IN ('planeada','em_curso')
             AND t.estado IN ('por_fazer','em_curso','rejeitada')
             AND t.inicio_planeado IS NOT NULL
             AND v_inicio IS NOT NULL AND v_inicio > v_desde
             AND t.inicio_planeado < v_inicio
             AND COALESCE(t.fim_planeado, t.inicio_planeado) >= v_desde
           GROUP BY o.id, o.codigo, o.titulo
        ) x), '[]'::jsonb)
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_porque_inicio(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_porque_inicio(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_porque_inicio(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_previsao_orcamento(uuid, uuid, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_previsao_orcamento(p_org uuid, p_orcamento_id uuid DEFAULT NULL::uuid, p_contrato_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quem record;
  v_orc  uuid := p_orcamento_id;
  v_org  uuid;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.create', ARRAY['gestor'],
    'Só quem planeia abre obras.');

  IF p_contrato_id IS NOT NULL THEN
    SELECT c.quote_id, c.organization_id INTO v_orc, v_org
      FROM public.client_contracts c
     WHERE c.id = p_contrato_id AND c.deleted_at IS NULL;
    IF v_org IS DISTINCT FROM p_org THEN
      RAISE EXCEPTION 'Contrato não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF v_orc IS NULL THEN
    RETURN jsonb_build_object('tarefas', '[]'::jsonb, 'minutos', 0, 'sem_ficha', 0, 'orcamento_id', NULL);
  END IF;

  SELECT q.organization_id INTO v_org FROM public.quotes q WHERE q.id = v_orc AND q.deleted_at IS NULL;
  IF v_org IS DISTINCT FROM p_org THEN
    RAISE EXCEPTION 'Orçamento não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'orcamento_id', v_orc,
      'tarefas', COALESCE(jsonb_agg(jsonb_build_object(
                   'fase', t.fase, 'nome', t.nome, 'minutos', t.minutos, 'pessoas', t.pessoas,
                   'sem_ficha', t.sem_ficha, 'materiais', t.materiais)
                   ORDER BY t.fase, t.ordem), '[]'::jsonb),
      'minutos', COALESCE(sum(t.minutos), 0),
      'sem_ficha', count(*) FILTER (WHERE t.sem_ficha))
      FROM public.ops_obra_tarefas_do_orcamento(v_orc) t);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_previsao_orcamento(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_previsao_orcamento(uuid, uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_previsao_orcamento(uuid, uuid, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_registar_atraso(uuid, text, text, integer, date, boolean, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_registar_atraso(p_tarefa_id uuid, p_motivo text, p_contexto text, p_minutos_extra integer DEFAULT NULL::integer, p_novo_fim date DEFAULT NULL::date, p_empurrar boolean DEFAULT true, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t         record;
  v_quem      record;
  v_motivo    text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_ctx       text := nullif(btrim(coalesce(p_contexto, '')), '');
  v_simular   boolean := COALESCE(p_simular, false);
  v_hoje      date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_fim_ant   date;
  v_novo      date;
  v_dias      integer;
  v_obra_ant  date;
  v_obra_novo date;
  v_estim     integer;
  v_id        uuid;
  v_mexidas   jsonb := '{}'::jsonb;   -- tarefa → {nome, datas antes e depois}
  v_res       jsonb;
BEGIN
  SELECT t.*, o.estado AS obra_estado, o.supervisor_id AS obra_supervisor, o.minutos_por_dia AS mpd
    INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_quem FROM public.ops_quem_sou(v_t.organization_id) q;
  IF NOT (
       (v_quem.funcao IN ('admin','gestor') AND public.ops_pode(v_t.organization_id, 'operations.orders.edit'))
    OR (v_t.obra_supervisor = v_quem.utilizador_id
        AND public.ops_pode(v_t.organization_id, 'operations.orders.confirm'))
    OR (EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa
                 WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.utilizador_id)
        AND public.ops_pode(v_t.organization_id, 'operations.orders.execute'))
  ) THEN
    RAISE EXCEPTION 'Só quem está na tarefa, o supervisor da obra ou o gestor registam um atraso.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_t.obra_estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %; já não se registam atrasos.', v_t.obra_estado;
  END IF;
  IF v_t.estado NOT IN ('por_fazer','em_curso','rejeitada') THEN
    RAISE EXCEPTION 'Esta tarefa já está %. Um atraso regista-se antes de acabar.', replace(v_t.estado, '_', ' ');
  END IF;

  -- Na pré-visualização ainda se está a escrever: só as contas importam.
  IF NOT v_simular THEN
    IF v_motivo IS NULL OR v_motivo NOT IN ('secagem','condicoes_edificio','material_em_falta',
         'trabalho_imprevisto','acesso_cliente','meteorologia','equipa','outro') THEN
      RAISE EXCEPTION 'Escolhe o motivo do atraso.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_ctx IS NULL OR length(v_ctx) < 5 THEN
      RAISE EXCEPTION 'Escreve o contexto do atraso (pelo menos 5 letras): é o que o supervisor e o cliente vão ler.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF p_minutos_extra IS NOT NULL AND p_minutos_extra <= 0 THEN
    RAISE EXCEPTION 'O tempo a mais tem de ser maior que zero.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_minutos_extra IS NULL AND p_novo_fim IS NULL THEN
    RAISE EXCEPTION 'Diz quanto tempo a mais (horas ou dias) ou a nova data de fim.' USING ERRCODE = 'check_violation';
  END IF;

  v_fim_ant := COALESCE(v_t.fim_planeado, v_t.inicio_planeado);
  IF p_novo_fim IS NOT NULL THEN
    IF v_fim_ant IS NOT NULL AND p_novo_fim < v_fim_ant THEN
      RAISE EXCEPTION 'A nova data de fim (%) é antes do fim previsto (%). Um atraso só empurra para a frente.',
        to_char(p_novo_fim, 'DD/MM/YYYY'), to_char(v_fim_ant, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
    IF p_novo_fim < v_hoje THEN
      RAISE EXCEPTION 'A nova data de fim já passou.' USING ERRCODE = 'check_violation';
    END IF;
    v_novo := p_novo_fim;
  ELSE
    v_dias := ceil(p_minutos_extra::numeric / GREATEST(v_t.pessoas_previstas, 1) / GREATEST(v_t.mpd, 1))::integer;
    IF v_fim_ant IS NULL OR v_fim_ant < v_hoje THEN
      v_novo := public.ops_obra_somar_dias_uteis_org(v_t.organization_id, v_hoje, GREATEST(v_dias - 1, 0));
    ELSE
      v_novo := public.ops_obra_somar_dias_uteis_org(v_t.organization_id, v_fim_ant, v_dias);
    END IF;
  END IF;

  SELECT max(COALESCE(fim_planeado, inicio_planeado)) INTO v_obra_ant
    FROM public.ops_obra_tarefa WHERE obra_id = v_t.obra_id;

  BEGIN
    -- A tarefa: plano original (uma vez), novo fim, nova estimativa.
    UPDATE public.ops_obra_tarefa
       SET inicio_original = CASE WHEN inicio_original IS NULL AND fim_original IS NULL
                                  THEN inicio_planeado ELSE inicio_original END,
           fim_original    = CASE WHEN inicio_original IS NULL AND fim_original IS NULL
                                  THEN fim_planeado ELSE fim_original END,
           fim_planeado    = v_novo,
           minutos_estimativa = CASE WHEN p_minutos_extra IS NULL THEN minutos_estimativa
                                     ELSE COALESCE(minutos_estimativa, minutos_previstos) + p_minutos_extra END,
           atualizada_em   = now()
     WHERE id = p_tarefa_id
     RETURNING minutos_estimativa INTO v_estim;

    -- As dependentes, em cadeia (sem ciclos: o trigger das dependências não deixa).
    IF COALESCE(p_empurrar, true) THEN
      v_mexidas := public.ops_obra_empurrar_dependentes_impl(p_tarefa_id, v_fim_ant);
    END IF;

    SELECT max(COALESCE(fim_planeado, inicio_planeado)) INTO v_obra_novo
      FROM public.ops_obra_tarefa WHERE obra_id = v_t.obra_id;

    IF NOT v_simular THEN
      INSERT INTO public.ops_obra_tarefa_atraso
        (organization_id, obra_id, tarefa_id, motivo, contexto, minutos_extra, novo_fim, fim_anterior, registado_por)
      VALUES
        (v_t.organization_id, v_t.obra_id, p_tarefa_id, v_motivo, v_ctx, p_minutos_extra, v_novo,
         v_t.fim_planeado, v_quem.utilizador_id)
      RETURNING id INTO v_id;

      PERFORM public.ops_obra_evento(v_t.organization_id, v_t.obra_id, 'atraso',
        v_t.nome || ': ' || v_ctx, v_quem.utilizador_id,
        jsonb_build_object('tarefa_id', p_tarefa_id, 'atraso_id', v_id, 'motivo', v_motivo,
                           'minutos_extra', p_minutos_extra, 'fim_anterior', v_t.fim_planeado,
                           'novo_fim', v_novo, 'empurradas', (SELECT count(*) FROM jsonb_object_keys(v_mexidas)),
                           'fim_obra_anterior', v_obra_ant, 'fim_obra_novo', v_obra_novo));
    END IF;

    v_res := jsonb_build_object(
      'ok', true,
      'simulado', v_simular,
      'atraso_id', v_id,
      'fim_anterior', v_t.fim_planeado,
      'novo_fim', v_novo,
      'minutos_estimativa', v_estim,
      'empurradas', COALESCE((SELECT jsonb_agg(e.value ORDER BY e.value->>'novo_inicio', e.value->>'nome')
                                FROM jsonb_each(v_mexidas) e), '[]'::jsonb),
      'fim_obra_anterior', v_obra_ant,
      'fim_obra_novo', v_obra_novo);

    IF v_simular THEN
      -- Desfaz tudo o que este bloco mudou; as contas ficam em v_res.
      RAISE EXCEPTION 'simulação' USING ERRCODE = 'OB001';
    END IF;
  EXCEPTION WHEN SQLSTATE 'OB001' THEN
    NULL;
  END;

  RETURN v_res;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_registar_atraso(uuid, text, text, integer, date, boolean, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_registar_atraso(uuid, text, text, integer, date, boolean, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_registar_atraso(uuid, text, text, integer, date, boolean, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_registar_extra(uuid, text, numeric, uuid, text[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_registar_extra(p_obra_id uuid, p_descricao text, p_valor numeric DEFAULT NULL::numeric, p_tarefa_id uuid DEFAULT NULL::uuid, p_fotos text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o    record;
  v_quem record;
  v_id   uuid;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.execute', NULL, NULL);
  IF NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF nullif(btrim(coalesce(p_descricao,'')), '') IS NULL THEN
    RAISE EXCEPTION 'Descreve o que se encontrou.';
  END IF;
  IF p_valor IS NOT NULL AND p_valor < 0 THEN
    RAISE EXCEPTION 'O valor estimado não pode ser negativo.';
  END IF;
  IF p_tarefa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_obra_tarefa WHERE id = p_tarefa_id AND obra_id = p_obra_id) THEN
    RAISE EXCEPTION 'Essa tarefa não é desta obra.';
  END IF;

  INSERT INTO public.ops_obra_extra
    (organization_id, obra_id, tarefa_id, descricao, valor_estimado, fotos, registado_por)
  VALUES (v_o.organization_id, p_obra_id, p_tarefa_id, btrim(p_descricao), p_valor,
          COALESCE(p_fotos, '{}'), v_quem.o_utilizador)
  RETURNING id INTO v_id;

  PERFORM public.ops_obra_evento(v_o.organization_id, p_obra_id, 'extra_registado',
    btrim(p_descricao), v_quem.o_utilizador, jsonb_build_object('extra_id', v_id, 'valor', p_valor));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_registar_extra(uuid, text, numeric, uuid, text[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_registar_extra(uuid, text, numeric, uuid, text[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_registar_extra(uuid, text, numeric, uuid, text[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_registar_foto(uuid, text, text, text, integer, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_registar_foto(p_tarefa_id uuid, p_caminho text, p_nome text, p_mime text DEFAULT NULL::text, p_tamanho integer DEFAULT NULL::integer, p_legenda text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t       record;
  v_user    uuid;
  v_funcao  text;
  v_prefixo text;
  v_id      uuid;
BEGIN
  SELECT t.id, t.obra_id, t.estado, o.organization_id, o.estado AS obra_estado, o.supervisor_id
    INTO v_t
    FROM public.ops_obra_tarefa t
    JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_t.organization_id) q;

  IF NOT (
    public.ops_pode(v_t.organization_id, 'operations.orders.execute')
    OR public.ops_pode(v_t.organization_id, 'operations.orders.edit')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para tirar fotos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    v_funcao IN ('admin','gestor')
    OR v_t.supervisor_id = v_user
    OR EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                WHERE tp.tarefa_id = p_tarefa_id AND tp.utilizador_id = v_user)
  ) THEN
    RAISE EXCEPTION 'Só quem está na tarefa lhe junta fotos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_t.estado = 'validada' THEN
    RAISE EXCEPTION 'A tarefa já está validada — não se juntam fotos.';
  END IF;
  IF v_t.obra_estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está % — não se juntam fotos.', replace(v_t.obra_estado, 'concluida', 'concluída');
  END IF;

  v_prefixo := v_t.organization_id::text || '/' || v_t.obra_id::text || '/' || v_t.id::text || '/';
  IF p_caminho IS NULL OR left(p_caminho, length(v_prefixo)) <> v_prefixo
     OR position('..' IN p_caminho) > 0 THEN
    RAISE EXCEPTION 'O caminho do ficheiro não pertence a esta tarefa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ops_obra_tarefa_foto
    (organization_id, obra_id, tarefa_id, caminho, nome, mime, tamanho, legenda, carregado_por)
  VALUES
    (v_t.organization_id, v_t.obra_id, v_t.id, p_caminho,
     COALESCE(nullif(btrim(p_nome), ''), 'foto'),
     p_mime, p_tamanho, nullif(btrim(coalesce(p_legenda, '')), ''), v_user)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'caminho', p_caminho);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_registar_foto(uuid, text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_registar_foto(uuid, text, text, text, integer, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_registar_foto(uuid, text, text, text, integer, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_remover_foto(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_remover_foto(p_foto_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f      record;
  v_user   uuid;
  v_funcao text;
BEGIN
  SELECT f.*, t.estado AS tarefa_estado
    INTO v_f
    FROM public.ops_obra_tarefa_foto f
    JOIN public.ops_obra_tarefa t ON t.id = f.tarefa_id
   WHERE f.id = p_foto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Foto não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_f.organization_id) q;

  IF v_funcao NOT IN ('admin','gestor') THEN
    IF v_f.carregado_por IS DISTINCT FROM v_user THEN
      RAISE EXCEPTION 'Só quem tirou a foto a apaga.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_f.tarefa_estado = 'validada' THEN
      RAISE EXCEPTION 'A tarefa já está validada — a foto fica.';
    END IF;
  END IF;

  DELETE FROM public.ops_obra_tarefa_foto WHERE id = p_foto_id;
  RETURN jsonb_build_object('ok', true, 'caminho', v_f.caminho);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_remover_foto(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_remover_foto(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_remover_foto(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_replanear(uuid, date)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_replanear(p_obra_id uuid, p_data_inicio date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_o    record;
  v_quem record;
  v_n    integer;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia mexe nas datas.');
  IF p_data_inicio IS NULL THEN
    RAISE EXCEPTION 'Falta a data de início.';
  END IF;
  v_n := public.ops_obra_replanear_impl(p_obra_id, public.ops_obra_somar_dias_uteis(p_data_inicio, 0));
  RETURN jsonb_build_object('ok', true, 'tarefas', v_n);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_replanear(uuid, date) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_replanear(uuid, date) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_replanear(uuid, date) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_semear_modelo_exemplo(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_semear_modelo_exemplo(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quem record;
  v_id   uuid;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.checklists.manage', ARRAY['gestor'],
    'Só quem planeia gere os modelos de obra.');
  v_id := public.ops_obra_semear_exemplo_impl(p_org);
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_semear_modelo_exemplo(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_semear_modelo_exemplo(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_semear_modelo_exemplo(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_semear_tempos_padrao(uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_semear_tempos_padrao(p_org uuid, p_substituir boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.ops_obra_pode_gerir_modelos(p_org) THEN
    RAISE EXCEPTION 'Sem permissão para gerir modelos nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.ops_obra_semear_tempos_padrao_impl(p_org, public.current_business_user_id(), COALESCE(p_substituir, false));
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_semear_tempos_padrao(uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_semear_tempos_padrao(uuid, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_semear_tempos_padrao(uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_sincronizar_avisos(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_sincronizar_avisos(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.ops_quem_sou(p_org);
  IF NOT public.ops_pode(p_org, 'operations.orders.view') THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN public.ops_obra_sincronizar_avisos(p_org, NULL) || jsonb_build_object('ok', true);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_sincronizar_avisos(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_sincronizar_avisos(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_sincronizar_avisos(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_stock(uuid, uuid[], text, integer)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_stock(p_org uuid, p_produto_ids uuid[] DEFAULT NULL::uuid[], p_pesquisa text DEFAULT NULL::text, p_limite integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quem  record;
  v_ids   uuid[];
  v_inv   boolean;
  v_res   boolean;
  v_txt   text := nullif(btrim(COALESCE(p_pesquisa, '')), '');
  v_out   jsonb;
BEGIN
  SELECT q.utilizador_id, q.funcao INTO v_quem FROM public.ops_quem_sou(p_org) q;
  IF v_quem.funcao IS DISTINCT FROM 'admin' AND v_quem.funcao IS DISTINCT FROM 'gestor' THEN
    RAISE EXCEPTION 'Só quem planeia vê o stock para a obra.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.ops_pode(p_org, 'operations.orders.edit') OR public.ops_pode(p_org, 'operations.orders.create')) THEN
    RAISE EXCEPTION 'Sem permissão (operations.orders.edit) nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF to_regclass('public.products') IS NULL THEN
    RETURN jsonb_build_object('com_inventario', false, 'produtos', '[]'::jsonb);
  END IF;
  IF COALESCE(array_length(p_produto_ids, 1), 0) > 500 THEN
    RAISE EXCEPTION 'Demasiados produtos de uma vez.';
  END IF;

  -- Que produtos (desta organização, ou das fichas/orçamentos dela).
  IF v_txt IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(array_agg(p.id), '{}') FROM (
        SELECT p.id FROM public.products p
         WHERE (to_jsonb(p)->>'organization_id') = $1::text
           AND COALESCE((to_jsonb(p)->>'is_deleted')::boolean, false) = false
           AND (to_jsonb(p)->>'deleted_at') IS NULL
           AND (p.name ILIKE '%' || $2 || '%' OR COALESCE(to_jsonb(p)->>'sku', '') ILIKE '%' || $2 || '%')
         ORDER BY (lower(p.name) LIKE lower($2) || '%') DESC, p.name
         LIMIT $3) p
    $q$ INTO v_ids USING p_org, v_txt, LEAST(GREATEST(COALESCE(p_limite, 30), 1), 100);
  ELSE
    EXECUTE format($q$
      SELECT COALESCE(array_agg(p.id), '{}') FROM public.products p
       WHERE p.id = ANY ($2)
         AND ((to_jsonb(p)->>'organization_id') = $1::text
              %s
              OR EXISTS (SELECT 1 FROM public.quote_lines l JOIN public.quotes q ON q.id = l.quote_id
                          WHERE q.organization_id = $1 AND (to_jsonb(l)->>'product_id') = p.id::text))
    $q$,
      CASE WHEN to_regclass('public.service_materials') IS NOT NULL THEN
        'OR EXISTS (SELECT 1 FROM public.service_materials sm
                     WHERE sm.product_id = p.id AND sm.deleted_at IS NULL
                       AND ((to_jsonb(sm)->>''organization_id'') = $1::text
                            OR public.ops_obra_servico_da_org($1, sm.service_id)))'
      ELSE '' END)
    INTO v_ids USING p_org, COALESCE(p_produto_ids, '{}'::uuid[]);
  END IF;

  v_inv := to_regclass('public.stocks') IS NOT NULL AND to_regclass('public.warehouses') IS NOT NULL;
  v_res := to_regprocedure('public.fn_client_order_line_reservations(uuid,uuid[])') IS NOT NULL;

  EXECUTE format($q$
    WITH st AS (
      %2$s
    ), rs AS (
      %3$s
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'produto_id', p.id,
             'nome', p.name,
             'sku', to_jsonb(p)->>'sku',
             'unidade', %1$s,
             'gere_stock', (to_jsonb(p)->>'manages_stock')::boolean,
             'stock', st.qtd,
             'reservado', COALESCE(rs.qtd, 0),
             'disponivel', CASE WHEN $3 THEN COALESCE(st.qtd, 0) - COALESCE(rs.qtd, 0) END)
             ORDER BY (COALESCE(st.qtd, 0) - COALESCE(rs.qtd, 0)) > 0 DESC, p.name), '[]'::jsonb)
      FROM public.products p
      LEFT JOIN st ON st.product_id = p.id
      LEFT JOIN rs ON rs.product_id = p.id
     WHERE p.id = ANY ($2)
  $q$,
    CASE WHEN to_regclass('public.uom') IS NOT NULL
         THEN '(SELECT u.code FROM public.uom u WHERE u.id::text = to_jsonb(p)->>''uom_id'')'
         ELSE 'NULL::text' END,
    CASE WHEN v_inv THEN
      'SELECT s.product_id, sum(s.quantity)::numeric AS qtd
         FROM public.stocks s JOIN public.warehouses w ON w.id = s.warehouse_id
        WHERE s.organization_id = $1 AND s.product_id = ANY ($2)
          AND (to_jsonb(s)->>''deleted_at'') IS NULL
          AND COALESCE((to_jsonb(w)->>''is_active'')::boolean, true)
          AND (to_jsonb(w)->>''deleted_at'') IS NULL
        GROUP BY s.product_id'
    ELSE 'SELECT NULL::uuid AS product_id, NULL::numeric AS qtd WHERE false' END,
    CASE WHEN v_res THEN
      'SELECT r.product_id, sum(COALESCE(r.qty_reserved, 0))::numeric AS qtd
         FROM public.fn_client_order_line_reservations($1, $2) r
        WHERE r.product_id IS NOT NULL GROUP BY r.product_id'
    ELSE 'SELECT NULL::uuid AS product_id, NULL::numeric AS qtd WHERE false' END)
  INTO v_out USING p_org, v_ids, v_inv;

  RETURN jsonb_build_object('com_inventario', v_inv, 'com_reservas', v_res, 'produtos', v_out);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_stock(uuid, uuid[], text, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_stock(uuid, uuid[], text, integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_stock(uuid, uuid[], text, integer) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_terminar_tarefa(uuid, boolean, text, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_terminar_tarefa(p_tarefa_id uuid, p_concluir boolean DEFAULT true, p_motivo text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t        record;
  v_quem     record;
  v_real     numeric;
  v_limite   numeric;
  v_excedido boolean;
  v_motivo   text := nullif(btrim(coalesce(p_motivo,'')), '');
  v_nota     text := nullif(btrim(coalesce(p_nota,'')), '');
  v_dono     boolean;
BEGIN
  SELECT t.*, o.estado AS obra_estado, o.tolerancia_percent INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.execute', NULL, NULL);

  v_dono := EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa
                     WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador);
  IF v_quem.o_funcao NOT IN ('admin','gestor') AND NOT v_dono THEN
    RAISE EXCEPTION 'Não estás nesta tarefa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_t.estado <> 'em_curso' THEN
    RAISE EXCEPTION 'Só se termina uma tarefa em curso (esta está %).', replace(v_t.estado,'_',' ');
  END IF;

  IF NOT COALESCE(p_concluir, true) THEN
    UPDATE public.ops_obra_registo SET fim = now()
     WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador AND fim IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não tens relógio a correr nesta tarefa.';
    END IF;
    RETURN jsonb_build_object('ok', true, 'estado', 'em_curso',
      'minutos_reais', public.ops_obra_minutos_reais(p_tarefa_id),
      'minutos_previstos', v_t.minutos_previstos);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ops_obra_registo WHERE tarefa_id = p_tarefa_id) THEN
    RAISE EXCEPTION 'Sem tempo registado. Carrega em Iniciar antes de dar a tarefa por feita.';
  END IF;

  -- O real conta-se ANTES de fechar, até agora — é o mesmo número.
  v_real := public.ops_obra_minutos_reais(p_tarefa_id);
  v_limite := v_t.minutos_previstos * (1 + v_t.tolerancia_percent / 100.0);
  v_excedido := v_real > v_limite;

  IF v_excedido THEN
    IF v_motivo IS NULL THEN
      RAISE EXCEPTION 'Justificação obrigatória: % min reais para % previstos (tolerância de % %%). Escolhe o motivo do desvio.',
        round(v_real), v_t.minutos_previstos, v_t.tolerancia_percent
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF v_motivo IS NOT NULL AND v_motivo NOT IN
     ('secagem','condicoes_edificio','material_em_falta','trabalho_imprevisto','acesso_cliente','outro') THEN
    RAISE EXCEPTION 'Motivo de desvio desconhecido: %.', v_motivo;
  END IF;
  IF v_motivo = 'outro' AND v_nota IS NULL THEN
    RAISE EXCEPTION 'Com o motivo "outro", escreve uma nota a explicar.';
  END IF;

  UPDATE public.ops_obra_registo SET fim = now()
   WHERE tarefa_id = p_tarefa_id AND fim IS NULL;

  UPDATE public.ops_obra_tarefa
     SET estado = 'feita',
         terminada_em = now(),
         motivo_desvio = v_motivo,
         nota_desvio = v_nota,
         atualizada_em = now()
   WHERE id = p_tarefa_id;

  RETURN jsonb_build_object('ok', true, 'estado', 'feita',
    'minutos_reais', v_real, 'minutos_previstos', v_t.minutos_previstos,
    'excedido', v_excedido);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_terminar_tarefa(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_terminar_tarefa(uuid, boolean, text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_terminar_tarefa(uuid, boolean, text, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obra_validar_tarefa(uuid, boolean, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obra_validar_tarefa(p_tarefa_id uuid, p_aprovar boolean, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t      record;
  v_quem   record;
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')), '');
BEGIN
  SELECT * INTO v_t FROM public.ops_obra_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.confirm', ARRAY['gestor','supervisor'],
    'Só o supervisor ou o gestor validam tarefas.');

  IF v_t.estado <> 'feita' THEN
    RAISE EXCEPTION 'Só se valida uma tarefa feita (esta está %).', replace(v_t.estado,'_',' ');
  END IF;
  IF EXISTS (SELECT 1 FROM public.ops_obra_registo
              WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador) THEN
    RAISE EXCEPTION 'Quem fez a tarefa não a valida. É preciso outro par de olhos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(p_aprovar, false) THEN
    UPDATE public.ops_obra_tarefa
       SET estado = 'validada', validada_por = v_quem.o_utilizador, validada_em = now(),
           motivo_rejeicao = NULL, atualizada_em = now()
     WHERE id = p_tarefa_id;
  ELSE
    IF v_motivo IS NULL THEN
      RAISE EXCEPTION 'Rejeitar exige motivo — é o que a equipa vai ler para corrigir.';
    END IF;
    UPDATE public.ops_obra_tarefa
       SET estado = 'rejeitada', motivo_rejeicao = v_motivo, rejeitada_em = now(),
           validada_por = v_quem.o_utilizador, validada_em = NULL, atualizada_em = now()
     WHERE id = p_tarefa_id;
  END IF;

  PERFORM public.ops_obra_evento(v_t.organization_id, v_t.obra_id,
    CASE WHEN p_aprovar THEN 'tarefa_validada' ELSE 'tarefa_rejeitada' END,
    v_t.nome, v_quem.o_utilizador,
    jsonb_build_object('tarefa_id', p_tarefa_id, 'motivo', v_motivo));

  RETURN jsonb_build_object('ok', true,
    'estado', CASE WHEN p_aprovar THEN 'validada' ELSE 'rejeitada' END);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obra_validar_tarefa(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_validar_tarefa(uuid, boolean, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_validar_tarefa(uuid, boolean, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obras_alertas_tempo(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obras_alertas_tempo(p_org uuid)
 RETURNS TABLE(tarefa_id uuid, obra_id uuid, obra_codigo text, nome text, estado text, minutos_previstos integer, minutos_reais numeric, a_correr integer, nivel text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH vis AS (SELECT public.ops_obras_visiveis(p_org) AS id),
  t AS (
    SELECT t.id, t.obra_id, o.codigo, t.nome, t.estado, t.minutos_previstos,
           COALESCE(r.minutos, 0)::numeric(12,1) AS minutos_reais,
           COALESCE(r.a_correr, 0)::integer AS a_correr
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra_fase f ON f.id = t.fase_id
      JOIN public.ops_obra o ON o.id = t.obra_id
      LEFT JOIN LATERAL (
        SELECT round(sum(EXTRACT(EPOCH FROM (COALESCE(x.fim, now()) - x.inicio))) / 60.0, 1) AS minutos,
               count(*) FILTER (WHERE x.fim IS NULL) AS a_correr
          FROM public.ops_obra_registo x WHERE x.tarefa_id = t.id
      ) r ON true
     WHERE t.obra_id IN (SELECT vis.id FROM vis)
       AND t.estado IN ('por_fazer','em_curso','rejeitada')
  )
  SELECT t.id, t.obra_id, t.codigo, t.nome, t.estado, t.minutos_previstos, t.minutos_reais, t.a_correr,
         CASE WHEN t.minutos_reais > t.minutos_previstos THEN 'excedido' ELSE 'aviso' END
    FROM t
   WHERE t.minutos_reais >= 0.8 * t.minutos_previstos
   LIMIT 200;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obras_alertas_tempo(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obras_alertas_tempo(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obras_alertas_tempo(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_obras_lista(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_obras_lista(p_org uuid)
 RETURNS TABLE(id uuid, organization_id uuid, codigo text, titulo text, estado text, cliente_id uuid, orcamento_id uuid, contrato_id uuid, modelo_id uuid, morada text, data_inicio_prevista date, gestor_id uuid, supervisor_id uuid, tolerancia_percent integer, criada_em timestamp with time zone, n_tarefas integer, n_feitas integer, n_validadas integer, n_por_validar integer, minutos_previstos integer, minutos_reais numeric, inicio_planeado date, fim_planeado date, n_extras integer, fim_original date, n_alertas integer, cliente_nome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH vis AS (SELECT public.ops_obras_visiveis(p_org) AS id),
  reg AS (
    SELECT x.tarefa_id,
           round(sum(EXTRACT(EPOCH FROM (COALESCE(x.fim, now()) - x.inicio))) / 60.0, 1) AS minutos
      FROM public.ops_obra_registo x
     WHERE x.obra_id IN (SELECT vis.id FROM vis)
     GROUP BY x.tarefa_id
  ),
  tar AS (
    SELECT t.obra_id,
           count(*) AS n_tarefas,
           max(COALESCE(t.fim_original, t.fim_planeado)) AS fim_original,
           count(*) FILTER (WHERE t.estado IN ('feita','validada')) AS n_feitas,
           count(*) FILTER (WHERE t.estado = 'validada') AS n_validadas,
           count(*) FILTER (WHERE t.estado = 'feita') AS n_por_validar,
           sum(t.minutos_previstos) AS minutos_previstos,
           sum(COALESCE(reg.minutos, 0)) AS minutos_reais,
           min(t.inicio_planeado) AS inicio_planeado,
           max(t.fim_planeado) AS fim_planeado
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra_fase f ON f.id = t.fase_id
      LEFT JOIN reg ON reg.tarefa_id = t.id
     WHERE t.obra_id IN (SELECT vis.id FROM vis)
     GROUP BY t.obra_id
  ),
  ext AS (
    SELECT e.obra_id, count(*) AS n
      FROM public.ops_obra_extra e
     WHERE e.obra_id IN (SELECT vis.id FROM vis) AND e.estado IN ('registado','aprovado')
     GROUP BY e.obra_id
  ),
  al AS (
    SELECT a.obra_id, count(*) AS n
      FROM public.ops_obra_alertas_lista(p_org, NULL) a
     GROUP BY a.obra_id
  )
  SELECT o.id, o.organization_id, o.codigo, o.titulo, o.estado, o.cliente_id,
         o.orcamento_id, o.contrato_id, o.modelo_id, o.morada,
         o.data_inicio_prevista, o.gestor_id, o.supervisor_id, o.tolerancia_percent,
         o.criada_em,
         COALESCE(tar.n_tarefas, 0)::integer, COALESCE(tar.n_feitas, 0)::integer,
         COALESCE(tar.n_validadas, 0)::integer, COALESCE(tar.n_por_validar, 0)::integer,
         COALESCE(tar.minutos_previstos, 0)::integer, COALESCE(tar.minutos_reais, 0)::numeric(12,1),
         tar.inicio_planeado, tar.fim_planeado,
         COALESCE(ext.n, 0)::integer, tar.fim_original, COALESCE(al.n, 0)::integer,
         c.nome
    FROM public.ops_obra o
    JOIN vis ON vis.id = o.id
    LEFT JOIN tar ON tar.obra_id = o.id
    LEFT JOIN ext ON ext.obra_id = o.id
    LEFT JOIN al  ON al.obra_id = o.id
    LEFT JOIN public.ops_v_cliente c ON c.id = o.cliente_id
   ORDER BY o.criada_em DESC
   LIMIT 200;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_obras_lista(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obras_lista(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_obras_lista(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_packs()') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_packs()
 RETURNS TABLE(pack text, nome text, descricao text, categorias integer, medicoes integer, checklists integer)
 LANGUAGE sql
 STABLE
AS $function$
SELECT p,
       c->>'nome',
       c->>'descricao',
       jsonb_array_length(c->'categorias'),
       jsonb_array_length(c->'medicoes'),
       jsonb_array_length(c->'checklists')
  FROM unnest(ARRAY['manutencao', 'obras', 'limpeza']) AS p,
       LATERAL public.ops_pack_conteudo(p) AS c
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_packs() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_packs() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_packs() TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_pessoa_planeamento(uuid, uuid, text, uuid[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_pessoa_planeamento(p_org uuid, p_utilizador uuid, p_zona text, p_skills uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quem record;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.settings.manage', ARRAY['gestor'],
    'Só o gestor muda a zona e as especialidades da equipa.');
  IF NOT EXISTS (SELECT 1 FROM public.ops_utilizador_perfil
                  WHERE organization_id = p_org AND utilizador_id = p_utilizador) THEN
    RAISE EXCEPTION 'Essa pessoa não está em Operações nesta organização.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_skills, '{}')) s
              WHERE NOT EXISTS (SELECT 1 FROM public.ops_skill k WHERE k.id = s AND k.organization_id = p_org)) THEN
    RAISE EXCEPTION 'Há uma especialidade que não é desta organização.';
  END IF;

  UPDATE public.ops_utilizador_perfil
     SET zona_base = nullif(btrim(coalesce(p_zona, '')), ''), atualizado_em = now()
   WHERE organization_id = p_org AND utilizador_id = p_utilizador;

  DELETE FROM public.ops_utilizador_skill us
   USING public.ops_skill k
   WHERE k.id = us.skill_id AND k.organization_id = p_org AND us.utilizador_id = p_utilizador
     AND NOT (us.skill_id = ANY (COALESCE(p_skills, '{}')));
  INSERT INTO public.ops_utilizador_skill (utilizador_id, skill_id)
  SELECT p_utilizador, s FROM unnest(COALESCE(p_skills, '{}')) s
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_pessoa_planeamento(uuid, uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_pessoa_planeamento(uuid, uuid, text, uuid[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_pessoa_planeamento(uuid, uuid, text, uuid[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_pessoas_livres(uuid, date, date, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_pessoas_livres(p_org uuid, p_inicio date, p_fim date DEFAULT NULL::date, p_excluir_tarefa uuid DEFAULT NULL::uuid)
 RETURNS TABLE(utilizador_id uuid, nome text, funcao text, skills uuid[], zona text, minutos_ocupados integer, dias_cheios integer, ordens integer, livre boolean, motivo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_quem record;
BEGIN
  SELECT q.utilizador_id, q.funcao INTO v_quem FROM public.ops_quem_sou(p_org) q;
  IF v_quem.funcao IS DISTINCT FROM 'admin' AND v_quem.funcao IS DISTINCT FROM 'gestor' THEN
    RAISE EXCEPTION 'Só quem planeia vê a agenda da equipa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.ops_pode(p_org, 'operations.orders.edit') OR public.ops_pode(p_org, 'operations.orders.create')) THEN
    RAISE EXCEPTION 'Sem permissão (operations.orders.edit) nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_inicio IS NULL THEN
    RAISE EXCEPTION 'Indica a data de início.';
  END IF;
  IF p_fim IS NOT NULL AND p_fim < p_inicio THEN
    RAISE EXCEPTION 'O fim não pode ser antes do início.';
  END IF;
  IF COALESCE(p_fim, p_inicio) - p_inicio > 366 THEN
    RAISE EXCEPTION 'No máximo um ano de cada vez.';
  END IF;
  IF p_excluir_tarefa IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_obra_tarefa WHERE id = p_excluir_tarefa AND organization_id = p_org) THEN
    RAISE EXCEPTION 'Tarefa não encontrada nesta organização.' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
    SELECT * FROM public.ops_obra_pessoas_livres_impl(p_org, p_inicio, COALESCE(p_fim, p_inicio), p_excluir_tarefa);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_pessoas_livres(uuid, date, date, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_pessoas_livres(uuid, date, date, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_pessoas_livres(uuid, date, date, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_proximo_codigo(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_proximo_codigo(p_organization_id uuid, p_prefixo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid; v_funcao text;
BEGIN
  IF p_prefixo NOT IN ('LOC','AT','CL','MED','CAT') THEN
    RAISE EXCEPTION 'Prefixo desconhecido: %.', p_prefixo;
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(p_organization_id) q;

  RETURN public.ops_proximo_codigo_interno(p_organization_id, p_prefixo);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_proximo_codigo(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_proximo_codigo(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_proximo_codigo(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_registar_anexo(uuid, text, text, uuid, text, integer, text, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_registar_anexo(p_ordem_id uuid, p_caminho text, p_nome text, p_tarefa_id uuid DEFAULT NULL::uuid, p_mime text DEFAULT NULL::text, p_tamanho integer DEFAULT NULL::integer, p_legenda text DEFAULT NULL::text, p_privado boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid;
  v_funcao  text;
  v_o       record;
  v_id      uuid;
  v_prefixo text;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF NOT (
    public.ops_pode(v_o.organization_id, 'operations.orders.execute')
    OR public.ops_pode(v_o.organization_id, 'operations.orders.edit')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para anexar ficheiros.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_funcao = 'tecnico' AND NOT (
       COALESCE(v_o.responsavel_id = v_user, false)
       OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                   WHERE ordem_id = p_ordem_id AND utilizador_id = v_user)) THEN
    RAISE EXCEPTION 'Só quem está na ordem lhe anexa ficheiros.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se anexa a uma ordem % — o processo está encerrado.',
      replace(v_o.estado, '_', ' ');
  END IF;

  v_prefixo := v_o.organization_id::text || '/' || v_o.id::text || '/';
  IF p_caminho IS NULL OR left(p_caminho, length(v_prefixo)) <> v_prefixo THEN
    RAISE EXCEPTION 'O caminho do ficheiro não pertence a esta ordem.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tarefa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id AND ordem_id = p_ordem_id) THEN
    RAISE EXCEPTION 'Essa tarefa não é desta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ops_anexo (
    organization_id, ordem_id, ordem_tarefa_id, caminho, nome, mime, tamanho,
    legenda, privado, carregado_por)
  VALUES (
    v_o.organization_id, p_ordem_id, p_tarefa_id, p_caminho,
    COALESCE(nullif(btrim(p_nome), ''), 'ficheiro'),
    p_mime, p_tamanho, nullif(btrim(coalesce(p_legenda, '')), ''),
    COALESCE(p_privado, false), v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'anexo', p_nome, v_user, NULL,
     jsonb_build_object('anexo_id', v_id, 'tarefa_id', p_tarefa_id, 'privado', p_privado));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'caminho', p_caminho);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_registar_anexo(uuid, text, text, uuid, text, integer, text, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_registar_anexo(uuid, text, text, uuid, text, integer, text, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_registar_anexo(uuid, text, text, uuid, text, integer, text, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_remover_anexo(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_remover_anexo(p_anexo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_a      record;
BEGIN
  SELECT * INTO v_a FROM public.ops_anexo WHERE id = p_anexo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anexo não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_a.organization_id) q;

  IF v_funcao = 'tecnico' AND v_a.carregado_por IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Só quem carregou o ficheiro, ou quem coordena, o pode apagar.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.ops_anexo WHERE id = p_anexo_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_a.organization_id, 'ordem', v_a.ordem_id, 'anexo_removido', v_a.nome, v_user,
     jsonb_build_object('anexo_id', p_anexo_id, 'caminho', v_a.caminho), NULL);

  RETURN jsonb_build_object('ok', true, 'caminho', v_a.caminho);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_remover_anexo(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_remover_anexo(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_remover_anexo(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_remover_custo(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_remover_custo(p_custo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_c      record;
  v_o      record;
BEGIN
  SELECT * INTO v_c FROM public.ops_custo WHERE id = p_custo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Custo não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = v_c.ordem_id;
  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF NOT public.ops_pode(v_o.organization_id, 'operations.costs.view') THEN
    RAISE EXCEPTION 'Sem permissão para mexer em custos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_c.origem = 'calculado' THEN
    RAISE EXCEPTION
      'Esse custo é calculado das sessões de trabalho. Para o mudar, corrige as sessões ou o custo/hora da pessoa.';
  END IF;

  DELETE FROM public.ops_custo WHERE id = p_custo_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', v_c.ordem_id, 'custo_removido', v_c.descricao, v_user,
     jsonb_build_object('total', v_c.total, 'tipo', v_c.tipo), NULL);

  RETURN jsonb_build_object('ok', true);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_remover_custo(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_remover_custo(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_remover_custo(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_remover_tarefa(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_remover_tarefa(p_tarefa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_user   uuid;
  v_t      record;
  v_o      record;
  v_funcao text;
BEGIN
  v_user := public.current_business_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_t FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = v_t.ordem_id;

  IF NOT (
    public.is_system_admin_user(v_uid)
    OR v_o.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = v_o.organization_id AND ativo;
  IF v_funcao IS NULL AND NOT public.is_system_admin_user(v_uid) THEN
    RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_t.estado <> 'pendente' THEN
    RAISE EXCEPTION 'Essa tarefa já foi respondida. Trabalho feito não se apaga.';
  END IF;

  IF v_o.estado IN ('fechada', 'confirmada', 'cancelada') THEN
    RAISE EXCEPTION 'Esta ordem já está %.', v_o.estado;
  END IF;

  DELETE FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes)
  VALUES
    (v_o.organization_id, 'ordem', v_t.ordem_id, 'tarefa_removida',
     v_t.nome, v_user,
     jsonb_build_object('tarefa_id', p_tarefa_id, 'tipo', v_t.tipo));

  RETURN jsonb_build_object('ok', true);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_remover_tarefa(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_remover_tarefa(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_remover_tarefa(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_repor_rotulos(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_repor_rotulos(p_org_id uuid, p_lista text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.ops_exige_gestao(p_org_id);
  v_n    integer;
BEGIN
  DELETE FROM public.ops_rotulo
   WHERE organization_id = p_org_id
     AND (p_lista IS NULL OR lista = p_lista);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'repostos', v_n, 'por', v_user);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_repor_rotulos(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_repor_rotulos(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_repor_rotulos(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_responder_medicao(uuid, uuid, numeric, text, uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_responder_medicao(p_tarefa_id uuid, p_medicao_def_id uuid, p_valor_num numeric DEFAULT NULL::numeric, p_valor_texto text DEFAULT NULL::text, p_opcao_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('ops.medicao', 'autorizada', true);
  r := public.ops_responder_medicao_impl(
         p_tarefa_id, p_medicao_def_id, p_valor_num, p_valor_texto, p_opcao_id);
  PERFORM set_config('ops.medicao', '', true);
  RETURN r;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_responder_medicao(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_responder_medicao(uuid, uuid, numeric, text, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_responder_medicao(uuid, uuid, numeric, text, uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_responder_tarefa(uuid, text, numeric, text, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_responder_tarefa(p_tarefa_id uuid, p_estado text DEFAULT NULL::text, p_valor_num numeric DEFAULT NULL::numeric, p_valor_texto text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('ops.tarefa', 'autorizada', true);
  r := public.ops_responder_tarefa_impl(p_tarefa_id, p_estado, p_valor_num, p_valor_texto, p_observacoes);
  PERFORM set_config('ops.tarefa', '', true);
  RETURN r;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_responder_tarefa(uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_responder_tarefa(uuid, text, numeric, text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_responder_tarefa(uuid, text, numeric, text, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_servico_modelo_gravar(uuid, uuid, jsonb)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_servico_modelo_gravar(p_org uuid, p_servico_id uuid, p_tarefas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.current_business_user_id();
  v_n    integer := COALESCE(jsonb_array_length(p_tarefas), 0);
  t      jsonb;
  i      integer := 0;
  v_dep  integer;
  v_mpu  numeric;
  v_fix  integer;
BEGIN
  IF NOT public.ops_obra_pode_gerir_modelos(p_org) THEN
    RAISE EXCEPTION 'Sem permissão para gerir modelos nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.ops_obra_servico_da_org(p_org, p_servico_id) THEN
    RAISE EXCEPTION 'Serviço não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
  END IF;
  IF jsonb_typeof(COALESCE(p_tarefas, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'As tarefas têm de vir numa lista.';
  END IF;

  -- Validar tudo antes de apagar o que lá está.
  FOR t IN SELECT x FROM jsonb_array_elements(COALESCE(p_tarefas, '[]'::jsonb)) x LOOP
    i := i + 1;
    IF nullif(btrim(t->>'nome'), '') IS NULL THEN
      RAISE EXCEPTION 'A tarefa n.º % não tem nome.', i;
    END IF;
    IF COALESCE((t->>'fase')::integer, 0) NOT BETWEEN 1 AND 9 THEN
      RAISE EXCEPTION '"%": a fase tem de ser de 1 a 9.', t->>'nome';
    END IF;
    v_mpu := COALESCE((t->>'minutos_por_unidade')::numeric, 0);
    v_fix := COALESCE((t->>'minutos_fixos')::integer, 0);
    IF v_mpu < 0 OR v_fix < 0 OR (v_mpu = 0 AND v_fix = 0) THEN
      RAISE EXCEPTION '"%": precisa de tempo (por unidade ou fixo).', t->>'nome';
    END IF;
    IF COALESCE((t->>'pessoas')::integer, 1) NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION '"%": de 1 a 20 pessoas.', t->>'nome';
    END IF;
    v_dep := (t->>'depende_ordem')::integer;
    IF v_dep IS NOT NULL AND (v_dep = i OR v_dep < 1 OR v_dep > v_n) THEN
      RAISE EXCEPTION '"%": só pode depender de outra tarefa deste serviço.', t->>'nome';
    END IF;
    IF nullif(t->>'skill_id', '') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.ops_skill WHERE id = (t->>'skill_id')::uuid AND organization_id = p_org) THEN
      RAISE EXCEPTION '"%": essa especialidade não é desta organização.', t->>'nome';
    END IF;
  END LOOP;

  DELETE FROM public.ops_obra_servico_tarefa WHERE organization_id = p_org AND servico_id = p_servico_id;

  INSERT INTO public.ops_obra_servico_tarefa (
    organization_id, servico_id, ordem, nome, fase, minutos_por_unidade, minutos_fixos, pessoas,
    skill_id, depende_ordem, procedimento, materiais, ferramentas, origem, atualizado_por)
  SELECT p_org, p_servico_id, x.pos::integer, btrim(x.t->>'nome'), (x.t->>'fase')::smallint,
         COALESCE((x.t->>'minutos_por_unidade')::numeric, 0), COALESCE((x.t->>'minutos_fixos')::integer, 0),
         COALESCE((x.t->>'pessoas')::smallint, 1), nullif(x.t->>'skill_id', '')::uuid,
         (x.t->>'depende_ordem')::integer,
         nullif(btrim(x.t->>'procedimento'), ''), nullif(btrim(x.t->>'materiais'), ''),
         nullif(btrim(x.t->>'ferramentas'), ''), 'manual', v_user
    FROM jsonb_array_elements(COALESCE(p_tarefas, '[]'::jsonb)) WITH ORDINALITY AS x(t, pos);

  RETURN jsonb_build_object('ok', true, 'tarefas', v_n);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_servico_modelo_gravar(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_servico_modelo_gravar(uuid, uuid, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_servico_modelo_gravar(uuid, uuid, jsonb) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_servico_modelo_sugerir(uuid, uuid, boolean)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_servico_modelo_sugerir(p_org uuid, p_servico_id uuid DEFAULT NULL::uuid, p_substituir boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := public.current_business_user_id();
  v_servicos integer := 0;
  v_tarefas  integer := 0;
  v_k        integer;
  v_id       uuid;
BEGIN
  IF NOT public.ops_obra_pode_gerir_modelos(p_org) THEN
    RAISE EXCEPTION 'Sem permissão para gerir modelos nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF to_regclass('public.services') IS NULL THEN
    RAISE EXCEPTION 'Esta base não tem o catálogo de serviços do CRM.';
  END IF;

  IF p_servico_id IS NOT NULL THEN
    IF NOT public.ops_obra_servico_da_org(p_org, p_servico_id) THEN
      RAISE EXCEPTION 'Serviço não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT p_substituir AND EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa
                                     WHERE organization_id = p_org AND servico_id = p_servico_id) THEN
      RAISE EXCEPTION 'Esse serviço já tem modelo. Para o refazer, confirma a substituição.';
    END IF;
    v_tarefas := public.ops_obra_servico_sugerir_impl(p_org, p_servico_id, v_user);
    v_servicos := 1;
  ELSE
    FOR v_id IN EXECUTE
      'SELECT s.id FROM public.services s
        WHERE NOT COALESCE(s.is_deleted, false) AND s.deleted_at IS NULL
          AND (s.organization_id = $1'
      || CASE WHEN to_regclass('public.service_organizations') IS NOT NULL
              THEN ' OR EXISTS (SELECT 1 FROM public.service_organizations so
                                 WHERE so.service_id = s.id AND so.organization_id = $1)'
              ELSE '' END
      || ')' USING p_org
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa
                      WHERE organization_id = p_org AND servico_id = v_id)
         OR (p_substituir AND NOT EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa
                                           WHERE organization_id = p_org AND servico_id = v_id
                                             AND origem = 'manual')) THEN
        v_k := public.ops_obra_servico_sugerir_impl(p_org, v_id, v_user);
        v_tarefas := v_tarefas + v_k;
        v_servicos := v_servicos + 1;
      END IF;
    END LOOP;
  END IF;

  PERFORM public.ops_obra_semear_tipo_geral_impl(p_org);
  RETURN jsonb_build_object('ok', true, 'servicos', v_servicos, 'tarefas', v_tarefas);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_servico_modelo_sugerir(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_servico_modelo_sugerir(uuid, uuid, boolean) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_servico_modelo_sugerir(uuid, uuid, boolean) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_servicos_com_modelo(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_servicos_com_modelo(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.ops_obra_pode_ver_modelos(p_org) THEN
    RAISE EXCEPTION 'Sem permissão nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF to_regclass('public.services') IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  EXECUTE
    'SELECT COALESCE(jsonb_agg(jsonb_build_object(
        ''servico_id'', s.id, ''nome'', s.name, ''sku'', s.sku, ''categoria'', c.name,
        ''horas'', s.technical_sheet_labor_hours, ''pessoas'', s.technical_sheet_labor_people_count,
        ''descricao_mao_obra'', s.technical_sheet_labor_description,
        ''tarefas'', COALESCE(m.tarefas, ''[]''::jsonb),
        ''editado'', COALESCE(m.editado, false)) ORDER BY c.name NULLS LAST, s.name), ''[]''::jsonb)
       FROM public.services s
       LEFT JOIN public.service_categories c ON c.id = s.service_category_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
                  ''id'', x.id, ''ordem'', x.ordem, ''nome'', x.nome, ''fase'', x.fase,
                  ''minutos_por_unidade'', x.minutos_por_unidade, ''minutos_fixos'', x.minutos_fixos,
                  ''pessoas'', x.pessoas, ''skill_id'', x.skill_id, ''depende_ordem'', x.depende_ordem,
                  ''procedimento'', x.procedimento, ''materiais'', x.materiais, ''ferramentas'', x.ferramentas,
                  ''origem'', x.origem) ORDER BY x.ordem) AS tarefas,
                bool_or(x.origem = ''manual'') AS editado
           FROM public.ops_obra_servico_tarefa x
          WHERE x.organization_id = $1 AND x.servico_id = s.id) m ON true
      WHERE NOT COALESCE(s.is_deleted, false) AND s.deleted_at IS NULL
        AND (s.organization_id = $1'
    || CASE WHEN to_regclass('public.service_organizations') IS NOT NULL
            THEN ' OR EXISTS (SELECT 1 FROM public.service_organizations so
                               WHERE so.service_id = s.id AND so.organization_id = $1)'
            ELSE '' END
    || ')'
    INTO v USING p_org;
  RETURN v;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_servicos_com_modelo(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_servicos_com_modelo(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_servicos_com_modelo(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_sessao(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_sessao(p_ordem_id uuid, p_acao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_c  record;
  v_id uuid;
  v_n  integer := 0;
BEGIN
  IF p_acao NOT IN ('entrar','sair') THEN
    RAISE EXCEPTION 'Ação desconhecida: %. Vale entrar ou sair.', p_acao;
  END IF;

  SELECT * INTO v_c FROM public.ops_contexto_de_execucao(p_ordem_id);

  IF p_acao = 'entrar' THEN
    IF v_c.estado <> 'em_curso' THEN
      RAISE EXCEPTION 'Só se conta tempo numa ordem em curso (esta está %).',
        replace(v_c.estado, '_', ' ');
    END IF;
    -- Já a contar (na ordem ou numa tarefa)? Fica como está.
    SELECT id INTO v_id FROM public.ops_sessao_trabalho
     WHERE ordem_id = p_ordem_id AND utilizador_id = v_c.utilizador_id AND fim IS NULL;
    IF v_id IS NULL THEN
      v_id := public.ops_sessao_abrir(p_ordem_id, v_c.utilizador_id, NULL, now());
    END IF;
    RETURN jsonb_build_object('ok', true, 'a_contar', true, 'sessao_id', v_id);
  END IF;

  v_n := public.ops_sessao_fechar(p_ordem_id, v_c.utilizador_id, 'pessoa', now());
  RETURN jsonb_build_object('ok', true, 'a_contar', false, 'fechadas', v_n);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_sessao(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_sessao(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_sessao(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_skill_criar(uuid, text)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_skill_criar(p_org uuid, p_nome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id   uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  IF NOT public.ops_obra_pode_gerir_modelos(p_org) THEN
    RAISE EXCEPTION 'Sem permissão para gerir especialidades nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Uma especialidade precisa de nome.';
  END IF;
  INSERT INTO public.ops_skill (organization_id, nome) VALUES (p_org, v_nome)
  ON CONFLICT (organization_id, nome) DO UPDATE SET ativo = true
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_skill_criar(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_skill_criar(uuid, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_skill_criar(uuid, text) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_skills_do_utilizador(uuid, uuid, uuid[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_skills_do_utilizador(p_org_id uuid, p_utilizador_id uuid, p_skills uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.ops_exige_gestao(p_org_id);
  v_n    integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE organization_id = p_org_id AND utilizador_id = p_utilizador_id
  ) THEN
    RAISE EXCEPTION 'Essa pessoa não é da equipa desta organização.';
  END IF;

  -- Só as especialidades desta organização, mesmo que venham outras no pedido.
  DELETE FROM public.ops_utilizador_skill us
   USING public.ops_skill s
   WHERE us.skill_id = s.id
     AND s.organization_id = p_org_id
     AND us.utilizador_id = p_utilizador_id;

  IF p_skills IS NOT NULL AND array_length(p_skills, 1) > 0 THEN
    INSERT INTO public.ops_utilizador_skill (utilizador_id, skill_id)
    SELECT p_utilizador_id, s.id
      FROM public.ops_skill s
     WHERE s.id = ANY (p_skills) AND s.organization_id = p_org_id
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'especialidades', v_n, 'por', v_user);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_skills_do_utilizador(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_skills_do_utilizador(uuid, uuid, uuid[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_skills_do_utilizador(uuid, uuid, uuid[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_stock_disponivel(uuid, uuid[])') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_stock_disponivel(p_org uuid, p_produtos uuid[])
 RETURNS TABLE(produto_id uuid, nome text, sku text, unidade text, gere_stock boolean, fisico numeric, reservado numeric, a_chegar numeric, disponivel numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.ops_stock_verificar(p_org);
  IF cardinality(p_produtos) > 500 THEN
    RAISE EXCEPTION 'Demasiados produtos de uma vez (máximo 500).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY SELECT c.* FROM public.ops_stock_calcular(p_org, p_produtos) c ORDER BY c.nome;
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_stock_disponivel(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_stock_disponivel(uuid, uuid[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_stock_disponivel(uuid, uuid[]) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_stock_pesquisar(uuid, text, integer)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_stock_pesquisar(p_org uuid, p_texto text, p_limite integer DEFAULT 20)
 RETURNS TABLE(produto_id uuid, nome text, sku text, unidade text, gere_stock boolean, fisico numeric, reservado numeric, a_chegar numeric, disponivel numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_texto  text := btrim(COALESCE(p_texto, ''));
  v_limite int  := LEAST(GREATEST(COALESCE(p_limite, 20), 1), 50);
  v_padrao text;
  v_barras text := '';
  v_ids    uuid[];
BEGIN
  PERFORM public.ops_stock_verificar(p_org);
  IF NOT public.ops_stock_ha_inventario() THEN
    RETURN;
  END IF;

  -- %, _ e \ escritos pela pessoa são texto, não padrões.
  v_padrao := '%' || replace(replace(replace(v_texto, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  IF public.ops_stock_tem('products', ARRAY['barcode']) THEN
    v_barras := ' OR p.barcode = $2';
  END IF;

  EXECUTE format($q$
    SELECT COALESCE(array_agg(x.id ORDER BY x.ordem, x.nome), '{}')
      FROM (
        SELECT p.id, p.name AS nome,
               CASE WHEN $2 <> '' AND (lower(p.sku) = lower($2)%1$s) THEN 0 ELSE 1 END AS ordem
          FROM public.products p
         WHERE p.deleted_at IS NULL
           AND %2$s
           AND ($2 = '' OR p.name ILIKE $3 OR p.sku ILIKE $3%1$s)
         ORDER BY ordem, p.name
         LIMIT $4
      ) x
  $q$, v_barras, public.ops_stock_filtro_org())
  INTO v_ids
  USING p_org, v_texto, v_padrao, v_limite;

  RETURN QUERY
  SELECT c.* FROM public.ops_stock_calcular(p_org, v_ids) c
   ORDER BY array_position(v_ids, c.produto_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_stock_pesquisar(uuid, text, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_stock_pesquisar(uuid, text, integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_stock_pesquisar(uuid, text, integer) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_stock_sugerir(uuid, uuid, numeric)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_stock_sugerir(p_org uuid, p_servico_id uuid, p_quantidade numeric)
 RETURNS TABLE(produto_id uuid, nome text, sku text, unidade text, quantidade numeric, gere_stock boolean, fisico numeric, reservado numeric, a_chegar numeric, disponivel numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_qt     numeric := COALESCE(p_quantidade, 1);
  v_regra  text := 'NULL::numeric';
  v_ordem  text := '0';
  v_fator  text := '1';
  v_join   text := '';
  v_ids    uuid[];
  v_qts    numeric[];
BEGIN
  PERFORM public.ops_stock_verificar(p_org);
  IF v_qt < 0 THEN
    RAISE EXCEPTION 'A quantidade do serviço não pode ser negativa.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_servico_id IS NULL
     OR NOT public.ops_stock_ha_inventario()
     OR NOT public.ops_stock_tem('service_materials',
              ARRAY['service_id','product_id','quantity','organization_id','deleted_at']) THEN
    RETURN;
  END IF;

  IF public.ops_stock_tem('service_materials', ARRAY['reference_area_m2','reference_quantity']) THEN
    v_regra := 'CASE WHEN sm.reference_area_m2 > 0 AND sm.reference_quantity IS NOT NULL
                     THEN ceil(sm.reference_quantity / sm.reference_area_m2 * $3) END';
  END IF;
  IF public.ops_stock_tem('service_materials', ARRAY['sort_order']) THEN
    v_ordem := 'COALESCE(sm.sort_order, 0)';
  END IF;
  IF public.ops_stock_tem('service_materials', ARRAY['uom_id'])
     AND public.ops_stock_tem('products', ARRAY['uom_id'])
     AND public.ops_stock_tem('uom', ARRAY['id','base_uom_id','conversion_factor']) THEN
    v_join  := 'LEFT JOIN public.products p ON p.id = sm.product_id
                LEFT JOIN public.uom mu ON mu.id = sm.uom_id';
    v_fator := 'CASE WHEN sm.uom_id IS NULL OR sm.uom_id = p.uom_id THEN 1
                     WHEN mu.base_uom_id = p.uom_id AND mu.conversion_factor >= 1 THEN mu.conversion_factor
                     ELSE 1 END';
  END IF;

  EXECUTE format($q$
    SELECT COALESCE(array_agg(x.product_id ORDER BY x.ordem), '{}'),
           COALESCE(array_agg(x.q          ORDER BY x.ordem), '{}')
      FROM (
        SELECT sm.product_id,
               MIN(%1$s) AS ordem,
               round(SUM(COALESCE(%2$s, COALESCE(sm.quantity, 0) * $3) * %3$s), 3) AS q
          FROM public.service_materials sm
          %4$s
         WHERE sm.service_id = $2
           AND sm.organization_id = $1
           AND sm.deleted_at IS NULL
           AND sm.product_id IS NOT NULL
         GROUP BY sm.product_id
      ) x
  $q$, v_ordem, v_regra, v_fator, v_join)
  INTO v_ids, v_qts
  USING p_org, p_servico_id, v_qt;

  RETURN QUERY
  SELECT c.produto_id, c.nome, c.sku, c.unidade,
         v_qts[array_position(v_ids, c.produto_id)],
         c.gere_stock, c.fisico, c.reservado, c.a_chegar, c.disponivel
    FROM public.ops_stock_calcular(p_org, v_ids) c
   ORDER BY array_position(v_ids, c.produto_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_stock_sugerir(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_stock_sugerir(uuid, uuid, numeric) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_stock_sugerir(uuid, uuid, numeric) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_tarefa_iniciar(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_tarefa_iniciar(p_tarefa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t  record;
  v_c  record;
  v_id uuid;
BEGIN
  SELECT * INTO v_t FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_c FROM public.ops_contexto_de_execucao(v_t.ordem_id);

  IF v_c.estado <> 'em_curso' THEN
    RAISE EXCEPTION 'Só se começa uma tarefa de uma ordem em curso (esta está %).',
      replace(v_c.estado, '_', ' ');
  END IF;
  IF v_t.estado <> 'pendente' THEN
    RAISE EXCEPTION 'Essa tarefa já está respondida.';
  END IF;

  v_id := public.ops_sessao_abrir(v_t.ordem_id, v_c.utilizador_id, p_tarefa_id, now());

  -- O início da tarefa é a primeira vez que alguém lhe pegou.
  UPDATE public.ops_ordem_tarefa SET inicio = COALESCE(inicio, now())
   WHERE id = p_tarefa_id;

  RETURN jsonb_build_object('ok', true, 'sessao_id', v_id);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_tarefa_iniciar(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_tarefa_iniciar(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_tarefa_iniciar(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_tarefa_terminar(uuid)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_tarefa_terminar(p_tarefa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t  record;
  v_c  record;
  v_n  integer;
  v_s  bigint;
BEGIN
  SELECT * INTO v_t FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_c FROM public.ops_contexto_de_execucao(v_t.ordem_id);

  UPDATE public.ops_sessao_trabalho
     SET fim = GREATEST(now(), inicio), motivo_fim = 'tarefa'
   WHERE ordem_id = v_t.ordem_id AND utilizador_id = v_c.utilizador_id
     AND ordem_tarefa_id = p_tarefa_id AND fim IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n > 0 AND v_c.estado = 'em_curso' THEN
    PERFORM public.ops_sessao_abrir(v_t.ordem_id, v_c.utilizador_id, NULL, now());
  END IF;

  SELECT COALESCE(sum(EXTRACT(EPOCH FROM (COALESCE(fim, now()) - inicio))), 0)::bigint INTO v_s
    FROM public.ops_sessao_trabalho WHERE ordem_tarefa_id = p_tarefa_id;

  RETURN jsonb_build_object('ok', true, 'fechadas', v_n, 'segundos_na_tarefa', v_s);
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_tarefa_terminar(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_tarefa_terminar(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_tarefa_terminar(uuid) TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_ops_transitar_ordem(uuid, text, text, timestamp with time zone)') IS NULL THEN
    EXECUTE $fn$CREATE OR REPLACE FUNCTION public.rpc_ops_transitar_ordem(p_ordem_id uuid, p_transicao text, p_motivo text DEFAULT NULL::text, p_retoma_prevista timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_user      uuid;
  v_funcao    text;
  v_o         record;
  v_atribuido boolean;
  v_sem_equipa boolean;
  v_de        text;
  v_para      text;
  v_pendentes integer;
  v_agora     timestamptz := now();
  v_motivo    text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_custo     jsonb := NULL;
BEGIN
  -- ── identidade ───────────────────────────────────────────────────────
  v_user := public.current_business_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── âmbito ───────────────────────────────────────────────────────────
  IF NOT (
    public.is_system_admin_user(v_uid)
    OR v_o.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── função no módulo, NESTA organização ──────────────────────────────
  SELECT funcao INTO v_funcao
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user
     AND organization_id = v_o.organization_id
     AND ativo;

  IF v_funcao IS NULL THEN
    IF public.is_system_admin_user(v_uid) THEN
      v_funcao := 'admin';
    ELSE
      RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_de := v_o.estado;
  -- COALESCE: numa ordem sem responsável, `NULL = x` dá NULL, e `NOT NULL`
  -- não recusa nada — um técnico de fora passava (auditoria 01/10/2026).
  v_atribuido := COALESCE(v_o.responsavel_id = v_user, false)
    OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                WHERE ordem_id = p_ordem_id AND utilizador_id = v_user);
  v_sem_equipa := v_o.responsavel_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.ops_ordem_pessoa WHERE ordem_id = p_ordem_id);

  -- ── as regras ────────────────────────────────────────────────────────
  CASE p_transicao

    WHEN 'aprovar' THEN
      IF v_de <> 'por_aprovar' THEN RAISE EXCEPTION 'Só se aprova uma ordem por aprovar.'; END IF;
      IF v_funcao NOT IN ('admin','gestor') THEN RAISE EXCEPTION 'Sem permissão para aprovar.' USING ERRCODE='insufficient_privilege'; END IF;
      v_para := 'agendada';

    WHEN 'rejeitar' THEN
      IF v_de <> 'por_aprovar' THEN RAISE EXCEPTION 'Só se rejeita uma ordem por aprovar.'; END IF;
      IF v_funcao NOT IN ('admin','gestor') THEN RAISE EXCEPTION 'Sem permissão para rejeitar.' USING ERRCODE='insufficient_privilege'; END IF;
      IF v_motivo IS NULL THEN RAISE EXCEPTION 'Rejeitar exige um motivo.'; END IF;
      v_para := 'cancelada';

    WHEN 'iniciar' THEN
      IF v_de <> 'agendada' THEN RAISE EXCEPTION 'Só se inicia uma ordem agendada.'; END IF;
      IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
        RAISE EXCEPTION 'Só quem está na ordem a pode iniciar.' USING ERRCODE='insufficient_privilege';
      END IF;
      v_para := 'em_curso';

    WHEN 'pausar' THEN
      IF v_de <> 'em_curso' THEN RAISE EXCEPTION 'Só se pausa uma ordem em curso.'; END IF;
      IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
        RAISE EXCEPTION 'Só quem está na ordem a pode pausar.' USING ERRCODE='insufficient_privilege';
      END IF;
      IF v_motivo IS NULL THEN RAISE EXCEPTION 'Pausar exige um motivo.'; END IF;
      IF p_retoma_prevista IS NULL THEN RAISE EXCEPTION 'Pausar exige uma data de retoma prevista.'; END IF;
      v_para := 'pausada';

    WHEN 'retomar' THEN
      IF v_de <> 'pausada' THEN RAISE EXCEPTION 'Só se retoma uma ordem pausada.'; END IF;
      IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
        RAISE EXCEPTION 'Só quem está na ordem a pode retomar.' USING ERRCODE='insufficient_privilege';
      END IF;
      v_para := 'em_curso';

    WHEN 'fechar' THEN
      IF v_de <> 'em_curso' THEN RAISE EXCEPTION 'Só se fecha uma ordem em curso.'; END IF;
      IF v_funcao = 'tecnico' AND NOT v_atribuido THEN
        RAISE EXCEPTION 'Só quem está na ordem a pode fechar.' USING ERRCODE='insufficient_privilege';
      END IF;
      SELECT count(*) INTO v_pendentes FROM public.ops_ordem_tarefa
       WHERE ordem_id = p_ordem_id AND obrigatoria AND estado = 'pendente';
      IF v_pendentes = 1 THEN
        RAISE EXCEPTION 'Falta responder a 1 tarefa obrigatória.';
      ELSIF v_pendentes > 1 THEN
        RAISE EXCEPTION 'Faltam responder a % tarefas obrigatórias.', v_pendentes;
      END IF;
      v_para := 'fechada';

    -- Validar o trabalho: confirmar que ficou bem, ou devolvê-lo.
    WHEN 'confirmar' THEN
      IF v_de <> 'fechada' THEN RAISE EXCEPTION 'Só se confirma uma ordem fechada.'; END IF;
      IF v_funcao NOT IN ('admin','gestor','supervisor') THEN RAISE EXCEPTION 'Sem permissão para confirmar.' USING ERRCODE='insufficient_privilege'; END IF;
      v_para := 'confirmada';

    WHEN 'reabrir' THEN
      IF v_de <> 'fechada' THEN RAISE EXCEPTION 'Só se reabre uma ordem fechada.'; END IF;
      IF v_funcao NOT IN ('admin','gestor','supervisor') THEN RAISE EXCEPTION 'Sem permissão para reabrir.' USING ERRCODE='insufficient_privilege'; END IF;
      v_para := 'em_curso';

    WHEN 'cancelar' THEN
      IF v_de NOT IN ('por_aprovar','agendada','em_curso','pausada') THEN
        RAISE EXCEPTION 'Não é possível cancelar uma ordem %.', replace(v_de,'_',' ');
      END IF;
      IF v_funcao NOT IN ('admin','gestor','supervisor','operador') THEN RAISE EXCEPTION 'Sem permissão para cancelar.' USING ERRCODE='insufficient_privilege'; END IF;
      IF v_motivo IS NULL THEN RAISE EXCEPTION 'Cancelar exige um motivo.'; END IF;
      v_para := 'cancelada';

    ELSE
      RAISE EXCEPTION 'Transição desconhecida: %', p_transicao;
  END CASE;

  -- ── escrever ─────────────────────────────────────────────────────────
  PERFORM set_config('ops.transicao', 'autorizada', true);

  UPDATE public.ops_ordem SET
    estado              = v_para,
    atualizada_em       = v_agora,
    aprovada_em         = CASE WHEN p_transicao = 'aprovar'   THEN v_agora ELSE aprovada_em END,
    aprovada_por        = CASE WHEN p_transicao = 'aprovar'   THEN v_user  ELSE aprovada_por END,
    iniciada_em         = CASE WHEN p_transicao = 'iniciar'   THEN COALESCE(iniciada_em, v_agora) ELSE iniciada_em END,
    fechada_em          = CASE WHEN p_transicao = 'fechar'    THEN v_agora
                               WHEN p_transicao = 'reabrir'   THEN NULL ELSE fechada_em END,
    confirmada_em       = CASE WHEN p_transicao = 'confirmar' THEN v_agora ELSE confirmada_em END,
    cancelada_em        = CASE WHEN p_transicao IN ('cancelar','rejeitar') THEN v_agora ELSE cancelada_em END,
    motivo_cancelamento = CASE WHEN p_transicao IN ('cancelar','rejeitar') THEN v_motivo ELSE motivo_cancelamento END,
    pausa_motivo        = CASE WHEN p_transicao = 'pausar'    THEN v_motivo
                               WHEN p_transicao = 'retomar'   THEN NULL ELSE pausa_motivo END,
    pausa_retoma_prevista = CASE WHEN p_transicao = 'pausar'  THEN p_retoma_prevista
                                 WHEN p_transicao = 'retomar' THEN NULL ELSE pausa_retoma_prevista END
  WHERE id = p_ordem_id;

  PERFORM set_config('ops.transicao', '', true);

  -- ── relógios ─────────────────────────────────────────────────────────
  -- Cada um liga o seu. A transição só liga o de quem carregou no botão, e
  -- só se essa pessoa vai mesmo trabalhar (está na ordem, ou a ordem não
  -- tem equipa). Parar a ordem pára toda a gente, com o motivo escrito.
  IF p_transicao IN ('iniciar','retomar') AND (v_atribuido OR v_sem_equipa) THEN
    PERFORM public.ops_sessao_abrir(p_ordem_id, v_user, NULL, v_agora);
  END IF;

  IF p_transicao = 'pausar' THEN
    PERFORM public.ops_sessao_fechar(p_ordem_id, NULL, 'pausa', v_agora);
  ELSIF p_transicao = 'fechar' THEN
    PERFORM public.ops_sessao_fechar(p_ordem_id, NULL, 'fecho', v_agora);
  ELSIF p_transicao IN ('cancelar','rejeitar') THEN
    PERFORM public.ops_sessao_fechar(p_ordem_id, NULL, 'cancelamento', v_agora);
  END IF;

  IF p_transicao = 'fechar' THEN
    v_custo := public.ops_recalcular_custo_mao_obra(p_ordem_id);
  END IF;

  -- ── histórico ────────────────────────────────────────────────────────
  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, p_transicao, v_motivo, v_user,
     jsonb_build_object('estado', v_de),
     jsonb_build_object('estado', v_para));

  RETURN jsonb_build_object(
    'ok', true, 'de', v_de, 'para', v_para, 'custo_mao_obra', v_custo
  );
END
$function$$fn$;
    REVOKE ALL ON FUNCTION public.rpc_ops_transitar_ordem(uuid, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_transitar_ordem(uuid, text, text, timestamp with time zone) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_ops_transitar_ordem(uuid, text, text, timestamp with time zone) TO service_role;
  END IF;
END $do$;

-- 5. Vistas
DO $do$ BEGIN
  IF to_regclass('public.ops_v_ativo_intervencao') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_ativo_intervencao WITH (security_invoker=true) AS
 SELECT oa.ativo_id,
    o.organization_id,
    o.cliente_id,
    o.id AS ordem_id,
    o.codigo,
    o.origem,
    o.estado,
    o.titulo,
    o.prioridade,
    COALESCE(o.fechada_em, o.iniciada_em, o.agendada_para, o.criada_em) AS quando,
    o.fechada_em,
    o.responsavel_id,
    (( SELECT count(*) AS count
           FROM ops_ordem_tarefa t
          WHERE t.ordem_alvo_id = oa.id AND t.estado = 'nao_conforme'::text))::integer AS nao_conformidades,
    (( SELECT count(*) AS count
           FROM ops_ordem_tarefa t
          WHERE t.ordem_alvo_id = oa.id))::integer AS tarefas
   FROM ops_ordem_alvo oa
     JOIN ops_ordem o ON o.id = oa.ordem_id
  WHERE oa.ativo_id IS NOT NULL AND o.estado <> 'cancelada'::text$vw$;
    REVOKE ALL ON public.ops_v_ativo_intervencao FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_ativo_intervencao TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_ativo_intervencao TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_ativo_leitura') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_ativo_leitura WITH (security_invoker=true) AS
 SELECT oa.ativo_id,
    o.organization_id,
    o.cliente_id,
    o.id AS ordem_id,
    o.codigo,
    m.id AS leitura_id,
    m.medicao_def_id,
    m.nome,
    m.tipo,
    m.unidade,
    m.limite_min,
    m.limite_max,
    m.valor_num,
    m.valor_texto,
    m.conforme,
    m.lida_em,
    m.corretiva_ordem_id,
    t.nome AS tarefa
   FROM ops_ordem_tarefa_medicao m
     JOIN ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
     JOIN ops_ordem_alvo oa ON oa.id = t.ordem_alvo_id
     JOIN ops_ordem o ON o.id = t.ordem_id
  WHERE oa.ativo_id IS NOT NULL AND m.lida_em IS NOT NULL$vw$;
    REVOKE ALL ON public.ops_v_ativo_leitura FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_ativo_leitura TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_ativo_leitura TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_catalogo') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_catalogo WITH (security_invoker=true) AS
 SELECT id,
    organization_id,
    COALESCE(NULLIF(btrim(item_code), ''::text), '—'::text) AS codigo,
    COALESCE(NULLIF(btrim(descricao), ''::text), 'Sem descrição'::text) AS descricao,
    categoria,
    subcategoria,
    tipo,
    COALESCE(custo_material, 0::numeric)::numeric(12,2) AS custo_material,
    COALESCE(custo_mao_obra, 0::numeric)::numeric(12,2) AS custo_mao_obra,
    (COALESCE(custo_material, 0::numeric) + COALESCE(custo_mao_obra, 0::numeric))::numeric(12,2) AS custo_total
   FROM catalog_items c
  WHERE ativo IS NOT FALSE$vw$;
    REVOKE ALL ON public.ops_v_catalogo FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_catalogo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_catalogo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_cliente') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_cliente WITH (security_invoker=true) AS
 SELECT c.id,
    c.organization_id,
    e.display_name AS nome,
    c.status
   FROM anew_clients c
     JOIN anew_entities e ON e.id = c.entity_id
  WHERE c.deleted_at IS NULL$vw$;
    REVOKE ALL ON public.ops_v_cliente FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_cliente TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_cliente TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_compra_linha') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_compra_linha WITH (security_invoker=true) AS
 SELECT i.id,
    p.organization_id,
    p.id AS compra_id,
    COALESCE(NULLIF(btrim(p.order_number), ''::text), '—'::text) AS numero,
    p.order_date AS data,
    p.status AS estado,
    i.description AS descricao,
    i.sku,
    i.item_type AS tipo,
    COALESCE(i.quantity, 1::numeric)::numeric(12,3) AS quantidade,
    COALESCE(i.unit_price, 0::numeric)::numeric(12,2) AS preco_unit,
    COALESCE(i.total_price, 0::numeric)::numeric(12,2) AS total,
    COALESCE(( SELECT sum(c.quantidade) AS sum
           FROM ops_custo c
          WHERE c.compra_linha_id = i.id), 0::numeric)::numeric(12,3) AS ja_atribuido
   FROM purchase_order_items i
     JOIN purchase_orders p ON p.id = i.purchase_order_id$vw$;
    REVOKE ALL ON public.ops_v_compra_linha FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_compra_linha TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_compra_linha TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_contacto_cliente') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_contacto_cliente WITH (security_invoker=true) AS
 SELECT cl.id AS cliente_id,
    cl.organization_id,
    COALESCE(NULLIF(btrim(e.display_name), ''::text), 'Cliente'::text) AS nome,
    t.id AS telefone_id,
    btrim(concat_ws(' '::text, NULLIF(t.country_code, ''::text), t.phone_number)) AS telefone,
    t.phone_type AS tipo,
    COALESCE(t.is_primary, false) AS principal,
    ( SELECT m.email
           FROM anew_entity_emails m
          WHERE m.entity_id = cl.entity_id
          ORDER BY m.is_primary DESC NULLS LAST, m.created_at
         LIMIT 1) AS email
   FROM anew_clients cl
     JOIN anew_entities e ON e.id = cl.entity_id
     LEFT JOIN anew_entity_phones t ON t.entity_id = cl.entity_id
  WHERE cl.deleted_at IS NULL$vw$;
    REVOKE ALL ON public.ops_v_contacto_cliente FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_contacto_cliente TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_contacto_cliente TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_contrato') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_contrato WITH (security_invoker=true) AS
 SELECT c.id,
    c.organization_id,
    c.client_id AS cliente_id,
    COALESCE(c.contract_number, '—'::text) AS numero,
    c.status AS estado,
    c.quote_id AS orcamento_id,
    COALESCE(NULLIF(btrim(q.title), ''::text), 'Contrato '::text || COALESCE(c.contract_number, ''::text)) AS titulo,
    q.obra_endereco,
    COALESCE(c.signature_date, c.company_signature_date, c.accepted_at) AS assinado_em,
    c.total_value AS valor,
    c.currency AS moeda,
    (EXISTS ( SELECT 1
           FROM ops_obra o
          WHERE o.contrato_id = c.id AND o.estado <> 'cancelada'::text)) AS tem_obra
   FROM client_contracts c
     LEFT JOIN quotes q ON q.id = c.quote_id AND q.deleted_at IS NULL
  WHERE c.deleted_at IS NULL AND (c.status = ANY (ARRAY['signed'::text, 'assinado'::text, 'active'::text]))$vw$;
    REVOKE ALL ON public.ops_v_contrato FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_contrato TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_contrato TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_custo_por_item') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_custo_por_item WITH (security_invoker=true) AS
 SELECT COALESCE(p.ordem_id, r.ordem_id) AS ordem_id,
    COALESCE(p.catalog_item_id, r.catalog_item_id) AS catalog_item_id,
    COALESCE(p.descricao, r.descricao) AS descricao,
    p.quantidade AS qt_prevista,
    p.total AS previsto,
    r.quantidade AS qt_real,
    r.total AS "real",
        CASE
            WHEN p.total IS NULL THEN 'nao_orcamentado'::text
            WHEN r.total IS NULL THEN 'nao_gasto'::text
            ELSE 'ambos'::text
        END AS situacao,
    (COALESCE(r.total, 0::numeric) - COALESCE(p.total, 0::numeric))::numeric(12,2) AS desvio
   FROM ( SELECT ops_ordem_previsto.ordem_id,
            ops_ordem_previsto.catalog_item_id,
            min(ops_ordem_previsto.descricao) AS descricao,
            sum(ops_ordem_previsto.quantidade) AS quantidade,
            sum(ops_ordem_previsto.total_sem_iva)::numeric(12,2) AS total
           FROM ops_ordem_previsto
          WHERE ops_ordem_previsto.catalog_item_id IS NOT NULL
          GROUP BY ops_ordem_previsto.ordem_id, ops_ordem_previsto.catalog_item_id) p
     FULL JOIN ( SELECT ops_custo.ordem_id,
            ops_custo.catalog_item_id,
            min(ops_custo.descricao) AS descricao,
            sum(ops_custo.quantidade) AS quantidade,
            sum(ops_custo.total)::numeric(12,2) AS total
           FROM ops_custo
          WHERE ops_custo.catalog_item_id IS NOT NULL
          GROUP BY ops_custo.ordem_id, ops_custo.catalog_item_id) r ON r.ordem_id = p.ordem_id AND r.catalog_item_id = p.catalog_item_id$vw$;
    REVOKE ALL ON public.ops_v_custo_por_item FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_custo_por_item TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_custo_por_item TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_equipa') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_equipa WITH (security_invoker=true) AS
 SELECT p.id,
    p.organization_id,
    p.utilizador_id,
    p.funcao,
    p.zona_base,
    p.ativo,
    u.name AS nome,
    u.email
   FROM ops_utilizador_perfil p
     JOIN anew_users u ON u.id = p.utilizador_id
  WHERE u.deleted_at IS NULL$vw$;
    REVOKE ALL ON public.ops_v_equipa FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_equipa TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_equipa TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_leitura') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_leitura WITH (security_invoker=true) AS
 SELECT m.id AS leitura_id,
    o.organization_id,
    o.cliente_id,
    o.id AS ordem_id,
    o.codigo AS ordem,
    m.medicao_def_id,
    m.nome,
    m.tipo,
    m.unidade,
    m.limite_min,
    m.limite_max,
    m.valor_num,
    m.valor_texto,
    m.conforme,
    m.lida_em,
    m.lida_por,
    t.nome AS tarefa,
    l.nome AS local,
    l.codigo AS local_codigo,
    a.nome AS ativo,
    a.codigo AS ativo_codigo
   FROM ops_ordem_tarefa_medicao m
     JOIN ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
     JOIN ops_ordem o ON o.id = t.ordem_id
     LEFT JOIN ops_ordem_alvo oa ON oa.id = t.ordem_alvo_id
     LEFT JOIN ops_ativo a ON a.id = oa.ativo_id
     LEFT JOIN ops_local l ON l.id = COALESCE(oa.local_id, o.local_id)
  WHERE m.lida_em IS NOT NULL AND o.estado <> 'cancelada'::text$vw$;
    REVOKE ALL ON public.ops_v_leitura FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_leitura TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_leitura TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_morada_cliente') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_morada_cliente WITH (security_invoker=true) AS
 SELECT a.id AS address_id,
    cl.id AS cliente_id,
    cl.organization_id,
    ea.address_type AS tipo,
    COALESCE(ea.is_primary, false) AS principal,
    btrim(concat_ws(', '::text, NULLIF(btrim(concat_ws(' '::text, a.street, a.number)), ''::text), NULLIF(btrim(concat_ws(' '::text, NULLIF(a.floor, ''::text), NULLIF(a.unit, ''::text))), ''::text), NULLIF(btrim(concat_ws(' '::text, a.postal_code, a.city)), ''::text))) AS morada,
    a.street,
    a.number,
    a.floor,
    a.unit,
    a.postal_code,
    a.city,
    a.district,
    (EXISTS ( SELECT 1
           FROM ops_local l
          WHERE l.address_id = a.id AND l.cliente_id = cl.id)) AS ja_e_local
   FROM anew_clients cl
     JOIN anew_entity_addresses ea ON ea.entity_id = cl.entity_id
     JOIN anew_addresses a ON a.id = ea.address_id
  WHERE cl.deleted_at IS NULL AND (ea.valid_to IS NULL OR ea.valid_to > now())$vw$;
    REVOKE ALL ON public.ops_v_morada_cliente FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_morada_cliente TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_morada_cliente TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_obra_tarefa') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_obra_tarefa WITH (security_invoker=true) AS
 SELECT t.id,
    t.organization_id,
    t.obra_id,
    t.fase_id,
    t.modelo_tarefa_id,
    t.ordem,
    t.nome,
    t.procedimento,
    t.materiais,
    t.ferramentas,
    t.minutos_previstos,
    t.inicio_planeado,
    t.fim_planeado,
    t.depende_de,
    t.estado,
    t.iniciada_em,
    t.terminada_em,
    t.motivo_desvio,
    t.nota_desvio,
    t.validada_por,
    t.validada_em,
    t.motivo_rejeicao,
    f.ordem AS fase_ordem,
    f.nome AS fase_nome,
    o.codigo AS obra_codigo,
    o.titulo AS obra_titulo,
    o.estado AS obra_estado,
    o.morada AS obra_morada,
    o.tolerancia_percent,
    COALESCE(r.minutos_reais, 0::numeric)::numeric(12,1) AS minutos_reais,
    COALESCE(r.a_correr, 0::bigint)::integer AS a_correr,
    COALESCE(p.pessoas, ARRAY[]::uuid[]) AS pessoas
   FROM ops_obra_tarefa t
     JOIN ops_obra_fase f ON f.id = t.fase_id
     JOIN ops_obra o ON o.id = t.obra_id
     LEFT JOIN LATERAL ( SELECT round(sum(EXTRACT(epoch FROM COALESCE(x.fim, now()) - x.inicio)) / 60.0, 1) AS minutos_reais,
            count(*) FILTER (WHERE x.fim IS NULL) AS a_correr
           FROM ops_obra_registo x
          WHERE x.tarefa_id = t.id) r ON true
     LEFT JOIN LATERAL ( SELECT array_agg(tp.utilizador_id ORDER BY tp.atribuida_em) AS pessoas
           FROM ops_obra_tarefa_pessoa tp
          WHERE tp.tarefa_id = t.id) p ON true$vw$;
    REVOKE ALL ON public.ops_v_obra_tarefa FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_obra_tarefa TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_obra_tarefa TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_obra_alerta') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_obra_alerta WITH (security_invoker=true) AS
 SELECT id AS tarefa_id,
    organization_id,
    obra_id,
    obra_codigo,
    nome,
    estado,
    minutos_previstos,
    minutos_reais,
    a_correr,
        CASE
            WHEN minutos_reais > minutos_previstos::numeric THEN 'excedido'::text
            ELSE 'aviso'::text
        END AS nivel
   FROM ops_v_obra_tarefa v
  WHERE (estado = ANY (ARRAY['por_fazer'::text, 'em_curso'::text, 'rejeitada'::text])) AND minutos_reais >= (0.8 * minutos_previstos::numeric)$vw$;
    REVOKE ALL ON public.ops_v_obra_alerta FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_obra_alerta TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_obra_alerta TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_obra_conflito') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_obra_conflito AS
 SELECT tp.tarefa_id,
    tp.utilizador_id,
    t.obra_id,
    t.organization_id,
    t2.id AS outra_tarefa_id,
        CASE
            WHEN ops_pode_ver_obra(t2.obra_id) THEN t2.nome
            ELSE 'Tarefa noutra obra'::text
        END AS outra_tarefa,
        CASE
            WHEN ops_pode_ver_obra(t2.obra_id) THEN o2.codigo
            ELSE 'outra obra'::text
        END AS outra_obra,
    t2.inicio_planeado AS outro_inicio,
    t2.fim_planeado AS outro_fim
   FROM ops_obra_tarefa t
     JOIN ops_obra_tarefa_pessoa tp ON tp.tarefa_id = t.id
     JOIN ops_obra_tarefa_pessoa tp2 ON tp2.utilizador_id = tp.utilizador_id AND tp2.obra_id <> t.obra_id
     JOIN ops_obra_tarefa t2 ON t2.id = tp2.tarefa_id
     JOIN ops_obra o2 ON o2.id = t2.obra_id
  WHERE (t.estado = ANY (ARRAY['por_fazer'::text, 'em_curso'::text, 'rejeitada'::text])) AND (t2.estado = ANY (ARRAY['por_fazer'::text, 'em_curso'::text, 'rejeitada'::text])) AND (o2.estado = ANY (ARRAY['planeada'::text, 'em_curso'::text])) AND t.inicio_planeado IS NOT NULL AND t2.inicio_planeado IS NOT NULL AND daterange(t.inicio_planeado, COALESCE(t.fim_planeado, t.inicio_planeado), '[]'::text) && daterange(t2.inicio_planeado, COALESCE(t2.fim_planeado, t2.inicio_planeado), '[]'::text) AND ops_pode_ver_obra(t.obra_id)$vw$;
    REVOKE ALL ON public.ops_v_obra_conflito FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_obra_conflito TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_obra_conflito TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_obra_resumo') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_obra_resumo WITH (security_invoker=true) AS
 SELECT o.id,
    o.organization_id,
    o.codigo,
    o.titulo,
    o.estado,
    o.cliente_id,
    o.orcamento_id,
    o.contrato_id,
    o.modelo_id,
    o.morada,
    o.data_inicio_prevista,
    o.gestor_id,
    o.supervisor_id,
    o.tolerancia_percent,
    o.criada_em,
    COALESCE(x.n_tarefas, 0::bigint)::integer AS n_tarefas,
    COALESCE(x.n_feitas, 0::bigint)::integer AS n_feitas,
    COALESCE(x.n_validadas, 0::bigint)::integer AS n_validadas,
    COALESCE(x.n_por_validar, 0::bigint)::integer AS n_por_validar,
    COALESCE(x.minutos_previstos, 0::bigint)::integer AS minutos_previstos,
    COALESCE(x.minutos_reais, 0::numeric)::numeric(12,1) AS minutos_reais,
    x.inicio_planeado,
    x.fim_planeado,
    COALESCE(e.n_extras, 0::bigint)::integer AS n_extras
   FROM ops_obra o
     LEFT JOIN LATERAL ( SELECT count(*) AS n_tarefas,
            count(*) FILTER (WHERE v.estado = ANY (ARRAY['feita'::text, 'validada'::text])) AS n_feitas,
            count(*) FILTER (WHERE v.estado = 'validada'::text) AS n_validadas,
            count(*) FILTER (WHERE v.estado = 'feita'::text) AS n_por_validar,
            sum(v.minutos_previstos) AS minutos_previstos,
            sum(v.minutos_reais) AS minutos_reais,
            min(v.inicio_planeado) AS inicio_planeado,
            max(v.fim_planeado) AS fim_planeado
           FROM ops_v_obra_tarefa v
          WHERE v.obra_id = o.id) x ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS n_extras
           FROM ops_obra_extra e_1
          WHERE e_1.obra_id = o.id AND (e_1.estado = ANY (ARRAY['registado'::text, 'aprovado'::text]))) e ON true$vw$;
    REVOKE ALL ON public.ops_v_obra_resumo FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_obra_resumo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_obra_resumo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_orcamento') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_orcamento WITH (security_invoker=true) AS
 SELECT id,
    organization_id,
    cliente_id,
    COALESCE(quote_number, '—'::text) AS numero,
    COALESCE(NULLIF(btrim(title), ''::text), 'Sem título'::text) AS titulo,
    obra_endereco,
    estado,
    accepted_at,
    total,
    moeda,
    COALESCE(( SELECT sum((COALESCE(l.custo_material_unit, 0::numeric) + COALESCE(l.custo_mao_obra_unit, 0::numeric)) * COALESCE(l.qt, 1::numeric)) AS sum
           FROM quote_lines l
          WHERE l.quote_id = q.id), 0::numeric)::numeric(12,2) AS custo_previsto,
    (( SELECT count(*) AS count
           FROM quote_lines l
          WHERE l.quote_id = q.id))::integer AS linhas,
    (EXISTS ( SELECT 1
           FROM ops_ordem o
          WHERE o.orcamento_id = q.id)) AS tem_obra
   FROM quotes q
  WHERE deleted_at IS NULL AND (estado = ANY (ARRAY['aceite'::text, 'finalizado'::text]))$vw$;
    REVOKE ALL ON public.ops_v_orcamento FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_orcamento TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_orcamento TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_ordem_custo') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_ordem_custo WITH (security_invoker=true) AS
 SELECT o.id AS ordem_id,
    o.organization_id,
    o.codigo,
    o.titulo,
    o.estado,
    o.orcamento_id,
    p.previsto,
    r.real_material,
    m.real_mao_obra,
    r.real_outros,
    (COALESCE(r.real_material, 0::numeric) + COALESCE(m.real_mao_obra, 0::numeric) + COALESCE(r.real_outros, 0::numeric))::numeric(12,2) AS real_total,
        CASE
            WHEN p.previsto IS NULL THEN NULL::numeric
            ELSE (COALESCE(r.real_material, 0::numeric) + COALESCE(m.real_mao_obra, 0::numeric) + COALESCE(r.real_outros, 0::numeric) - p.previsto)::numeric(12,2)
        END AS desvio,
        CASE
            WHEN p.previsto IS NULL OR p.previsto = 0::numeric THEN NULL::numeric
            ELSE round((COALESCE(r.real_material, 0::numeric) + COALESCE(m.real_mao_obra, 0::numeric) + COALESCE(r.real_outros, 0::numeric) - p.previsto) / p.previsto * 100::numeric, 1)
        END AS desvio_percent,
    COALESCE(v.segundos, 0::bigint) AS segundos_trabalho,
    COALESCE(v.sessoes_abertas, 0) AS sessoes_abertas,
    (o.estado <> ALL (ARRAY['fechada'::text, 'confirmada'::text])) AND COALESCE(v.sessoes_abertas, 0) > 0 AS mao_obra_em_curso,
    COALESCE(v.sem_custo_hora, 0) AS sem_custo_hora
   FROM ops_ordem o
     LEFT JOIN LATERAL ( SELECT sum(x.total_sem_iva)::numeric(12,2) AS previsto
           FROM ops_ordem_previsto x
          WHERE x.ordem_id = o.id) p ON true
     LEFT JOIN LATERAL ( SELECT sum(c.total) FILTER (WHERE c.tipo = 'material'::text)::numeric(12,2) AS real_material,
            sum(c.total) FILTER (WHERE c.tipo = 'mao_obra'::text AND c.origem = 'calculado'::text)::numeric(12,2) AS mao_obra_fecho,
            sum(c.total) FILTER (WHERE c.tipo = 'mao_obra'::text AND c.origem <> 'calculado'::text)::numeric(12,2) AS mao_obra_manual,
            sum(c.total) FILTER (WHERE c.tipo <> ALL (ARRAY['material'::text, 'mao_obra'::text]))::numeric(12,2) AS real_outros
           FROM ops_custo c
          WHERE c.ordem_id = o.id) r ON true
     LEFT JOIN LATERAL ops_mao_obra_viva(o.id) v(segundos, total, sessoes_abertas, sem_custo_hora) ON true
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN (o.estado = ANY (ARRAY['fechada'::text, 'confirmada'::text])) AND r.mao_obra_fecho IS NULL AND r.mao_obra_manual IS NULL THEN NULL::numeric
                    WHEN o.estado = ANY (ARRAY['fechada'::text, 'confirmada'::text]) THEN (COALESCE(r.mao_obra_fecho, 0::numeric) + COALESCE(r.mao_obra_manual, 0::numeric))::numeric(12,2)
                    WHEN COALESCE(v.segundos, 0::bigint) = 0 AND r.mao_obra_manual IS NULL THEN NULL::numeric
                    ELSE (COALESCE(v.total, 0::numeric) + COALESCE(r.mao_obra_manual, 0::numeric))::numeric(12,2)
                END::numeric(12,2) AS real_mao_obra) m ON true
  WHERE (( SELECT auth.uid() AS uid)) IS NULL OR ops_pode(o.organization_id, 'operations.costs.view'::text)$vw$;
    REVOKE ALL ON public.ops_v_ordem_custo FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_ordem_custo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_ordem_custo TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_pessoas') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_pessoas WITH (security_invoker=true) AS
 SELECT u.id AS utilizador_id,
    m.organization_id,
    COALESCE(NULLIF(btrim(u.name), ''::text), u.email, '—'::text) AS nome,
    u.email,
    p.funcao,
    p.ativo,
    p.utilizador_id IS NOT NULL AS em_operacoes
   FROM anew_memberships m
     JOIN anew_users u ON u.id = m.user_id
     LEFT JOIN ops_utilizador_perfil p ON p.utilizador_id = u.id AND p.organization_id = m.organization_id
  WHERE m.status = 'active'::text$vw$;
    REVOKE ALL ON public.ops_v_pessoas FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_pessoas TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_pessoas TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_pmp') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_pmp WITH (security_invoker=true) AS
 SELECT id AS ordem_id,
    organization_id,
    cliente_id,
    codigo,
    titulo,
    plano_id,
    estado,
    agendada_para,
    fechada_em,
    responsavel_id,
    date_trunc('month'::text, agendada_para)::date AS mes,
    estado = ANY (ARRAY['fechada'::text, 'confirmada'::text]) AS cumprida,
    (estado = ANY (ARRAY['fechada'::text, 'confirmada'::text])) AND fechada_em IS NOT NULL AND fechada_em::date <= agendada_para::date AS a_horas,
    (estado <> ALL (ARRAY['fechada'::text, 'confirmada'::text])) AND agendada_para < now() AS em_atraso
   FROM ops_ordem o
  WHERE origem = 'preventiva'::text AND estado <> 'cancelada'::text AND agendada_para IS NOT NULL$vw$;
    REVOKE ALL ON public.ops_v_pmp FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_pmp TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_pmp TO service_role;
  END IF;
END $do$;
DO $do$ BEGIN
  IF to_regclass('public.ops_v_tarefa_tempo') IS NULL THEN
    EXECUTE $vw$CREATE VIEW public.ops_v_tarefa_tempo WITH (security_invoker=true) AS
 SELECT t.id AS ordem_tarefa_id,
    t.ordem_id,
    t.nome,
    t.estado,
    t.tempo_estimado,
    COALESCE(s.segundos, 0::bigint) AS tempo_real,
    COALESCE(s.abertas, 0) > 0 AS a_contar,
    COALESCE(s.quem, ARRAY[]::uuid[]) AS a_contar_por,
        CASE
            WHEN t.tempo_estimado > 0 THEN COALESCE(s.segundos, 0::bigint) - t.tempo_estimado
            ELSE NULL::bigint
        END AS desvio,
    t.inicio,
    t.fim
   FROM ops_ordem_tarefa t
     LEFT JOIN LATERAL ( SELECT sum(GREATEST(EXTRACT(epoch FROM COALESCE(x.fim, now()) - x.inicio), 0::numeric))::bigint AS segundos,
            count(*) FILTER (WHERE x.fim IS NULL)::integer AS abertas,
            array_agg(x.utilizador_id) FILTER (WHERE x.fim IS NULL) AS quem
           FROM ops_sessao_trabalho x
          WHERE x.ordem_tarefa_id = t.id) s ON true$vw$;
    REVOKE ALL ON public.ops_v_tarefa_tempo FROM PUBLIC, anon, authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_tarefa_tempo TO authenticated;
    GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ops_v_tarefa_tempo TO service_role;
  END IF;
END $do$;

-- 6. Gatilhos
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_ativo_historico' AND tgrelid = 'public.ops_ativo'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_ativo_historico AFTER INSERT OR UPDATE ON public.ops_ativo FOR EACH ROW EXECUTE FUNCTION ops_historico_do_ativo()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_evento_relatorio' AND tgrelid = 'public.ops_evento'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_evento_relatorio AFTER INSERT ON public.ops_evento FOR EACH ROW EXECUTE FUNCTION ops_ao_confirmar_ordem()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_obra_tarefa_baseline' AND tgrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_obra_tarefa_baseline BEFORE UPDATE ON public.ops_obra_tarefa FOR EACH ROW EXECUTE FUNCTION ops_obra_tarefa_baseline()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_obra_tarefa_dep_sync' AND tgrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_obra_tarefa_dep_sync AFTER INSERT OR UPDATE OF depende_de ON public.ops_obra_tarefa FOR EACH ROW EXECUTE FUNCTION ops_obra_tarefa_dep_sync()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_obra_tarefa_rever_bancada_ins' AND tgrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_obra_tarefa_rever_bancada_ins AFTER INSERT ON public.ops_obra_tarefa REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION ops_obra_tg_rever_bancada()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_obra_tarefa_rever_bancada_upd' AND tgrelid = 'public.ops_obra_tarefa'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_obra_tarefa_rever_bancada_upd AFTER UPDATE ON public.ops_obra_tarefa REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION ops_obra_tg_rever_bancada()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_obra_dependencia_guarda' AND tgrelid = 'public.ops_obra_tarefa_dependencia'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_obra_dependencia_guarda BEFORE INSERT OR UPDATE ON public.ops_obra_tarefa_dependencia FOR EACH ROW EXECUTE FUNCTION ops_obra_dependencia_guarda()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_obra_tarefa_pessoa_avisar' AND tgrelid = 'public.ops_obra_tarefa_pessoa'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_obra_tarefa_pessoa_avisar AFTER INSERT ON public.ops_obra_tarefa_pessoa REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION ops_obra_tg_avisar_atribuicao()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_ordem_guarda_estado' AND tgrelid = 'public.ops_ordem'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_ordem_guarda_estado BEFORE UPDATE ON public.ops_ordem FOR EACH ROW EXECUTE FUNCTION ops_guarda_estado()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_alvo_herda_centro_custo' AND tgrelid = 'public.ops_ordem_alvo'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_alvo_herda_centro_custo AFTER INSERT ON public.ops_ordem_alvo FOR EACH ROW EXECUTE FUNCTION ops_herdar_centro_custo()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_tarefa_guarda_estado' AND tgrelid = 'public.ops_ordem_tarefa'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_tarefa_guarda_estado BEFORE UPDATE ON public.ops_ordem_tarefa FOR EACH ROW EXECUTE FUNCTION ops_guarda_tarefa()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_tarefa_tempo_antes' AND tgrelid = 'public.ops_ordem_tarefa'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_tarefa_tempo_antes BEFORE UPDATE ON public.ops_ordem_tarefa FOR EACH ROW EXECUTE FUNCTION ops_tarefa_tempo_antes()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_tarefa_tempo_depois' AND tgrelid = 'public.ops_ordem_tarefa'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_tarefa_tempo_depois AFTER UPDATE ON public.ops_ordem_tarefa FOR EACH ROW EXECUTE FUNCTION ops_tarefa_tempo_depois()';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_medicao_guarda' AND tgrelid = 'public.ops_ordem_tarefa_medicao'::regclass) THEN
    EXECUTE 'CREATE TRIGGER ops_medicao_guarda BEFORE INSERT OR UPDATE ON public.ops_ordem_tarefa_medicao FOR EACH ROW EXECUTE FUNCTION ops_guarda_medicao()';
  END IF;
END $do$;

-- 7. Políticas
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_anexo' AND policyname = 'ops_anexo_select') THEN
    EXECUTE 'CREATE POLICY "ops_anexo_select" ON public.ops_anexo AS PERMISSIVE FOR SELECT TO authenticated USING ((ops_pode(organization_id, ''operations.view''::text) AND ((ordem_id IS NULL) OR ops_pode_ver_ordem(( SELECT auth.uid() AS uid), ordem_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_anexo' AND policyname = 'ops_anexo_write') THEN
    EXECUTE 'CREATE POLICY "ops_anexo_write" ON public.ops_anexo AS PERMISSIVE FOR ALL TO authenticated USING (ops_pode(organization_id, ''operations.orders.execute''::text)) WITH CHECK (ops_pode(organization_id, ''operations.orders.execute''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_area' AND policyname = 'ops_area_ler') THEN
    EXECUTE 'CREATE POLICY "ops_area_ler" ON public.ops_area AS PERMISSIVE FOR SELECT TO authenticated USING ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_area_tipo' AND policyname = 'ops_area_tipo_ler') THEN
    EXECUTE 'CREATE POLICY "ops_area_tipo_ler" ON public.ops_area_tipo AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_area a
  WHERE ((a.id = ops_area_tipo.area_id) AND (a.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_assinatura' AND policyname = 'ops_assinatura_escrever') THEN
    EXECUTE 'CREATE POLICY "ops_assinatura_escrever" ON public.ops_assinatura AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false)';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_assinatura' AND policyname = 'ops_assinatura_ler') THEN
    EXECUTE 'CREATE POLICY "ops_assinatura_ler" ON public.ops_assinatura AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode_ver_ordem(auth.uid(), ordem_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ativo' AND policyname = 'ops_ativo_select') THEN
    EXECUTE 'CREATE POLICY "ops_ativo_select" ON public.ops_ativo AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.locations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ativo' AND policyname = 'ops_ativo_write') THEN
    EXECUTE 'CREATE POLICY "ops_ativo_write" ON public.ops_ativo AS PERMISSIVE FOR ALL TO authenticated USING (ops_pode(organization_id, ''operations.locations.manage''::text)) WITH CHECK (ops_pode(organization_id, ''operations.locations.manage''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_categoria_ativo' AND policyname = 'ops_categoria_ativo_select') THEN
    EXECUTE 'CREATE POLICY "ops_categoria_ativo_select" ON public.ops_categoria_ativo AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.locations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_categoria_ativo' AND policyname = 'ops_categoria_ativo_write') THEN
    EXECUTE 'CREATE POLICY "ops_categoria_ativo_write" ON public.ops_categoria_ativo AS PERMISSIVE FOR ALL TO authenticated USING (ops_pode(organization_id, ''operations.locations.manage''::text)) WITH CHECK (ops_pode(organization_id, ''operations.locations.manage''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_centro_custo' AND policyname = 'ops_centro_custo_ler') THEN
    EXECUTE 'CREATE POLICY "ops_centro_custo_ler" ON public.ops_centro_custo AS PERMISSIVE FOR SELECT TO authenticated USING ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_checklist' AND policyname = 'ops_checklist_select') THEN
    EXECUTE 'CREATE POLICY "ops_checklist_select" ON public.ops_checklist AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_checklist' AND policyname = 'ops_checklist_write') THEN
    EXECUTE 'CREATE POLICY "ops_checklist_write" ON public.ops_checklist AS PERMISSIVE FOR ALL TO authenticated USING (ops_pode(organization_id, ''operations.checklists.manage''::text)) WITH CHECK (ops_pode(organization_id, ''operations.checklists.manage''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_checklist_tarefa' AND policyname = 'ops_checklist_tarefa_select') THEN
    EXECUTE 'CREATE POLICY "ops_checklist_tarefa_select" ON public.ops_checklist_tarefa AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_checklist c
  WHERE (c.id = ops_checklist_tarefa.checklist_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_checklist_tarefa' AND policyname = 'ops_checklist_tarefa_write') THEN
    EXECUTE 'CREATE POLICY "ops_checklist_tarefa_write" ON public.ops_checklist_tarefa AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_checklist c
  WHERE ((c.id = ops_checklist_tarefa.checklist_id) AND ops_pode(c.organization_id, ''operations.checklists.manage''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_checklist c
  WHERE ((c.id = ops_checklist_tarefa.checklist_id) AND ops_pode(c.organization_id, ''operations.checklists.manage''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_checklist_tarefa_medicao' AND policyname = 'ops_checklist_tarefa_medicao_select') THEN
    EXECUTE 'CREATE POLICY "ops_checklist_tarefa_medicao_select" ON public.ops_checklist_tarefa_medicao AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_checklist_tarefa ct
  WHERE (ct.id = ops_checklist_tarefa_medicao.checklist_tarefa_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_checklist_tarefa_medicao' AND policyname = 'ops_checklist_tarefa_medicao_write') THEN
    EXECUTE 'CREATE POLICY "ops_checklist_tarefa_medicao_write" ON public.ops_checklist_tarefa_medicao AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM (ops_checklist_tarefa ct
     JOIN ops_checklist c ON ((c.id = ct.checklist_id)))
  WHERE ((ct.id = ops_checklist_tarefa_medicao.checklist_tarefa_id) AND ops_pode(c.organization_id, ''operations.checklists.manage''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (ops_checklist_tarefa ct
     JOIN ops_checklist c ON ((c.id = ct.checklist_id)))
  WHERE ((ct.id = ops_checklist_tarefa_medicao.checklist_tarefa_id) AND ops_pode(c.organization_id, ''operations.checklists.manage''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_custo' AND policyname = 'ops_custo_select') THEN
    EXECUTE 'CREATE POLICY "ops_custo_select" ON public.ops_custo AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_custo.ordem_id) AND ops_pode(o.organization_id, ''operations.costs.view''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_custo' AND policyname = 'ops_custo_write') THEN
    EXECUTE 'CREATE POLICY "ops_custo_write" ON public.ops_custo AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_custo.ordem_id) AND ops_pode(o.organization_id, ''operations.costs.view''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_custo.ordem_id) AND ops_pode(o.organization_id, ''operations.costs.view''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_definicao' AND policyname = 'ops_definicao_ler') THEN
    EXECUTE 'CREATE POLICY "ops_definicao_ler" ON public.ops_definicao AS PERMISSIVE FOR SELECT TO authenticated USING ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_entrar_como_log' AND policyname = 'ops_entrar_como_log_ler') THEN
    EXECUTE 'CREATE POLICY "ops_entrar_como_log_ler" ON public.ops_entrar_como_log AS PERMISSIVE FOR SELECT TO authenticated USING ((ops_funcao_atual(organization_id) = ''admin''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_evento' AND policyname = 'ops_evento_select') THEN
    EXECUTE 'CREATE POLICY "ops_evento_select" ON public.ops_evento AS PERMISSIVE FOR SELECT TO authenticated USING ((ops_pode(organization_id, ''operations.view''::text) AND ((entidade <> ALL (ARRAY[''ordem''::text, ''tarefa''::text])) OR ((entidade = ''ordem''::text) AND ops_pode_ver_ordem(( SELECT auth.uid() AS uid), entidade_id)) OR ((entidade = ''tarefa''::text) AND (EXISTS ( SELECT 1
   FROM ops_ordem_tarefa t
  WHERE (t.id = ops_evento.entidade_id)))))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_evento' AND policyname = 'ops_evento_write') THEN
    EXECUTE 'CREATE POLICY "ops_evento_write" ON public.ops_evento AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((ops_pode(organization_id, ''operations.view''::text) AND (autor_id = current_business_user_id())))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_horario' AND policyname = 'ops_horario_select') THEN
    EXECUTE 'CREATE POLICY "ops_horario_select" ON public.ops_horario AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_horario' AND policyname = 'ops_horario_write') THEN
    EXECUTE 'CREATE POLICY "ops_horario_write" ON public.ops_horario AS PERMISSIVE FOR ALL TO authenticated USING (ops_pode(organization_id, ''operations.settings.manage''::text)) WITH CHECK (ops_pode(organization_id, ''operations.settings.manage''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_local' AND policyname = 'ops_local_select') THEN
    EXECUTE 'CREATE POLICY "ops_local_select" ON public.ops_local AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.locations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_local' AND policyname = 'ops_local_write') THEN
    EXECUTE 'CREATE POLICY "ops_local_write" ON public.ops_local AS PERMISSIVE FOR ALL TO authenticated USING (ops_pode(organization_id, ''operations.locations.manage''::text)) WITH CHECK (ops_pode(organization_id, ''operations.locations.manage''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_medicao_def' AND policyname = 'ops_medicao_def_select') THEN
    EXECUTE 'CREATE POLICY "ops_medicao_def_select" ON public.ops_medicao_def AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_medicao_def' AND policyname = 'ops_medicao_def_write') THEN
    EXECUTE 'CREATE POLICY "ops_medicao_def_write" ON public.ops_medicao_def AS PERMISSIVE FOR ALL TO authenticated USING ((ops_pode(organization_id, ''operations.checklists.manage''::text) OR ops_pode(organization_id, ''operations.settings.manage''::text))) WITH CHECK ((ops_pode(organization_id, ''operations.checklists.manage''::text) OR ops_pode(organization_id, ''operations.settings.manage''::text)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_medicao_opcao' AND policyname = 'ops_medicao_opcao_select') THEN
    EXECUTE 'CREATE POLICY "ops_medicao_opcao_select" ON public.ops_medicao_opcao AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_medicao_def d
  WHERE (d.id = ops_medicao_opcao.medicao_def_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_medicao_opcao' AND policyname = 'ops_medicao_opcao_write') THEN
    EXECUTE 'CREATE POLICY "ops_medicao_opcao_write" ON public.ops_medicao_opcao AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_medicao_def d
  WHERE ((d.id = ops_medicao_opcao.medicao_def_id) AND (ops_pode(d.organization_id, ''operations.checklists.manage''::text) OR ops_pode(d.organization_id, ''operations.settings.manage''::text)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_medicao_def d
  WHERE ((d.id = ops_medicao_opcao.medicao_def_id) AND (ops_pode(d.organization_id, ''operations.checklists.manage''::text) OR ops_pode(d.organization_id, ''operations.settings.manage''::text))))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_mensagem' AND policyname = 'ops_mensagem_escrever') THEN
    EXECUTE 'CREATE POLICY "ops_mensagem_escrever" ON public.ops_mensagem AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((canal = ''interno''::text) AND (EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_mensagem.ordem_id) AND (o.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_mensagem' AND policyname = 'ops_mensagem_ler') THEN
    EXECUTE 'CREATE POLICY "ops_mensagem_ler" ON public.ops_mensagem AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_mensagem.ordem_id) AND (is_system_admin_user(( SELECT auth.uid() AS uid)) OR (o.organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_mensagem' AND policyname = 'ops_mensagem_select') THEN
    EXECUTE 'CREATE POLICY "ops_mensagem_select" ON public.ops_mensagem AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE (o.id = ops_mensagem.ordem_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_mensagem' AND policyname = 'ops_mensagem_write') THEN
    EXECUTE 'CREATE POLICY "ops_mensagem_write" ON public.ops_mensagem AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_mensagem.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_mensagem.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_motivo_pausa' AND policyname = 'ops_motivo_pausa_ler') THEN
    EXECUTE 'CREATE POLICY "ops_motivo_pausa_ler" ON public.ops_motivo_pausa AS PERMISSIVE FOR SELECT TO authenticated USING ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra' AND policyname = 'ops_obra_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_select" ON public.ops_obra AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode_ver_obra(id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_aviso' AND policyname = 'ops_obra_aviso_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_aviso_select" ON public.ops_obra_aviso AS PERMISSIVE FOR SELECT TO authenticated USING ((obra_id IN ( SELECT ops_obras_que_vejo() AS ops_obras_que_vejo)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_extra' AND policyname = 'ops_obra_extra_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_extra_select" ON public.ops_obra_extra AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode_ver_obra(obra_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_fase' AND policyname = 'ops_obra_fase_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_fase_select" ON public.ops_obra_fase AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode_ver_obra(obra_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_modelo' AND policyname = 'ops_obra_modelo_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_modelo_select" ON public.ops_obra_modelo AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_modelo_fase' AND policyname = 'ops_obra_modelo_fase_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_modelo_fase_select" ON public.ops_obra_modelo_fase AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_modelo_tarefa' AND policyname = 'ops_obra_modelo_tarefa_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_modelo_tarefa_select" ON public.ops_obra_modelo_tarefa AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_registo' AND policyname = 'ops_obra_registo_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_registo_select" ON public.ops_obra_registo AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode_ver_obra(obra_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_ritmo' AND policyname = 'ops_obra_ritmo_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_ritmo_select" ON public.ops_obra_ritmo AS PERMISSIVE FOR SELECT TO authenticated USING (ops_obra_pode_ver_modelos(organization_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_ritmo_historico' AND policyname = 'ops_obra_ritmo_historico_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_ritmo_historico_select" ON public.ops_obra_ritmo_historico AS PERMISSIVE FOR SELECT TO authenticated USING (ops_obra_pode_ver_modelos(organization_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_servico_perfil' AND policyname = 'ops_obra_servico_perfil_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_servico_perfil_select" ON public.ops_obra_servico_perfil AS PERMISSIVE FOR SELECT TO authenticated USING (ops_obra_pode_ver_modelos(organization_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_servico_tarefa' AND policyname = 'ops_obra_servico_tarefa_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_servico_tarefa_select" ON public.ops_obra_servico_tarefa AS PERMISSIVE FOR SELECT TO authenticated USING (ops_obra_pode_ver_modelos(organization_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_tarefa' AND policyname = 'ops_obra_tarefa_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_tarefa_select" ON public.ops_obra_tarefa AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode_ver_obra(obra_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_tarefa_atraso' AND policyname = 'ops_obra_tarefa_atraso_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_tarefa_atraso_select" ON public.ops_obra_tarefa_atraso AS PERMISSIVE FOR SELECT TO authenticated USING ((obra_id IN ( SELECT ops_obras_que_vejo() AS ops_obras_que_vejo)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_tarefa_dependencia' AND policyname = 'ops_obra_tarefa_dependencia_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_tarefa_dependencia_select" ON public.ops_obra_tarefa_dependencia AS PERMISSIVE FOR SELECT TO authenticated USING ((obra_id IN ( SELECT ops_obras_que_vejo() AS ops_obras_que_vejo)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_tarefa_foto' AND policyname = 'ops_obra_tarefa_foto_ler') THEN
    EXECUTE 'CREATE POLICY "ops_obra_tarefa_foto_ler" ON public.ops_obra_tarefa_foto AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode_ver_obra(obra_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_obra_tarefa_pessoa' AND policyname = 'ops_obra_tarefa_pessoa_select') THEN
    EXECUTE 'CREATE POLICY "ops_obra_tarefa_pessoa_select" ON public.ops_obra_tarefa_pessoa AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode_ver_obra(obra_id))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem' AND policyname = 'ops_ordem_delete') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_delete" ON public.ops_ordem AS PERMISSIVE FOR DELETE TO authenticated USING (ops_pode(organization_id, ''operations.orders.cancel''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem' AND policyname = 'ops_ordem_insert') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_insert" ON public.ops_ordem AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (ops_pode(organization_id, ''operations.orders.create''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem' AND policyname = 'ops_ordem_select') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_select" ON public.ops_ordem AS PERMISSIVE FOR SELECT TO authenticated USING ((ops_pode(organization_id, ''operations.orders.view''::text) AND ops_pode_ver_ordem(( SELECT auth.uid() AS uid), id)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem' AND policyname = 'ops_ordem_update') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_update" ON public.ops_ordem AS PERMISSIVE FOR UPDATE TO authenticated USING (((ops_pode(organization_id, ''operations.orders.edit''::text) OR ops_pode(organization_id, ''operations.orders.execute''::text)) AND ops_pode_ver_ordem(( SELECT auth.uid() AS uid), id))) WITH CHECK ((ops_pode(organization_id, ''operations.orders.edit''::text) OR ops_pode(organization_id, ''operations.orders.execute''::text)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_alvo' AND policyname = 'ops_ordem_alvo_select') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_alvo_select" ON public.ops_ordem_alvo AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE (o.id = ops_ordem_alvo.ordem_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_alvo' AND policyname = 'ops_ordem_alvo_write') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_alvo_write" ON public.ops_ordem_alvo AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_alvo.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_alvo.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_pessoa' AND policyname = 'ops_ordem_pessoa_select') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_pessoa_select" ON public.ops_ordem_pessoa AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE (o.id = ops_ordem_pessoa.ordem_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_pessoa' AND policyname = 'ops_ordem_pessoa_write') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_pessoa_write" ON public.ops_ordem_pessoa AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_pessoa.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_pessoa.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_previsto' AND policyname = 'ops_ordem_previsto_delete') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_previsto_delete" ON public.ops_ordem_previsto AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_previsto.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.edit''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_previsto' AND policyname = 'ops_ordem_previsto_insert') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_previsto_insert" ON public.ops_ordem_previsto AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_previsto.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.edit''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_previsto' AND policyname = 'ops_ordem_previsto_select') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_previsto_select" ON public.ops_ordem_previsto AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_previsto.ordem_id) AND ops_pode(o.organization_id, ''operations.costs.view''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_previsto' AND policyname = 'ops_ordem_previsto_update') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_previsto_update" ON public.ops_ordem_previsto AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_previsto.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.edit''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_previsto.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.edit''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_tarefa' AND policyname = 'ops_ordem_tarefa_select') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_tarefa_select" ON public.ops_ordem_tarefa AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE (o.id = ops_ordem_tarefa.ordem_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_tarefa' AND policyname = 'ops_ordem_tarefa_write') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_tarefa_write" ON public.ops_ordem_tarefa AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_tarefa.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_ordem_tarefa.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_tarefa_medicao' AND policyname = 'ops_ordem_tarefa_medicao_select') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_tarefa_medicao_select" ON public.ops_ordem_tarefa_medicao AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem_tarefa t
  WHERE (t.id = ops_ordem_tarefa_medicao.ordem_tarefa_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_ordem_tarefa_medicao' AND policyname = 'ops_ordem_tarefa_medicao_write') THEN
    EXECUTE 'CREATE POLICY "ops_ordem_tarefa_medicao_write" ON public.ops_ordem_tarefa_medicao AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM (ops_ordem_tarefa t
     JOIN ops_ordem o ON ((o.id = t.ordem_id)))
  WHERE ((t.id = ops_ordem_tarefa_medicao.ordem_tarefa_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (ops_ordem_tarefa t
     JOIN ops_ordem o ON ((o.id = t.ordem_id)))
  WHERE ((t.id = ops_ordem_tarefa_medicao.ordem_tarefa_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_plano' AND policyname = 'ops_plano_select') THEN
    EXECUTE 'CREATE POLICY "ops_plano_select" ON public.ops_plano AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_plano' AND policyname = 'ops_plano_write') THEN
    EXECUTE 'CREATE POLICY "ops_plano_write" ON public.ops_plano AS PERMISSIVE FOR ALL TO authenticated USING (ops_pode(organization_id, ''operations.plans.manage''::text)) WITH CHECK (ops_pode(organization_id, ''operations.plans.manage''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_plano_alvo' AND policyname = 'ops_plano_alvo_select') THEN
    EXECUTE 'CREATE POLICY "ops_plano_alvo_select" ON public.ops_plano_alvo AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_plano p
  WHERE (p.id = ops_plano_alvo.plano_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_plano_alvo' AND policyname = 'ops_plano_alvo_write') THEN
    EXECUTE 'CREATE POLICY "ops_plano_alvo_write" ON public.ops_plano_alvo AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_plano p
  WHERE ((p.id = ops_plano_alvo.plano_id) AND ops_pode(p.organization_id, ''operations.plans.manage''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_plano p
  WHERE ((p.id = ops_plano_alvo.plano_id) AND ops_pode(p.organization_id, ''operations.plans.manage''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_rotulo' AND policyname = 'ops_rotulo_ler') THEN
    EXECUTE 'CREATE POLICY "ops_rotulo_ler" ON public.ops_rotulo AS PERMISSIVE FOR SELECT TO authenticated USING ((is_system_admin_user(( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_sessao_trabalho' AND policyname = 'ops_sessao_trabalho_select') THEN
    EXECUTE 'CREATE POLICY "ops_sessao_trabalho_select" ON public.ops_sessao_trabalho AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE (o.id = ops_sessao_trabalho.ordem_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_sessao_trabalho' AND policyname = 'ops_sessao_trabalho_write') THEN
    EXECUTE 'CREATE POLICY "ops_sessao_trabalho_write" ON public.ops_sessao_trabalho AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_sessao_trabalho.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_ordem o
  WHERE ((o.id = ops_sessao_trabalho.ordem_id) AND ops_pode(o.organization_id, ''operations.orders.execute''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_skill' AND policyname = 'ops_skill_select') THEN
    EXECUTE 'CREATE POLICY "ops_skill_select" ON public.ops_skill AS PERMISSIVE FOR SELECT TO authenticated USING (ops_pode(organization_id, ''operations.view''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_skill' AND policyname = 'ops_skill_write') THEN
    EXECUTE 'CREATE POLICY "ops_skill_write" ON public.ops_skill AS PERMISSIVE FOR ALL TO authenticated USING (ops_pode(organization_id, ''operations.settings.manage''::text)) WITH CHECK (ops_pode(organization_id, ''operations.settings.manage''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_tipo_trabalho' AND policyname = 'ops_tipo_trabalho_ler') THEN
    EXECUTE 'CREATE POLICY "ops_tipo_trabalho_ler" ON public.ops_tipo_trabalho AS PERMISSIVE FOR SELECT TO authenticated USING ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_utilizador_cliente' AND policyname = 'ops_utilizador_cliente_select') THEN
    EXECUTE 'CREATE POLICY "ops_utilizador_cliente_select" ON public.ops_utilizador_cliente AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM anew_clients c
  WHERE ((c.id = ops_utilizador_cliente.cliente_id) AND ops_pode(c.organization_id, ''operations.view''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_utilizador_cliente' AND policyname = 'ops_utilizador_cliente_write') THEN
    EXECUTE 'CREATE POLICY "ops_utilizador_cliente_write" ON public.ops_utilizador_cliente AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM anew_clients c
  WHERE ((c.id = ops_utilizador_cliente.cliente_id) AND ops_pode(c.organization_id, ''operations.settings.manage''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM anew_clients c
  WHERE ((c.id = ops_utilizador_cliente.cliente_id) AND ops_pode(c.organization_id, ''operations.settings.manage''::text)))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_utilizador_perfil' AND policyname = 'ops_utilizador_perfil_select') THEN
    EXECUTE 'CREATE POLICY "ops_utilizador_perfil_select" ON public.ops_utilizador_perfil AS PERMISSIVE FOR SELECT TO authenticated USING ((ops_pode(organization_id, ''operations.costs.view''::text) OR ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (utilizador_id = current_business_user_id()))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_utilizador_perfil' AND policyname = 'ops_utilizador_perfil_write') THEN
    EXECUTE 'CREATE POLICY "ops_utilizador_perfil_write" ON public.ops_utilizador_perfil AS PERMISSIVE FOR ALL TO authenticated USING (ops_pode(organization_id, ''operations.settings.manage''::text)) WITH CHECK (ops_pode(organization_id, ''operations.settings.manage''::text))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_utilizador_skill' AND policyname = 'ops_utilizador_skill_select') THEN
    EXECUTE 'CREATE POLICY "ops_utilizador_skill_select" ON public.ops_utilizador_skill AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_skill s
  WHERE (s.id = ops_utilizador_skill.skill_id))))';
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_utilizador_skill' AND policyname = 'ops_utilizador_skill_write') THEN
    EXECUTE 'CREATE POLICY "ops_utilizador_skill_write" ON public.ops_utilizador_skill AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM ops_skill s
  WHERE ((s.id = ops_utilizador_skill.skill_id) AND ops_pode(s.organization_id, ''operations.settings.manage''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ops_skill s
  WHERE ((s.id = ops_utilizador_skill.skill_id) AND ops_pode(s.organization_id, ''operations.settings.manage''::text)))))';
  END IF;
END $do$;

RESET check_function_bodies;
RESET lock_timeout;
