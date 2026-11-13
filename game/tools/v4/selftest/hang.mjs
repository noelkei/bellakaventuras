// Fixture del harness: proceso colgado sin timeout interno → lo mata el runner (timeout del runner).
setInterval(() => {}, 1000);
