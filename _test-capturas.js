// Captura cada sección del informe HTML como PNG para revisión visual.
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '_test-informe.html'), 'utf8');
  const dir = path.join(__dirname, '_capturas');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
  await pagina.setContent(html, { waitUntil: 'networkidle0' });
  const secciones = await pagina.$$('body > section');
  for (let i = 0; i < secciones.length; i++) {
    await secciones[i].screenshot({ path: path.join(dir, `pag-${String(i + 1).padStart(2, '0')}.png`) });
  }
  console.log(`${secciones.length} secciones capturadas en ${dir}`);
  await navegador.close();
})();
