# Fixtures de guardado (inspección; nunca la partida personal)

Se escriben en `localStorage['bellakaventuras.remake.save']` de una pestaña de prueba antes de cargar
(`tools/v3/lib.mjs → openGame({ save })`). Las `v2-*` usan la versión interna 3 (parque V2) para probar la migración 3→4.
Un fixture prepara el escenario; no ejecuta la condición que se comprueba.
