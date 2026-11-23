#!/bin/sh
set -eu
umask 077

intervalo="${RESPALDO_INTERVALO_SEGUNDOS:-86400}"
retencion="${RESPALDO_RETENCION_DIAS:-14}"
directorio="${RESPALDO_DIRECTORIO:-/respaldos}"

case "$intervalo" in ''|*[!0-9]*) exit 2 ;; esac
case "$retencion" in ''|*[!0-9]*) exit 2 ;; esac
test "$intervalo" -ge 60 && test "$intervalo" -le 604800
test "$retencion" -ge 1 && test "$retencion" -le 365
mkdir -p "$directorio"
chmod 700 "$directorio"

temporal=''
pausa=''
salir() {
    if [ -n "$temporal" ]; then rm -f "$temporal"; fi
    if [ -n "$pausa" ]; then kill "$pausa" 2>/dev/null || true; fi
    exit 0
}
trap salir INT TERM

respaldar() {
    if ! find "$directorio" -maxdepth 1 -type f -name '.respaldo.*' -mtime +1 -delete; then return 1; fi
    temporal="$(mktemp "$directorio/.respaldo.XXXXXX")"
    if ! pg_dump --format=custom --no-owner --no-acl --file="$temporal"; then
        rm -f "$temporal"
        temporal=''
        return 1
    fi
    if ! pg_restore --list "$temporal" >/dev/null; then
        rm -f "$temporal"
        temporal=''
        return 1
    fi
    archivo="esoe-$(date -u +%Y%m%dT%H%M%SZ)-${temporal##*.}.dump"
    if ! ln "$temporal" "$directorio/$archivo"; then rm -f "$temporal"; temporal=''; return 1; fi
    rm -f "$temporal"
    temporal=''
    if ! (cd "$directorio" && sha256sum "$archivo" > ".$archivo.sha256" && mv ".$archivo.sha256" "$archivo.sha256"); then
        rm -f "$directorio/$archivo" "$directorio/.$archivo.sha256"
        return 1
    fi
    if ! find "$directorio" -maxdepth 1 -type f -name 'esoe-*.dump' -mtime "+$retencion" -exec sh -c 'rm -f "$1" "$1.sha256"' sh '{}' ';'; then return 1; fi
    if ! touch /tmp/ultimo-respaldo; then return 1; fi
    printf '%s\n' 'Respaldo completado y catalogo verificado.'
}

while :; do
    if respaldar; then
        if [ "${RESPALDO_UNA_VEZ:-false}" = 'true' ]; then exit 0; fi
        espera="$intervalo"
    else
        printf '%s\n' 'No se pudo respaldar. Se conservaron los respaldos anteriores.' >&2
        if [ "${RESPALDO_UNA_VEZ:-false}" = 'true' ]; then exit 1; fi
        espera=300
    fi
    sleep "$espera" &
    pausa=$!
    wait "$pausa" || true
    pausa=''
done
