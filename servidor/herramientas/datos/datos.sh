#!/bin/bash
# Trae al Mac el archivo ÚNICO con todos los datos en bruto (IONOS + Bunny), actualizado con lo nuevo:
#   1. el servidor añade lo que falte (bk-datos; además lo hace solo cada hora, porque Bunny guarda sus registros 3 días);
#   2. hace una copia consistente y el Mac se la trae con rsync (solo baja lo que ha cambiado).
#   herramientas/datos/datos.sh             → datos/bellakaventuras.sqlite
#   herramientas/datos/datos.sh --parquet   → además exporta cada tabla a datos/parquet/<tabla>.parquet (pandas/pyarrow)
#   herramientas/datos/datos.sh --csv       → además exporta cada tabla a datos/csv/<tabla>.csv.gz
set -euo pipefail
D="$(cd "$(dirname "$0")/../.." && pwd)"; O="$D/datos"; mkdir -p "$O"
ssh -o BatchMode=yes bellaka 'nice /usr/local/bin/bk-datos && /usr/local/bin/bk-datos --instantanea /var/lib/bk-datos/instantanea.sqlite'
rsync -az --partial bellaka:/var/lib/bk-datos/instantanea.sqlite "$O/bellakaventuras.sqlite"
ssh -o BatchMode=yes bellaka 'rm -f /var/lib/bk-datos/instantanea.sqlite'
python3 - "$O" "${1:-}" <<'PY'
import sqlite3, sys, os
O, modo = sys.argv[1], sys.argv[2]; b = sqlite3.connect(os.path.join(O, "bellakaventuras.sqlite"))
print("Archivo:", os.path.join(O, "bellakaventuras.sqlite"), f"({os.path.getsize(os.path.join(O, 'bellakaventuras.sqlite')) / 1e6:.1f} MB)")
print("Última actualización:", b.execute("SELECT valor FROM info WHERE clave='ultima_actualizacion'").fetchone()[0])
tablas = ["eventos", "ionos_peticiones", "bunny_peticiones", "bunny_horas", "bunny_geo"]
for t in tablas:
    print(f"  {t:<18}{b.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]:>10} filas")
if modo in ("--parquet", "--csv"):
    import pandas as pd
    for t in tablas:
        df = pd.read_sql(f"SELECT * FROM {t}", b)
        if modo == "--parquet":
            os.makedirs(os.path.join(O, "parquet"), exist_ok=True); df.to_parquet(os.path.join(O, "parquet", f"{t}.parquet"), index=False)
        else:
            os.makedirs(os.path.join(O, "csv"), exist_ok=True); df.to_csv(os.path.join(O, "csv", f"{t}.csv.gz"), index=False)
    print("Exportado a", os.path.join(O, modo[2:]))
PY
