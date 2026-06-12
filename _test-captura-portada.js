// Captura la portada del HTML del informe de prueba.
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');

(async () => {
  const n = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await n.newPage();
  await p.setViewport({ width: 900, height: 750 });
  await p.goto(pathToFileURL(path.join(__dirname, '_test-informe-estados.html')).href);
  await p.screenshot({ path: '_captura-pdf-portada.png' });
  await n.close();
  console.log('captura lista');
})();
