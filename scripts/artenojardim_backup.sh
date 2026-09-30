#!/bin/bash
# Backup diario do banco `artenojardim`. Local, 14 dias de retencao.
# Espelho do financee_backup.sh -- independente do pg_backup do placeadmin.
# Falha de verdade: nenhum `|| true`, e o exit code do pg_dump e lido sem pipe.
set -uo pipefail
DIR=/var/backups/artenojardim
KEEP_DAYS=14
TS=$(date -u +%Y%m%d-%H%M%S)
OUT="$DIR/artenojardim-$TS.dump"
install -d -m 700 "$DIR"
sudo -u postgres pg_dump -Fc -Z6 -d artenojardim > "$OUT.partial"; RC=$?
if [ "$RC" -ne 0 ]; then echo "pg_dump falhou (rc=$RC)" >&2; rm -f "$OUT.partial"; exit 1; fi
SIZE=$(stat -c %s "$OUT.partial")
if [ "$SIZE" -lt 10000 ]; then echo "dump pequeno demais ($SIZE bytes)" >&2; exit 1; fi
pg_restore --list "$OUT.partial" > "$DIR/.list.tmp"; RC=$?
ENTRIES=$(wc -l < "$DIR/.list.tmp"); rm -f "$DIR/.list.tmp"
if [ "$RC" -ne 0 ] || [ "$ENTRIES" -lt 100 ]; then echo "pg_restore --list falhou (rc=$RC, entradas=$ENTRIES)" >&2; exit 1; fi
mv "$OUT.partial" "$OUT"; chmod 600 "$OUT"
find "$DIR" -maxdepth 1 -name 'artenojardim-*.dump' -mtime +$KEEP_DAYS -delete
echo "ok $OUT bytes=$SIZE entradas=$ENTRIES"
