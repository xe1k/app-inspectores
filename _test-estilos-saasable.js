// Captura de pantallas para verificar el restyling SaasAble.
// Intercepta /api con datos de ejemplo para no tocar la base real.
const puppeteer = require('puppeteer');

const USUARIO = { usuario: { id: 1, nombre: 'Gonzalo Astargo', username: 'g.astargo84@gmail.com' } };
const INSPECCIONES = [
  { id: 1, equipo: 'Caex-203', plantilla_modelo: '980E', ot: 'OT-4512', fecha: '2026-06-08', horometro: 35200, estado: 'en_curso' },
  { id: 2, equipo: 'Caex-40', plantilla_modelo: '797F', ot: 'OT-4498', fecha: '2026-05-23', horometro: 61240, estado: 'completada' },
  { id: 3, equipo: 'Bull-03', plantilla_modelo: 'D10T', ot: null, fecha: '2026-05-23', horometro: null, estado: 'completada' },
];

(async () => {
  const navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  async function preparar(pagina, conSesion) {
    await pagina.setRequestInterception(true);
    pagina.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/auth/me')) {
        if (conSesion) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(USUARIO) });
        else req.respond({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'No autenticado' }) });
      } else if (url.includes('/api/inspecciones')) {
        req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(INSPECCIONES) });
      } else if (url.includes('/api/')) {
        req.respond({ status: 200, contentType: 'application/json', body: '[]' });
      } else {
        req.continue();
      }
    });
  }

  // 1. Login en celular (usuarios objetivo)
  let p = await navegador.newPage();
  await p.setViewport({ width: 412, height: 915 });
  await preparar(p, false);
  await p.goto('http://localhost:5174/login', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.screenshot({ path: '_captura-login-movil.png' });
  await p.close();

  // 2. Login en escritorio
  p = await navegador.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await preparar(p, false);
  await p.goto('http://localhost:5174/login', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.screenshot({ path: '_captura-login-desktop.png' });
  await p.close();

  // 3. Dashboard en celular
  p = await navegador.newPage();
  await p.setViewport({ width: 412, height: 915 });
  await preparar(p, true);
  await p.goto('http://localhost:5174/', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.screenshot({ path: '_captura-dashboard-movil.png' });
  await p.close();

  // 4. Dashboard en escritorio
  p = await navegador.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await preparar(p, true);
  await p.goto('http://localhost:5174/', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.screenshot({ path: '_captura-dashboard-desktop.png' });
  await p.close();

  await navegador.close();
  console.log('OK: 4 capturas generadas');
})();
