-- Fotos do produto (até 4, limite imposto na interface).
--
-- Porquê `text[]` e não uma tabela `product_images`: para um máximo de quatro
-- URLs, uma tabela obrigaria a políticas RLS próprias, junções na listagem e
-- um segundo conjunto de escritas na criação/edição. O array vive na linha do
-- produto, é devolvido pelo `select("*")` que a listagem já faz, e a ordem do
-- array é a ordem de apresentação.
--
-- O limite de 4 fica DELIBERADAMENTE fora da base de dados: assim passar para
-- 6 amanhã é uma alteração de frontend e não outra migração.
--
-- Os ficheiros são carregados para o bucket `media` pelo caminho habitual
-- (upload para `media-quarantine` -> edge function `validate-upload` -> bucket
-- final), o mesmo que a Galeria e os logótipos já usam. Aqui só se guarda o
-- URL público resultante.
--
-- Nome alinhado com o que já existe em `bundles.image_url` e
-- `product_categories.image_url`.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_urls text[];

COMMENT ON COLUMN public.products.image_urls IS
  'URLs públicos das fotos do produto, no bucket media. Ordem do array = ordem de apresentação. Máximo de 4 imposto na interface, não na base de dados.';
