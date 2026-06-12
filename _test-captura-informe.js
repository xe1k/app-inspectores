// Captura la sección de hallazgos del HTML del informe generado con datos ficticios.
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const n = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await n.newPage();
  await p.setViewport({ width: 900, height: 1200 });
  await p.goto('file:///' + path.join(__dirname, '_test-informe-estados.html').replace(/\\/g, '/'));
  const tarjeta = await p.$('.tarjeta-hallazgo');
  await tarjeta.scrollIntoView();
  await p.screenshot({ path: '_captura-pdf-estados.png' });
  await n.close();
  console.log('captura lista');
})();
