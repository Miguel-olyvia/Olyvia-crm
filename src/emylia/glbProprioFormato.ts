// O que é um GLB próprio na base e no storage, sem dependências (usam-no as leituras de gestão, os dados e o 3D): o bucket, o formato do caminho e o tamanho. O contrato é o da
// migration 20270130420000 (CHECK product_categories_glb_caminho_check / product_models_glb_caminho_check e *_glb_bytes_check).

/** O bucket público (caminho `{org}/{uuid}.glb`, uuid impossível de adivinhar), 5 MB, só `model/gltf-binary`. */
export const BUCKET_MODELOS_3D = "catalogo-modelos3d";
export const TIPO_GLB = "model/gltf-binary";
/** A base aceita de 12 bytes (o cabeçalho) a 5 MB. */
export const MIN_BYTES_GLB = 12, MAX_BYTES_GLB = 5_242_880;

/** O formato do caminho no bucket (o mesmo regex do CHECK da base: `{uuid}/{uuid}.glb`). */
export const CAMINHO_GLB = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.glb$/;

/** O caminho de uma leitura da base: o texto se tiver o formato, senão null (a chave em falta — migration por aplicar — também é null). */
export const glbDeLeitura = (v: unknown): string | null => (typeof v === "string" && CAMINHO_GLB.test(v) ? v : null);
/** O tamanho de uma leitura da base: o inteiro se estiver entre 12 B e 5 MB, senão null. */
export const bytesDeGlbDeLeitura = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= MIN_BYTES_GLB && v <= MAX_BYTES_GLB ? v : null);
