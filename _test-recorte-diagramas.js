// Recorta las tablas ("Código | Largo | ...") incrustadas en las imágenes de
// los diagramas de la plantilla 4, dejando solo las vistas del equipo.
// Detección: filas con banda amarilla a todo el ancho (cabecera de tabla) y,
// hacia abajo, filas "vacías" (solo blanco / líneas grises / texto negro).
// Uso:
//   node _test-recorte-diagramas.js           -> genera vistas previas en _diagramas_recortados
//   node _test-recorte-diagramas.js aplicar   -> respalda y reemplaza los archivos reales
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const CARPETA = path.join(__dirname, 'data', 'plantillas', '4');
const PREVIA = path.join(__dirname, '_diagramas_recortados');
const RESPALDO = path.join(__dirname, '_backup_diagramas_originales');
const APLICAR = process.argv[2] === 'aplicar';

(async () => {
  const archivos = fs.readdirSync(CARPETA).filter(a => /^diagrama_.*\.png$/i.test(a));
  if (!fs.existsSync(PREVIA)) fs.mkdirSync(PREVIA);

  const navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const pagina = await navegador.newPage();
  await pagina.setContent('<canvas id="c"></canvas><canvas id="s"></canvas>');

  // Slides con formato de página completa: bajo la tabla solo hay firmas/copyright
  const PAGINA_COMPLETA = new Set(['diagrama_slide10.png', 'diagrama_slide11.png']);

  for (const archivo of archivos) {
    const b64 = fs.readFileSync(path.join(CARPETA, archivo)).toString('base64');
    const resultado = await pagina.evaluate(async (b64, cortarHastaAbajo) => {
      const img = new Image();
      await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; img.src = 'data:image/png;base64,' + b64; });
      const W = img.naturalWidth, H = img.naturalHeight;
      const c = document.getElementById('c');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, W, H).data;

      // Métricas por fila, medidas SOLO en la franja central (las leyendas
      // "Catalog/Estructural" y mini-vistas viven en los costados y no deben
      // interferir): fracción amarilla y fracción de "contenido" con color.
      const x0 = Math.round(W * 0.20), x1 = Math.round(W * 0.70);
      const ancho = x1 - x0;
      // amarilla: fracción de amarillo brillante (cabeceras de tabla).
      // colorContenido: fracción de píxeles con color "real" (rojos, verdes,
      // azules de las vistas del equipo). Lo neutro (blanco/gris/negro) y la
      // familia amarillo/oliva (cabeceras, bordes y textos de tabla) NO cuentan.
      const amarilla = new Float32Array(H), colorContenido = new Float32Array(H), oscura = new Float32Array(H);
      for (let y = 0; y < H; y++) {
        let nAm = 0, nCol = 0, nOsc = 0;
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          const r = px[i], g = px[i + 1], b = px[i + 2];
          if (r > 190 && g > 170 && (g - b) > 45) nAm++;
          if (Math.abs(r - g) >= 28 || (b - g) >= 35) nCol++;
          if (r + g + b < 360) nOsc++; // tinta oscura (texto, líneas)
        }
        amarilla[y] = nAm / ancho;
        colorContenido[y] = nCol / ancho;
        oscura[y] = nOsc / ancho;
      }

      // Cabeceras de tabla: tramos contiguos amarillos a lo ancho de la franja
      // central, sin otros colores (descarta las vigas amarillas del chasis,
      // que llevan recuadros rojos y costuras de colores).
      const bandas = [];
      let inicio = -1;
      for (let y = 0; y <= H; y++) {
        const es = y < H && amarilla[y] > 0.65 && colorContenido[y] < 0.08;
        if (es && inicio < 0) inicio = y;
        if (!es && inicio >= 0) {
          if (y - inicio >= 3) bandas.push([inicio, y - 1]); // al menos 3px de alto
          inicio = -1;
        }
      }

      // Cada banda se extiende hacia abajo mientras las filas sean "de tabla"
      // (sin contenido con color) y 3px hacia arriba (línea de borde superior).
      // Extensión hacia abajo: avanza por el cuerpo de la tabla (filas vacías,
      // bordes horizontales completos) y se detiene ante texto denso (títulos
      // de vistas, firmas) o contenido con color (las vistas del equipo).
      const cortes = bandas.map(([a, b]) => {
        let fin = b;
        while (fin + 1 < H && colorContenido[fin + 1] < 0.012 && (oscura[fin + 1] < 0.04 || oscura[fin + 1] > 0.5)) fin++;
        return [Math.max(0, a - 3), fin];
      });
      if (!cortes.length) return { sinCambios: true, bandas: [] };

      // Slides tipo "página" (firmas, notas y copyright debajo de la tabla):
      // todo lo que hay desde la tabla hacia abajo es papeleo, no diagrama.
      if (cortarHastaAbajo) cortes[cortes.length - 1][1] = H - 1;

      // Fusionar cortes cuando entre ellos no queda nada con color real
      // (cabeceras partidas por su propio texto, firmas / notas / bloques de
      // copyright entre tablas). Los títulos de vistas sobreviven porque
      // siempre van seguidos de una vista con color dentro del espacio.
      const esNeutra = (a, b) => { for (let y = a; y <= b; y++) if (colorContenido[y] >= 0.012) return false; return true; };
      cortes.push([H, H - 1]); // corte virtual al final: permite extender el último hasta el borde
      const fusionados = [];
      for (const c of cortes) {
        const previo = fusionados[fusionados.length - 1];
        if (previo && (c[0] - previo[1] <= 1 || esNeutra(previo[1] + 1, c[0] - 1))) {
          previo[1] = Math.max(previo[1], c[1]);
        } else {
          fusionados.push([c[0], c[1]]);
        }
      }
      const cortesFinales = fusionados.filter(([a, b]) => b >= a);

      // Zonas a conservar = complemento de los cortes
      const conservar = [];
      let cursor = 0;
      for (const [a, b] of cortesFinales) {
        if (a - cursor > 12) conservar.push([cursor, a - 1]); // ignora restos de <12px
        cursor = Math.max(cursor, b + 1);
      }
      if (H - cursor > 12) conservar.push([cursor, H - 1]);

      // Unir las zonas conservadas con un pequeño separador blanco entre vistas
      const SEPARADOR = 14;
      const altoFinal = conservar.reduce((s, [a, b]) => s + (b - a + 1), 0) + SEPARADOR * (conservar.length - 1);
      const s = document.getElementById('s');
      s.width = W; s.height = altoFinal;
      const sctx = s.getContext('2d');
      sctx.fillStyle = '#fff';
      sctx.fillRect(0, 0, W, altoFinal);
      let yDest = 0;
      for (const [a, b] of conservar) {
        const alto = b - a + 1;
        sctx.drawImage(c, 0, a, W, alto, 0, yDest, W, alto);
        yDest += alto + SEPARADOR;
      }
      return {
        sinCambios: false,
        bandas: cortes.map(([a, b]) => `${a}-${b}`),
        dataUrl: s.toDataURL('image/png'),
        dims: `${W}x${H} -> ${W}x${altoFinal}`
      };
    }, b64, PAGINA_COMPLETA.has(archivo));

    if (resultado.sinCambios) {
      console.log(`${archivo}: no se detectaron tablas, queda igual`);
      continue;
    }
    const buf = Buffer.from(resultado.dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(PREVIA, archivo), buf);
    console.log(`${archivo}: ${resultado.dims} (tablas en filas ${resultado.bandas.join(', ')})`);

    if (APLICAR) {
      if (!fs.existsSync(RESPALDO)) fs.mkdirSync(RESPALDO);
      const destinoRespaldo = path.join(RESPALDO, archivo);
      if (!fs.existsSync(destinoRespaldo)) fs.copyFileSync(path.join(CARPETA, archivo), destinoRespaldo);
      fs.writeFileSync(path.join(CARPETA, archivo), buf);
      console.log(`  -> aplicado (original respaldado en _backup_diagramas_originales)`);
    }
  }
  await navegador.close();
  if (!APLICAR) console.log('\nVistas previas en _diagramas_recortados. Ejecuta con "aplicar" para reemplazar.');
})();
