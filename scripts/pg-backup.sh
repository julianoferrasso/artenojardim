#!/bin/bash
#
# Backup diário do banco artenojardim. Instalado na VPS em /usr/local/bin/ e
# disparado por cron. Versionado aqui para o script ter dono e histórico.
#
# Decisões:
#  - roda como usuário `postgres` (peer auth) — sem senha em arquivo.
#  - formato custom (-Fc): comprimido, e restaura seletivo com pg_restore.
#  - só o banco artenojardim: NUNCA toca rag_sefaz (outro projeto na mesma VPS).
#  - retenção de 14 dias: um erro percebido numa sexta ainda tem backup de 2
#    semanas atrás. 14 dumps de ~2 MB é ruído no disco.
#  - falha faz BARULHO: sai com código != 0 e o cron manda e-mail ao root.

set -euo pipefail

DB="artenojardim"
DIR="/var/backups/artenojardim"
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$DIR/${DB}-${STAMP}.dump"
RETENTION_DAYS=14

mkdir -p "$DIR"
chmod 700 "$DIR" # o dump tem dados de cliente; só o root lê

# -Fc custom, comprimido. O `sudo -u postgres` usa peer auth (sem senha).
sudo -u postgres pg_dump -Fc "$DB" > "$FILE"

# Um dump de 0 byte é um backup que não existe. Falha alto se for vazio.
if [ ! -s "$FILE" ]; then
  echo "ERRO: dump vazio ($FILE)" >&2
  rm -f "$FILE"
  exit 1
fi

# Verifica que o pg_restore consegue LER o header — pega dump corrompido antes
# de ele virar o único backup restante.
if ! sudo -u postgres pg_restore --list "$FILE" >/dev/null 2>&1; then
  echo "ERRO: dump ilegível pelo pg_restore ($FILE)" >&2
  exit 1
fi

chmod 600 "$FILE"

# Remove dumps mais velhos que a retenção. -mtime +N = mais de N dias.
find "$DIR" -name "${DB}-*.dump" -type f -mtime +$RETENTION_DAYS -delete

echo "OK: $FILE ($(du -h "$FILE" | cut -f1)), $(ls "$DIR"/${DB}-*.dump | wc -l) backups retidos"
