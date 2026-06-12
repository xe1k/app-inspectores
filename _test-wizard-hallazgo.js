// Recorre el wizard de nuevo hallazgo completo en viewport de celular,
// mockeando /api para no tocar la base real. Captura cada paso.
const puppeteer = require('puppeteer');

const USUARIO = { usuario: { id: 1, nombre: 'Gonzalo Astargo', username: 'g.astargo84@gmail.com' } };
const INSPECCION = { id: 1, equipo: 'Caex-203', estado: 'en_curso', plantilla_id: 1, foto_portada: null, inspeccion_base_id: null, hallazgos: [] };

(async () => {
  const navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await navegador.newPage();
  await p.setViewport({ width: 412, height: 915 });

  let cuerpoPost = null;
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/auth/me')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(USUARIO) });
    } else if (url.includes('/api/inspecciones/1')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(INSPECCION) });
    } else if (url.includes('/api/hallazgos') && req.method() === 'POST') {
      cuerpoPost = JSON.parse(req.postData());
      req.respond({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 99 }) });
    } else if (url.includes('/api/')) {
      req.respond({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      req.continue();
    }
  });

  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  await p.goto('http://localhost:5174/inspecciones/1/hallazgos/nuevo', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('::-p-text(ALTA)');
  await p.screenshot({ path: '_captura-wizard-paso1.png' });

  await p.click('::-p-text(ALTA)');
  await p.waitForSelector('::-p-text(Fisura)');
  await p.screenshot({ path: '_captura-wizard-paso2.png' });

  await p.click('::-p-text(Fisura)');
  await p.waitForSelector('::-p-text(Toca para elegir el sistema)');

  // Selectores encadenados (Radix renderiza las opciones en un portal)
  await p.click('::-p-text(Toca para elegir el sistema)');
  await p.waitForSelector('[role="option"] ::-p-text(Tolva)');
  await p.click('[role="option"] ::-p-text(Tolva)');
  await new Promise((r) => setTimeout(r, 300));
  await p.click('::-p-text(Toca para elegir el sector)');
  await p.waitForSelector('[role="option"] ::-p-text(Visera)');
  await p.click('[role="option"] ::-p-text(Visera)');
  await new Promise((r) => setTimeout(r, 300));

  await p.waitForSelector('::-p-text(Se recomienda estimar horas y personas)');
  await p.screenshot({ path: '_captura-tiempo-advertencia.png' });
  await p.type('#codigo', 'za01lho');
  await p.type('#tiempoHrs', '12');
  await p.type('#recursosCantidad', '2');
  await p.click('::-p-text(Sí)');
  await p.screenshot({ path: '_captura-wizard-paso3.png' });

  await p.click('::-p-text(Continuar →)');
  await p.waitForSelector('::-p-text(Revisa antes de guardar)');
  await p.screenshot({ path: '_captura-wizard-paso4.png' });

  await p.click('::-p-text(Guardar hallazgo)');
  await new Promise((r) => setTimeout(r, 800));

  console.log('POST enviado al backend:', JSON.stringify(cuerpoPost, null, 2));
  console.log('URL final:', p.url());
  console.log('Errores de consola:', errores.length ? errores : 'ninguno');

  await navegador.close();
})();
