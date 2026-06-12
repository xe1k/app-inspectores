// Prueba del editor de fotos: abre el editor con una foto real, dibuja un
// rectángulo y una flecha simulando los gestos, captura pantalla y verifica
// que al guardar devuelve un archivo nuevo con las marcas.
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

(async () => {
  // Buscar una foto real de los datos
  const base = path.join(__dirname, 'data', 'inspecciones');
  let foto = null;
  (function buscar(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (foto) return;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) buscar(abs);
      else if (/\.(jpe?g|png|webp)$/i.test(e.name) && !/portada/.test(e.name)) foto = abs;
    }
  })(base);
  if (!foto) { console.error('No hay fotos de prueba'); process.exit(1); }

  const css = fs.readFileSync(path.join(__dirname, 'public', 'css', 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, 'public', 'js', 'editor-foto.js'), 'utf8');
  const fotoB64 = fs.readFileSync(foto).toString('base64');

  const navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 412, height: 915, deviceScaleFactor: 1 }); // tamaño celular
  await pagina.setContent(`<!DOCTYPE html><html><head><style>${css}</style></head><body><script>${js}</script></body></html>`);

  // Lanzar el editor con la foto
  const promesa = pagina.evaluate(async (b64) => {
    const r = await fetch('data:image/jpeg;base64,' + b64);
    const blob = await r.blob();
    window._resultado = null;
    window._promesa = editarFoto(new File([blob], 'prueba.jpg', { type: 'image/jpeg' }))
      .then(res => { window._resultado = res ? { conMarcas: res.conMarcas, bytes: res.archivo.size, nombre: res.archivo.name } : null; });
    return true;
  }, fotoB64);
  await promesa;
  await pagina.waitForSelector('.editor-foto-bg.open', { timeout: 5000 });
  console.log('Editor abierto OK (overlay visible)');

  // Herramienta activa por defecto
  const activa = await pagina.$eval('.ef-tool.activo', el => el.dataset.tool);
  console.log('Herramienta por defecto:', activa);

  // Dibujar un rectángulo arrastrando sobre el canvas
  const caja = await (await pagina.$('.ef-canvas')).boundingBox();
  const x0 = caja.x + caja.width * 0.25, y0 = caja.y + caja.height * 0.3;
  const x1 = caja.x + caja.width * 0.7, y1 = caja.y + caja.height * 0.65;
  await pagina.mouse.move(x0, y0); await pagina.mouse.down();
  await pagina.mouse.move(x1, y1, { steps: 8 }); await pagina.mouse.up();

  // Cambiar a flecha y dibujar una
  await pagina.click('.ef-tool[data-tool="flecha"]');
  await pagina.mouse.move(caja.x + caja.width * 0.85, caja.y + caja.height * 0.15);
  await pagina.mouse.down();
  await pagina.mouse.move(caja.x + caja.width * 0.6, caja.y + caja.height * 0.4, { steps: 8 });
  await pagina.mouse.up();

  await pagina.screenshot({ path: path.join(__dirname, '_test-editor.png') });
  console.log('Captura del editor con marcas: _test-editor.png');

  // Guardar y verificar el resultado
  await pagina.click('[data-accion="guardar"]');
  await pagina.waitForFunction(() => window._resultado !== null || document.querySelector('.editor-foto-bg') === null, { timeout: 10000 });
  await pagina.evaluate(() => window._promesa);
  const resultado = await pagina.evaluate(() => window._resultado);
  console.log('Resultado al guardar:', JSON.stringify(resultado));
  if (!resultado || !resultado.conMarcas || resultado.bytes < 1000) { console.error('FALLO: no devolvió foto con marcas'); process.exit(1); }
  console.log('OK — el editor devuelve la foto con las marcas pintadas, lista para subir');
  await navegador.close();
})();
