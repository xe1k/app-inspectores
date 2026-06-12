// Verifica la captura de GPS/timestamp en Nueva Inspección (permiso OK y
// denegado) y la sección "Datos de registro" del detalle. Mockea /api.
const puppeteer = require('puppeteer');

const USUARIO = { usuario: { id: 1, nombre: 'Gonzalo', username: 'g@x', rol: 'inspector' } };
const PLANTILLAS = [{ id: 4, modelo: '980E', tipo: 'Chasis' }];
const DETALLE = {
  id: 7, equipo: 'Caex-203', ot: 'OT-4512', fecha: '2026-06-11', horometro: 35200,
  estado: 'completada', plantilla_modelo: '980E', plantilla_tipo: 'Chasis',
  foto_portada: null, inspeccion_base_id: null,
  fecha_inicio: '2026-06-11T17:32:07.000Z', fecha_cierre: '2026-06-11T19:45:22.000Z',
  latitud: -24.1823, longitud: -69.0531, precision_gps: 12, ubicacion_nombre: null,
  hallazgos: [],
};

(async () => {
  const navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  async function preparar(p, capturarPost) {
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const url = req.url();
      const json = (b) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
      if (url.includes('/api/auth/me')) json(USUARIO);
      else if (url.includes('/api/plantillas') && !url.includes('/zonas')) json(PLANTILLAS);
      else if (url.includes('/api/inspecciones/7')) json(DETALLE);
      else if (url.includes('/api/inspecciones') && req.method() === 'POST') {
        capturarPost?.(JSON.parse(req.postData()));
        req.respond({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 7 }) });
      } else if (url.includes('/api/')) json([]);
      else req.continue();
    });
  }

  // 1) GPS concedido
  let contexto = navegador.defaultBrowserContext();
  await contexto.overridePermissions('http://localhost:5174', ['geolocation']);
  let p = await navegador.newPage();
  await p.setGeolocation({ latitude: -24.1823, longitude: -69.0531, accuracy: 12 });
  await p.setViewport({ width: 412, height: 915 });
  let cuerpo = null;
  await preparar(p, (b) => (cuerpo = b));
  await p.goto('http://localhost:5174/inspecciones/nueva', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('::-p-text(Ubicación obtenida)');
  await p.screenshot({ path: '_captura-gps-ok.png' });
  // completar y enviar
  await p.click('::-p-text(Selecciona un modelo…)');
  await p.waitForSelector('[role="option"]');
  await p.click('[role="option"]');
  await new Promise((r) => setTimeout(r, 400));
  await p.type('#equipo', 'CAEX-203');
  await p.click('::-p-text(Iniciar inspección)');
  await p.waitForFunction(() => location.pathname.includes('/inspecciones/7'));
  console.log('POST con GPS:', JSON.stringify({ fecha: cuerpo.fecha, fecha_inicio: !!cuerpo.fecha_inicio, latitud: cuerpo.latitud, longitud: cuerpo.longitud, precision_gps: cuerpo.precision_gps, ubicacion_nombre: cuerpo.ubicacion_nombre }));

  // 2) Detalle: sección "Datos de registro" (colapsada por defecto)
  await p.waitForSelector('::-p-text(Datos de registro)');
  const expandidoAntes = await p.$('::-p-text(Inicio de inspección)');
  await p.click('::-p-text(Datos de registro)');
  await p.waitForSelector('::-p-text(Inicio de inspección)');
  await p.waitForSelector('::-p-text(Ver en mapa)');
  const duracion = await p.$('::-p-text(2h 13min)');
  await p.evaluate(() => document.querySelector('[aria-expanded="true"]').scrollIntoView({ block: 'start' }));
  await p.screenshot({ path: '_captura-datos-registro.png' });
  console.log('Colapsada por defecto:', expandidoAntes ? 'NO (mal)' : 'sí', '| Duración 2h 13min:', duracion ? 'sí' : 'NO');
  await p.close();

  // 3) GPS denegado
  await contexto.overridePermissions('http://localhost:5174', []);
  p = await navegador.newPage();
  await p.setViewport({ width: 412, height: 915 });
  let cuerpo2 = null;
  await preparar(p, (b) => (cuerpo2 = b));
  await p.goto('http://localhost:5174/inspecciones/nueva', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('::-p-text(Permiso de ubicación denegado)');
  await p.screenshot({ path: '_captura-gps-denegado.png' });
  await p.click('::-p-text(Selecciona un modelo…)');
  await p.waitForSelector('[role="option"]');
  await p.click('[role="option"]');
  await new Promise((r) => setTimeout(r, 400));
  await p.type('#equipo', 'CAEX-203');
  await p.click('::-p-text(Iniciar inspección)');
  await p.waitForFunction(() => location.pathname.includes('/inspecciones/7'));
  console.log('POST sin GPS:', JSON.stringify({ latitud: cuerpo2.latitud, ubicacion_nombre: cuerpo2.ubicacion_nombre, fecha_inicio: !!cuerpo2.fecha_inicio }));
  await p.close();

  await navegador.close();
})();
