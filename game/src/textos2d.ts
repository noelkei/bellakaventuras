// V10.4 · TODOS los textos 2D del juego (W-D32: un solo archivo). GENERADO por V10/IT6/tools/gen_textos2d.py; no editar a mano:
//  · DOSSIER: las 34 frases de Diálogos 2D/dossier-v1-2026-10-19/02_MATRIZ_DIALOGOS.md, LITERALES (texto, quién habla y la pose de los dos);
//  · PISTAS y TEXTOS: provisionales de Claude (V10/IT6/borradores/pistas_borrador.md), para que el usuario los revise
//    (V10/IT6/TEXTOS_PARA_REVISAR.md).
export type Quien = 'kat' | 'kroak';
export type Pose = 'espera' | 'saludo' | 'habla';
export interface Linea { id: string; habla: Quien; texto: string; kat: Pose; kroak: Pose }
export interface Pista { id: string; nivel: number; habla: Quien | 'boton'; pose: Pose; texto: string }
export const DOSSIER: Record<string, Linea> = {
 "PLA-01": {
  "id": "PLA-01",
  "habla": "kat",
  "texto": "¡Ey! Soy Bellakat. Ven, que te enseñamos cómo va esto.",
  "kat": "saludo",
  "kroak": "espera"
 },
 "PLA-02": {
  "id": "PLA-02",
  "habla": "kroak",
  "texto": "Y yo Bellakroak. Primero, una vueltecita por aquí.",
  "kat": "espera",
  "kroak": "saludo"
 },
 "PLA-03": {
  "id": "PLA-03",
  "habla": "kat",
  "texto": "Acércate a la marca del suelo.",
  "kat": "habla",
  "kroak": "espera"
 },
 "PLA-05": {
  "id": "PLA-05",
  "habla": "kat",
  "texto": "Ahora súbete al skate.",
  "kat": "habla",
  "kroak": "espera"
 },
 "PLA-06": {
  "id": "PLA-06",
  "habla": "kat",
  "texto": "Dale un poco de impulso y rodea la marca.",
  "kat": "habla",
  "kroak": "espera"
 },
 "PLA-07": {
  "id": "PLA-07",
  "habla": "kroak",
  "texto": "Eso es. Ahora frena, que la plaza se acaba.",
  "kat": "espera",
  "kroak": "habla"
 },
 "PLA-08": {
  "id": "PLA-08",
  "habla": "kat",
  "texto": "Y bájate del skate. Así podrás hablar con la gente y empezar sus actividades.",
  "kat": "habla",
  "kroak": "espera"
 },
 "PLA-09": {
  "id": "PLA-09",
  "habla": "kroak",
  "texto": "Acércate a esa patata para cogerla. Esta es de práctica, todavía no cuenta.",
  "kat": "espera",
  "kroak": "habla"
 },
 "PLA-10": {
  "id": "PLA-10",
  "habla": "kat",
  "texto": "Ya sabes lo básico. Ahora sí…",
  "kat": "habla",
  "kroak": "espera"
 },
 "PAR-01": {
  "id": "PAR-01",
  "habla": "kat",
  "texto": "¡Te damos la bienvenida a las mejores Bellakaventuras con las que te has topado!",
  "kat": "saludo",
  "kroak": "espera"
 },
 "PAR-02": {
  "id": "PAR-02",
  "habla": "kroak",
  "texto": "Cinco zonas y una secreta, una por cada tema de Bellakaciones, el EP más bellako de ANMI.",
  "kat": "espera",
  "kroak": "habla"
 },
 "PAR-03": {
  "id": "PAR-03",
  "habla": "kat",
  "texto": "Aquí escucharás PREVIEWS INÉDITOS, pero la señal está rota. Las patatas nos ayudarán a arreglarla.",
  "kat": "habla",
  "kroak": "espera"
 },
 "PAR-04": {
  "id": "PAR-04",
  "habla": "kroak",
  "texto": "En cada una de las cinco zonas hay cuatro patatas. Busca primero las tres que están repartidas.",
  "kat": "espera",
  "kroak": "habla"
 },
 "PAR-05": {
  "id": "PAR-05",
  "habla": "kat",
  "texto": "Con esas tres desbloqueas la actividad. Supérala y recoge la cuarta para escuchar bien el preview.",
  "kat": "habla",
  "kroak": "espera"
 },
 "NMG-01": {
  "id": "NMG-01",
  "habla": "kat",
  "texto": "Pero empezamos por el hit del verano: NO ME GUILLO. Mira por dónde se llega.",
  "kat": "habla",
  "kroak": "espera"
 },
 "NMG-02": {
  "id": "NMG-02",
  "habla": "kroak",
  "texto": "Ahí tienes la primera. Esa sí cuenta.",
  "kat": "espera",
  "kroak": "habla"
 },
 "OBJ-01": {
  "id": "OBJ-01",
  "habla": "kat",
  "texto": "¡La primera! Ya estás ayudando a reparar la señal. Aquí te quedan dos por encontrar.",
  "kat": "saludo",
  "kroak": "espera"
 },
 "OBJ-02": {
  "id": "OBJ-02",
  "habla": "kroak",
  "texto": "Encuentra las dos que faltan y podrás empezar la actividad.",
  "kat": "espera",
  "kroak": "habla"
 },
 "OBJ-03": {
  "id": "OBJ-03",
  "habla": "kat",
  "texto": "Reúne las veinte y nos vemos en el centro. Te espera una gran sorpresa… si pasas una gran prueba.",
  "kat": "habla",
  "kroak": "espera"
 },
 "PAS-01": {
  "id": "PAS-01",
  "habla": "kroak",
  "texto": "Ya están las cuatro. ¿Nos vamos de aquí?",
  "kat": "espera",
  "kroak": "habla"
 },
 "PAS-02": {
  "id": "PAS-02",
  "habla": "kat",
  "texto": "Literalmente. Siguiente parada: NOSVAMOSDEAQUI. Fíjate en ese puente.",
  "kat": "habla",
  "kroak": "espera"
 },
 "PAS-03": {
  "id": "PAS-03",
  "habla": "kat",
  "texto": "Puente superado. Ahora vamos a YINYANG.",
  "kat": "habla",
  "kroak": "espera"
 },
 "PAS-04": {
  "id": "PAS-04",
  "habla": "kroak",
  "texto": "Ahí era donde vivía yo. A ver si encuentras las tres patatas.",
  "kat": "espera",
  "kroak": "habla"
 },
 "PAS-05": {
  "id": "PAS-05",
  "habla": "kroak",
  "texto": "Muro pintado y patatas recogidas. Vámonos a TRATRATRA.",
  "kat": "espera",
  "kroak": "habla"
 },
 "PAS-06": {
  "id": "PAS-06",
  "habla": "kat",
  "texto": "¿Ves la limusina? Por ahí seguimos. Primero, las tres patatas.",
  "kat": "habla",
  "kroak": "espera"
 },
 "PAS-07": {
  "id": "PAS-07",
  "habla": "kat",
  "texto": "Siguiente parada: FASHION GIRL. Aquí se viene a bailar.",
  "kat": "habla",
  "kroak": "espera"
 },
 "PAS-08": {
  "id": "PAS-08",
  "habla": "kroak",
  "texto": "Pero primero, las tres patatas. Que no se te olvide a qué venías.",
  "kat": "espera",
  "kroak": "habla"
 },
 "FIN-01": {
  "id": "FIN-01",
  "habla": "kat",
  "texto": "¡Las veinte! No has dejado ni una.",
  "kat": "saludo",
  "kroak": "espera"
 },
 "FIN-02": {
  "id": "FIN-02",
  "habla": "kroak",
  "texto": "Te dijimos que nos veríamos en el centro. Mira lo que te espera.",
  "kat": "espera",
  "kroak": "saludo"
 },
 "FIN-03": {
  "id": "FIN-03",
  "habla": "kat",
  "texto": "Para la prueba final de SECRETNOVIO, sube por las escaleras y enséñanos tu mejor truco.",
  "kat": "habla",
  "kroak": "espera"
 },
 "FIN-04": {
  "id": "FIN-04",
  "habla": "kat",
  "texto": "Supera la prueba y te ganas la sorpresa.",
  "kat": "habla",
  "kroak": "espera"
 },
 "DES-01": {
  "id": "DES-01",
  "habla": "kat",
  "texto": "Nosotros nos vamos de Bellakaciones. A ti todavía te queda un poco de currele…",
  "kat": "saludo",
  "kroak": "espera"
 },
 "DES-02": {
  "id": "DES-02",
  "habla": "kroak",
  "texto": "Tú termina, que nos vemos ahí.",
  "kat": "espera",
  "kroak": "habla"
 },
 "DES-03": {
  "id": "DES-03",
  "habla": "kat",
  "texto": "Mientras tanto, el parque es tuyo. ¡Disfrútalo!",
  "kat": "saludo",
  "kroak": "saludo"
 }
};
export const PISTAS: Record<string, Pista> = {
 "HLP-NMG-visible-1": {
  "id": "HLP-NMG-visible-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Hay una que está a la vista. Mira bien alrededor del corazón."
 },
 "HLP-NMG-visible-2": {
  "id": "HLP-NMG-visible-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Rodea el corazón por detrás, como si vinieras desde la plaza. Está en el suelo."
 },
 "HLP-NMG-visible-3": {
  "id": "HLP-NMG-visible-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Aquí no hace falta truco: pasa por encima y es tuya. Sigue la línea amarilla."
 },
 "HLP-NMG-medium-1": {
  "id": "HLP-NMG-medium-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Esta no está en el suelo. Mira encima de las cosas, cerca de la escalera."
 },
 "HLP-NMG-medium-2": {
  "id": "HLP-NMG-medium-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Está encima del cajón que hay frente a la escalera. Salta para cogerla."
 },
 "HLP-NMG-medium-3": {
  "id": "HLP-NMG-medium-3",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Ve en skate hacia el cajón y salta justo antes de llegar. La coges arriba."
 },
 "HLP-NMG-hidden-1": {
  "id": "HLP-NMG-hidden-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "La que te falta está más baja que el suelo. Fíjate bien en la U."
 },
 "HLP-NMG-hidden-2": {
  "id": "HLP-NMG-hidden-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "La U tiene la boca de espaldas a la plaza. Rodéala o mírala desde el bank."
 },
 "HLP-NMG-hidden-3": {
  "id": "HLP-NMG-hidden-3",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Rodea la U hasta su boca y baja al fondo. Para salir, usa los peldaños."
 },
 "HLP-NMG-activity-1": {
  "id": "HLP-NMG-activity-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "La Pantera ya te ha dado lo suyo. Tu patata te espera ahí mismo."
 },
 "HLP-NMG-activity-2": {
  "id": "HLP-NMG-activity-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Vuelve con La Pantera: la patata ha salido justo delante."
 },
 "HLP-NMG-activity-3": {
  "id": "HLP-NMG-activity-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Ponte frente a La Pantera y pasa por encima de la patata. Nada más."
 },
 "HLP-NVDA-visible-1": {
  "id": "HLP-NVDA-visible-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Hay una que se ve desde abajo. Mira arriba, donde empieza el puente."
 },
 "HLP-NVDA-visible-2": {
  "id": "HLP-NVDA-visible-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Sube la escalera grande hasta arriba del todo. Te espera al llegar."
 },
 "HLP-NVDA-visible-3": {
  "id": "HLP-NVDA-visible-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Sube los escalones andando. En el rellano de arriba, pasa por encima y listo."
 },
 "HLP-NVDA-medium-1": {
  "id": "HLP-NVDA-medium-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Una está a media altura, en una cuesta. Mira al lado de la escalera grande."
 },
 "HLP-NVDA-medium-2": {
  "id": "HLP-NVDA-medium-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Está en mitad de la rampa empinada que baja del puente."
 },
 "HLP-NVDA-medium-3": {
  "id": "HLP-NVDA-medium-3",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Sube al puente y baja la rampa en skate, recto. La coges a mitad de camino."
 },
 "HLP-NVDA-hidden-1": {
  "id": "HLP-NVDA-hidden-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Hay una escondida por debajo. Busca un paso muy bajito."
 },
 "HLP-NVDA-hidden-2": {
  "id": "HLP-NVDA-hidden-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Está dentro del paso bajo. De pie no cabes: hay que ir agachada."
 },
 "HLP-NVDA-hidden-3": {
  "id": "HLP-NVDA-hidden-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Ve en skate y agáchate justo antes de entrar. Dentro la coges sin parar."
 },
 "HLP-NVDA-activity-1": {
  "id": "HLP-NVDA-activity-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "El grind ya está hecho. Tu patata te espera al final del rail."
 },
 "HLP-NVDA-activity-2": {
  "id": "HLP-NVDA-activity-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Sigue el rail hasta donde termina. Ahí, en el suelo, está tu regalo."
 },
 "HLP-NVDA-activity-3": {
  "id": "HLP-NVDA-activity-3",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Ve andando o rodando hasta el final del rail y pasa por encima de la patata."
 },
 "HLP-YY-visible-1": {
  "id": "HLP-YY-visible-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Esta piscina me la conozco. Asómate al borde: hay una a la vista."
 },
 "HLP-YY-visible-2": {
  "id": "HLP-YY-visible-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Baja por la escalera de la piscina. Está en el fondo, al pie de los escalones."
 },
 "HLP-YY-visible-3": {
  "id": "HLP-YY-visible-3",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Baja los escalones andando y camina por el fondo hasta ella. Sin prisa."
 },
 "HLP-YY-medium-1": {
  "id": "HLP-YY-medium-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Esta no está en la piscina. Mira por los bancos de alrededor."
 },
 "HLP-YY-medium-2": {
  "id": "HLP-YY-medium-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Está encima del banco que da al lado de TRATRATRA."
 },
 "HLP-YY-medium-3": {
  "id": "HLP-YY-medium-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Acércate rodando al banco y salta justo antes. La coges al subir."
 },
 "HLP-YY-hidden-1": {
  "id": "HLP-YY-hidden-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Hay una en lo más hondo de mi piscina. Hay que bajar del todo."
 },
 "HLP-YY-hidden-2": {
  "id": "HLP-YY-hidden-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Está en el centro de la parte honda, en el lado contrario a la escalera."
 },
 "HLP-YY-hidden-3": {
  "id": "HLP-YY-hidden-3",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Baja al vaso y rueda hasta el centro de la parte honda. Para salir, la escalera."
 },
 "HLP-YY-activity-1": {
  "id": "HLP-YY-activity-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "El grafiti ya está hecho. Tu patata te espera junto al muro pintado."
 },
 "HLP-YY-activity-2": {
  "id": "HLP-YY-activity-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Ve al pie de la torre, junto al muro que has pintado. Ahí está."
 },
 "HLP-YY-activity-3": {
  "id": "HLP-YY-activity-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Ponte delante del grafiti de la torre y pasa por encima de la patata."
 },
 "HLP-TT-visible-1": {
  "id": "HLP-TT-visible-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Una está en el camino de abajo. Ni la tienes que buscar mucho."
 },
 "HLP-TT-visible-2": {
  "id": "HLP-TT-visible-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Sube la escalera de entrada y sigue el camino de abajo hasta la escalera de mano."
 },
 "HLP-TT-visible-3": {
  "id": "HLP-TT-visible-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Está al pie de la escalera de mano, en el suelo del camino. Pasa por encima."
 },
 "HLP-TT-medium-1": {
  "id": "HLP-TT-medium-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Esta flota en el aire, bien arriba. Mira la plataforma de atrás."
 },
 "HLP-TT-medium-2": {
  "id": "HLP-TT-medium-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Está encima del agujero de la plataforma de atrás. Hay que saltarlo."
 },
 "HLP-TT-medium-3": {
  "id": "HLP-TT-medium-3",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Coge carrerilla y salta el agujero por el centro. La coges en el aire."
 },
 "HLP-TT-hidden-1": {
  "id": "HLP-TT-hidden-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Hay una escondida debajo de todo esto. Mira entre los pilares."
 },
 "HLP-TT-hidden-2": {
  "id": "HLP-TT-hidden-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Está en el suelo, justo debajo del agujero de la plataforma de atrás."
 },
 "HLP-TT-hidden-3": {
  "id": "HLP-TT-hidden-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Métete andando entre los pilares, o déjate caer por el agujero. Ahí la tienes."
 },
 "HLP-TT-activity-1": {
  "id": "HLP-TT-activity-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Aissa y Juseph ya te han contado lo suyo. Tu patata está en la limo."
 },
 "HLP-TT-activity-2": {
  "id": "HLP-TT-activity-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Mira en el techo de la limo, justo en el centro."
 },
 "HLP-TT-activity-3": {
  "id": "HLP-TT-activity-3",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Sube por la escalerilla de la limo hasta el techo y ve al centro."
 },
 "HLP-FG-visible-1": {
  "id": "HLP-FG-visible-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Una se ve muy bien desde arriba. Asómate desde el deck."
 },
 "HLP-FG-visible-2": {
  "id": "HLP-FG-visible-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Está en el fondo de la U, entre el deck y la pista."
 },
 "HLP-FG-visible-3": {
  "id": "HLP-FG-visible-3",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Baja a la U y pasa por el fondo. Para salir, sube andando hacia la pista."
 },
 "HLP-FG-medium-1": {
  "id": "HLP-FG-medium-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Esta no toca el suelo. Mira al aire, entre las dos cuñas rosas."
 },
 "HLP-FG-medium-2": {
  "id": "HLP-FG-medium-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Flota justo en medio de las dos cuñas rosas que hay tras la pista."
 },
 "HLP-FG-medium-3": {
  "id": "HLP-FG-medium-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Sube a lo alto de una cuña y salta hacia la otra. La coges en el aire."
 },
 "HLP-FG-hidden-1": {
  "id": "HLP-FG-hidden-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "La que falta está cerca de la música. Busca la radio de esta zona."
 },
 "HLP-FG-hidden-2": {
  "id": "HLP-FG-hidden-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Está encima del muro bajo de la radio, en la parte alta, justo a su lado."
 },
 "HLP-FG-hidden-3": {
  "id": "HLP-FG-hidden-3",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Súbete al muro con un ollie, por la parte alta, y pasa junto a la radio."
 },
 "HLP-FG-activity-1": {
  "id": "HLP-FG-activity-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Baile terminado. Tu patata te espera al lado de la pista."
 },
 "HLP-FG-activity-2": {
  "id": "HLP-FG-activity-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Mira junto a la rampa del lateral de la pista de baile."
 },
 "HLP-FG-activity-3": {
  "id": "HLP-FG-activity-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Baja de la pista por la rampa del lateral. La patata está al pie."
 },
 "HLP-NMG-ACT-1": {
  "id": "HLP-NMG-ACT-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Ya tienes las tres. Ahora habla con La Pantera para conseguir la cuarta."
 },
 "HLP-NMG-ACT-2": {
  "id": "HLP-NMG-ACT-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Ve hasta La Pantera, bájate del skate y habla. La cuarta va por ahí."
 },
 "HLP-NVDA-ACT-1": {
  "id": "HLP-NVDA-ACT-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Ya tienes las tres. Sube al puente y habla con Bellakat."
 },
 "HLP-NVDA-ACT-2": {
  "id": "HLP-NVDA-ACT-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Sube la escalera grande hasta el puente. Te espero arriba para el grind."
 },
 "HLP-YY-ACT-1": {
  "id": "HLP-YY-ACT-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Ya tienes las tres. Habla con Bellakroak junto al muro para pintarlo."
 },
 "HLP-YY-ACT-2": {
  "id": "HLP-YY-ACT-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Te espero junto al muro de la torre. Ven, que hay que pintarlo."
 },
 "HLP-TT-ACT-1": {
  "id": "HLP-TT-ACT-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Ya tienes las tres. Sube a la limo y habla con Aissa y con Juseph."
 },
 "HLP-TT-ACT-2": {
  "id": "HLP-TT-ACT-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "La limo está arriba del todo. Aissa y Juseph están sentados en cada punta."
 },
 "HLP-TT-ACT-falta": {
  "id": "HLP-TT-ACT-falta",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Te falta hablar con {quien}, en la otra punta de la limo."
 },
 "HLP-FG-ACT-1": {
  "id": "HLP-FG-ACT-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Ya tienes las tres. Sube a la pista de baile y ponte a bailar."
 },
 "HLP-FG-ACT-2": {
  "id": "HLP-FG-ACT-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Sube a pie a la pista, sin skate. Ponte en el centro y empieza el baile."
 },
 "HLP-SIG-NMG-1": {
  "id": "HLP-SIG-NMG-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Empezamos por NO ME GUILLO, el hit del verano. Es la zona del corazón."
 },
 "HLP-SIG-NMG-2": {
  "id": "HLP-SIG-NMG-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Sigue la línea hasta NO ME GUILLO, junto a la plaza. Busca el corazón grande."
 },
 "HLP-SIG-NVDA-1": {
  "id": "HLP-SIG-NVDA-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Aquí ya están las cuatro. La siguiente zona es NOSVAMOSDEAQUI."
 },
 "HLP-SIG-NVDA-2": {
  "id": "HLP-SIG-NVDA-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Sigue la línea hasta el puente de NOSVAMOSDEAQUI. Empieza por la escalera grande."
 },
 "HLP-SIG-YY-1": {
  "id": "HLP-SIG-YY-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Puente superado. Ahora toca YINYANG."
 },
 "HLP-SIG-YY-2": {
  "id": "HLP-SIG-YY-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Sigue la línea hasta mi antigua casa: la piscina con la torre de YINYANG."
 },
 "HLP-SIG-TT-1": {
  "id": "HLP-SIG-TT-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Aquí ya no queda nada. Vámonos a TRATRATRA."
 },
 "HLP-SIG-TT-2": {
  "id": "HLP-SIG-TT-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "¿Ves la limusina rosa allá arriba? Eso es TRATRATRA. Sigue la línea."
 },
 "HLP-SIG-FG-1": {
  "id": "HLP-SIG-FG-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Siguiente parada: FASHION GIRL. Aquí se viene a bailar."
 },
 "HLP-SIG-FG-2": {
  "id": "HLP-SIG-FG-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Sigue la línea hasta la pista de baile rosa de FASHION GIRL."
 },
 "HLP-SIG-SN-1": {
  "id": "HLP-SIG-SN-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Ya tienes las veinte. La prueba final te espera en el centro."
 },
 "HLP-SIG-SN-2": {
  "id": "HLP-SIG-SN-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Ve al centro y busca la escalera del muro. Desde arriba empieza todo."
 },
 "HLP-SN-1": {
  "id": "HLP-SN-1",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "La prueba final te espera. Busca la escalera del muro del centro."
 },
 "HLP-SN-2": {
  "id": "HLP-SN-2",
  "nivel": 2,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Acércate a la escalera del muro y trepa hasta arriba del todo."
 },
 "HLP-SN-3": {
  "id": "HLP-SN-3",
  "nivel": 3,
  "habla": "kat",
  "pose": "habla",
  "texto": "Ya estás arriba. Ve al carril de bajada y pulsa ¡BAJAR!"
 },
 "HLP-SN-4": {
  "id": "HLP-SN-4",
  "nivel": 3,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Al bajar, salta cuando se marque el botón y acierta los círculos en el aire."
 },
 "HLP-SN-reintento-1": {
  "id": "HLP-SN-reintento-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Otra vez: sube por la escalera, baja y salta cuando aparezca el aviso."
 },
 "HLP-SN-reintento-2": {
  "id": "HLP-SN-reintento-2",
  "nivel": 2,
  "habla": "kat",
  "pose": "habla",
  "texto": "Casi. Ojo con los coches, que no paran. Vuelve a subir y salta en el aviso."
 },
 "HLP-MODO-1": {
  "id": "HLP-MODO-1",
  "nivel": 0,
  "habla": "kat",
  "pose": "habla",
  "texto": "Antes de soltarte: si te atascas, ¿quieres que te echemos una mano?"
 },
 "HLP-MODO-2": {
  "id": "HLP-MODO-2",
  "nivel": 0,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Si pasas un rato sin coger nada, te damos una pista y te marcamos el camino."
 },
 "HLP-MODO-3": {
  "id": "HLP-MODO-3",
  "nivel": 0,
  "habla": "kat",
  "pose": "habla",
  "texto": "Tú decides. Lo puedes cambiar cuando quieras en Ajustes."
 },
 "HLP-MODO-btn-si": {
  "id": "HLP-MODO-btn-si",
  "nivel": 0,
  "habla": "boton",
  "pose": "habla",
  "texto": "Sí, ayúdame"
 },
 "HLP-MODO-btn-no": {
  "id": "HLP-MODO-btn-no",
  "nivel": 0,
  "habla": "boton",
  "pose": "habla",
  "texto": "No, gracias"
 },
 "HLP-MODO-si": {
  "id": "HLP-MODO-si",
  "nivel": 0,
  "habla": "kroak",
  "pose": "saludo",
  "texto": "Hecho. Si te vemos dando vueltas, aparecemos."
 },
 "HLP-MODO-no": {
  "id": "HLP-MODO-no",
  "nivel": 0,
  "habla": "kat",
  "pose": "habla",
  "texto": "Vale, a tu aire. Si cambias de idea, está en Ajustes."
 },
 "HLP-MODO-vuelta-1": {
  "id": "HLP-MODO-vuelta-1",
  "nivel": 0,
  "habla": "kat",
  "pose": "saludo",
  "texto": "¡Has vuelto! Ahora te podemos echar una mano si te atascas."
 },
 "HLP-MODO-vuelta-2": {
  "id": "HLP-MODO-vuelta-2",
  "nivel": 0,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Te damos una pista y te marcamos el camino en el suelo. ¿Te apuntas?"
 },
 "HLP-PLAZA-CINE": {
  "id": "HLP-PLAZA-CINE",
  "nivel": 0,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Siéntate y disfruta, que te enseñamos el parque."
 },
 "HLP-FUERA-2d-1": {
  "id": "HLP-FUERA-2d-1",
  "nivel": 1,
  "habla": "kroak",
  "pose": "habla",
  "texto": "Eh, que por ahí fuera no hay nada. Vuelve, que te toca {zona}."
 },
 "HLP-FUERA-2d-2": {
  "id": "HLP-FUERA-2d-2",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "¿A dónde vas? La misión está dentro. Sigue la línea hasta {zona}."
 },
 "HLP-FUERA-2d-SN": {
  "id": "HLP-FUERA-2d-SN",
  "nivel": 1,
  "habla": "kat",
  "pose": "habla",
  "texto": "Fuera no hay nada. La prueba final está en el centro: sigue la línea."
 }
};
export const CONTROLES: Record<string, { teclado: string; tactil: string; mando: string }> = {
 "Caminar hasta la marca": {
  "teclado": "Muévete con W A S D o las flechas.",
  "tactil": "Muévete con el joystick.",
  "mando": "Muévete con el stick izquierdo."
 },
 "Subir al skate": {
  "teclado": "Pulsa Q.",
  "tactil": "Pulsa SUBIR.",
  "mando": "Pulsa LB."
 },
 "Impulsarse y girar": {
  "teclado": "Mantén W o ↑ para impulsarte. Gira con A/D, las flechas o la cámara en modo ratón.",
  "tactil": "Empuja el joystick hacia arriba y muévelo a los lados para girar.",
  "mando": "Empuja el stick izquierdo hacia arriba y muévelo a los lados para girar."
 },
 "Frenar": {
  "teclado": "Mantén S o ↓ hasta pararte.",
  "tactil": "Lleva el joystick hacia abajo hasta pararte.",
  "mando": "Lleva el stick izquierdo hacia abajo hasta pararte."
 },
 "Bajar del skate": {
  "teclado": "Pulsa Q.",
  "tactil": "Pulsa BAJAR.",
  "mando": "Pulsa LB."
 },
 "Recoger la patata de práctica": {
  "teclado": "Acércate a la patata.",
  "tactil": "Acércate a la patata.",
  "mando": "Acércate a la patata."
 }
};
export const DESBLOQUEO: Record<string, string> = {
 "no_me_guillo": "3/3 · Actividad disponible: habla con La Pantera.",
 "nosvamosdeaqui": "3/3 · Actividad disponible: sube al puente y habla con Bellakat.",
 "yinyang": "3/3 · Actividad disponible: habla con Bellakroak junto al muro.",
 "tratratra": "3/3 · Actividad disponible: sube a la limo y habla con Aissa y Juseph.",
 "fashion_girl": "3/3 · Actividad disponible: sube a la pista de baile."
};
export const TEXTOS = {
 "continuar": "Continuar",
 "saltarTutorial": "Saltar tutorial",
 "saltar": "SALTAR",
 "modoSi": "Sí, ayúdame",
 "modoNo": "No, gracias",
 "ajustesLabel": "Modo ayuda",
 "ajustesDesc": "Si pasas un rato sin coger patatas, Bellakroak o Bellakat te dan una pista.",
 "ajustesOff": "Ya no queda nada pendiente: el modo ayuda no hace falta.",
 "fueraToast": [
  "Por aquí no hay patatas. Vuelve al parque, que la misión sigue.",
  "Te estás alejando. Vuelve hacia dentro y sigue con el currele."
 ],
 "fueraToastSN": "Fuera no hay nada. La prueba final te espera en el centro.",
 "bloqueo1": "Te falta una patata de esta zona para empezar. Encuéntrala primero.",
 "bloqueoN": "Te faltan {n} patatas de esta zona para empezar. Encuéntralas primero.",
 "bloqueoAccion": "Faltan patatas",
 "practica": "Patata de práctica: todavía no cuenta",
 "objetivoBloqueo": "Encuentra las 3 patatas de {zona} para empezar su actividad · {n}/4 aquí"
};
// V10.5 · textos nuevos (provisionales, E5-05; los de la pista del vaso de YY son literales del usuario, E5-21). Fuente: V10/IT7/borradores/textos_v105.md
export const TEXTOS105 = {
 "yy1": {
  "tactil": "Coge velocidad hacia la pared y súbela. De frente sales por arriba: SALTO + joystick ↑/↓ = flip.",
  "teclado": "Coge velocidad hacia la pared y súbela. De frente sales por arriba: Espacio + ↑/↓ = flip.",
  "mando": "Coge velocidad hacia la pared y súbela. De frente sales por arriba: A + stick ↑/↓ = flip."
 },
 "yy2": {
  "tactil": "Para salir del vaso: joystick ↑ en el aire o la escalera.",
  "teclado": "Para salir del vaso: ↑ en el aire o la escalera.",
  "mando": "Para salir del vaso: stick ↑ en el aire o la escalera."
 },
 "conduccion": {
  "tactil": "Conducción: joystick arriba avanza o empuja hacia donde mira ANMI, abajo frena y luego retrocede, a los lados solo gira. La cámara solo mira. La tabla, con SUBIR / BAJAR.",
  "teclado": "Conducción: arriba avanza/empuja hacia donde mira ANMI, abajo frena y luego retrocede, los lados solo giran. La cámara solo mira. La tabla, con Q.",
  "mando": "Conducción: stick izquierdo arriba avanza o empuja hacia donde mira ANMI, abajo frena y luego retrocede, a los lados solo gira. La cámara solo mira. La tabla, con LB."
 },
 "eficienteLabel": "Modo eficiente: sombras más cortas y menos cálculo, para que vaya más fluido",
 "vaLento": "¿Va lento? Prueba el modo eficiente en Ajustes",
 "controlesTab": {
  "teclado": "Teclado",
  "tactil": "Táctil",
  "mando": "Mando"
 },
 "controlesVer": "Ver los controles de:"
};
