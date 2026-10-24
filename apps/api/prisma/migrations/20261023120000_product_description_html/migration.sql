-- A descrição do produto passou a ser HTML (editor de texto rico no admin).
-- Converte o texto puro que já existia: escapa & < >, linha em branco vira
-- parágrafo, quebra simples vira <br>. Só mexe no que não começa com tag, então
-- rodar de novo não estraga nada.

UPDATE "Product"
SET "description" = NULL
WHERE "description" IS NOT NULL AND btrim("description", E' \t\r\n') = '';

UPDATE "Product"
SET "description" = '<p>' || replace(
    regexp_replace(
      replace(replace(replace(
        btrim(replace("description", E'\r\n', E'\n'), E' \t\n'),
        '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      E'\n[ \t]*\n[ \t\n]*', '</p><p>', 'g'),
    E'\n', '<br>') || '</p>'
WHERE "description" IS NOT NULL AND "description" !~ '^\s*<';
