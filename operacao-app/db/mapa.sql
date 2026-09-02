-- ============================================================
--  Operações — onde fica, no mapa
-- ============================================================
--  Correr DEPOIS de: schema.sql.
--
--  Um local tem morada escrita, e uma morada escrita não leva ninguém a lado
--  nenhum. Com coordenadas, o técnico abre a navegação no telemóvel e vai — e
--  um dia dá para ordenar o dia por proximidade, que é a coisa que quem
--  coordena mais pede a seguir.
--
--  **Sem serviço nenhum de fora.** Não há chave, não há API, não há custo.
--  As coordenadas entram por dois caminhos que não custam nada:
--
--    · o técnico está no local e carrega em "marcar aqui" (o GPS do telemóvel);
--    · alguém procura no Google Maps, copia o link e cola-o.
--
--  A precisão é a mesma que o CRM já usa em `schedule_items.location_lat`,
--  de propósito: são a mesma grandeza, e uma diferença de casas decimais entre
--  as duas metades do sistema só daria trabalho a quem um dia as cruzar.
--
--  Escreve fora de `ops_*`? NÃO.
-- ============================================================

BEGIN;

DO $requisitos$
BEGIN
  IF to_regclass('public.ops_local') IS NULL THEN
    RAISE EXCEPTION 'Falta db/schema.sql. Corre-o primeiro.';
  END IF;
END
$requisitos$;


-- ============================================================
-- 1. As coordenadas
-- ============================================================
-- Nulas enquanto ninguém as marcar. Um local sem coordenadas continua a
-- funcionar em tudo — só não abre a navegação.

ALTER TABLE public.ops_local
  ADD COLUMN IF NOT EXISTS latitude  numeric(10,8),
  ADD COLUMN IF NOT EXISTS longitude numeric(11,8);

-- Uma latitude de 412 não é um sítio. Sem esta guarda, um erro a colar um
-- link punha o técnico a conduzir para o meio do nada — e o mapa nem dava
-- erro, desenhava o pin onde calhasse.
DO $limites$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ops_local_coordenadas_validas'
  ) THEN
    ALTER TABLE public.ops_local
      ADD CONSTRAINT ops_local_coordenadas_validas CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude IS NOT NULL AND longitude IS NOT NULL
            AND latitude  BETWEEN -90  AND 90
            AND longitude BETWEEN -180 AND 180)
      );
  END IF;
END
$limites$;

COMMENT ON COLUMN public.ops_local.latitude IS
  'Nula até alguém marcar. Vem do GPS do telemóvel ou de um link do Maps colado.';
COMMENT ON COLUMN public.ops_local.longitude IS
  'Sempre preenchida junto com a latitude — meia coordenada não é um sítio.';


-- ============================================================
-- 2. Verificação
-- ============================================================

DO $verificar$
DECLARE
  v integer;
BEGIN
  SELECT count(*) INTO v FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ops_local'
     AND column_name IN ('latitude', 'longitude');

  IF v <> 2 THEN
    RAISE EXCEPTION 'As colunas de coordenadas não ficaram criadas (encontradas %).', v;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ops_local_coordenadas_validas'
  ) THEN
    RAISE EXCEPTION 'A guarda dos limites das coordenadas não ficou criada.';
  END IF;

  RAISE NOTICE 'Operações: os locais passam a poder ter coordenadas.';
END
$verificar$;

COMMIT;
