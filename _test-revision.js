// Prueba e2e del flujo de revisión guiada: verifica que los botones de avance
// de fase funcionen (bug reportado: "Continuar con esta foto" no avanzaba).
// Uso: PORT=3100 node src/server.js  y luego  node _test-revision.js
const puppeteer = require('puppeteer');

const BASE = 'https://localhost:3100';

(async () => {
  const browser = await puppeteer.launch({
    headless: true, pipe: true,
    args: ['--no-sandbox', '--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  const erroresJs = [];
  page.on('pageerror', e => erroresJs.push(e.message));

  // Login
  await page.goto(`${BASE}/login.html`, { waitUntil: 'load' });
  await page.type('#username', 'demo@chaba.test');
  await page.type('#password', 'demo1234');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);

  // Crear inspección + hallazgo + completar + nueva revisión, vía API con la sesión del navegador
  const inspId = await page.evaluate(async () => {
    const post = (url, body) => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(r => r.json());
    const put = (url, body) => fetch(url, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(r => r.json());
    const plantillas = await fetch('/api/plantillas').then(r => r.json());
    const insp = await post('/api/inspecciones', { plantilla_id: plantillas[0].id, equipo: 'TEST-REV', fecha: '2026-06-10' });
    await post('/api/hallazgos', { inspeccion_id: insp.id, criticidad: 'alta', sistema: 'Chasis', descripcion_dano: 'daño de prueba' });
    await put(`/api/inspecciones/${insp.id}`, { estado: 'completada' });
    const rev = await post(`/api/inspecciones/${insp.id}/nueva-revision`, { fecha: '2026-06-11' });
    return rev.inspeccion_id;
  });

  // Abrir la revisión guiada (fase portada)
  await page.goto(`${BASE}/revision.html?id=${inspId}`, { waitUntil: 'networkidle0' });
  const textoPortada = await page.evaluate(() => document.body.innerText);
  // innerText refleja el text-transform: uppercase del CSS — comparar en minúsculas
  if (!textoPortada.toLowerCase().includes('foto de portada')) throw new Error('No se mostró la fase de portada');

  // Click en "Usar foto anterior / Sin foto →" (el botón que no avanzaba)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Usar foto anterior'));
    if (!btn) throw new Error('Botón de continuar no encontrado');
    btn.click();
  });
  await new Promise(r => setTimeout(r, 400));
  const textoRevisar = await page.evaluate(() => document.body.innerText);
  if (!textoRevisar.includes('¿El daño persiste?')) {
    throw new Error('NO AVANZÓ a la fase de revisión. Texto actual: ' + textoRevisar.slice(0, 200));
  }
  console.log('OK fase portada → revisar (botón continuar funciona)');

  // Marcar "Sí, persiste" y guardar → debería pasar a fase "nuevos"
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Sí, persiste')).click();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Guardar y finalizar')).click();
  });
  await new Promise(r => setTimeout(r, 400));
  const textoNuevos = await page.evaluate(() => document.body.innerText);
  if (!textoNuevos.includes('nuevos hallazgos')) throw new Error('No avanzó a la fase de nuevos hallazgos');
  console.log('OK fase revisar → nuevos');

  // "No hay nuevos — Finalizar" → fase listo
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Finalizar')).click();
  });
  await new Promise(r => setTimeout(r, 400));
  const textoListo = await page.evaluate(() => document.body.innerText);
  if (!textoListo.includes('Completar inspección')) throw new Error('No avanzó a la fase final');
  console.log('OK fase nuevos → listo');

  if (erroresJs.length) throw new Error('Errores JS en la página: ' + erroresJs.join(' | '));

  // Limpieza: borrar las inspecciones de prueba
  await page.evaluate(async (revId) => {
    const insps = await fetch('/api/inspecciones').then(r => r.json());
    for (const i of insps.filter(x => x.equipo === 'TEST-REV')) {
      await fetch(`/api/inspecciones/${i.id}`, { method: 'DELETE' });
    }
  }, inspId);

  await browser.close();
  console.log('TODO OK — flujo de revisión guiada avanza correctamente y sin errores JS.');
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
