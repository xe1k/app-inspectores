// Prueba del ZonaSelector dentro del wizard: criticidad MEDIA -> zona ZA
// (sugerencia ALTA) -> confirmar sugerencia -> guardar. Mockea /api.
const puppeteer = require('puppeteer');

const USUARIO = { usuario: { id: 1, nombre: 'Gonzalo Astargo', username: 'g.astargo84@gmail.com' } };
const INSPECCION = { id: 1, equipo: 'Caex-203', estado: 'en_curso', plantilla_id: 4, hallazgos: [] };
const ZONAS = [
  { id: 70, sistema: 'Chasis principal', sector: 'Top — vista superior', codigo: 'ZA01LHT', descripcion: 'Zona de asentamiento PAD de tolva', criticidad_base: 'alta', diagrama_id: null, coord_x: null, coord_y: null },
  { id: 71, sistema: 'Chasis principal', sector: 'Top — vista superior', codigo: 'ZC01LHT', descripcion: null, criticidad_base: null, diagrama_id: null, coord_x: null, coord_y: null },
  { id: 72, sistema: 'Chasis principal', sector: 'Top — vista superior', codigo: 'DTW01LH', descripcion: 'Soldadura Drive Tube chasis', criticidad_base: null, diagrama_id: null, coord_x: null, coord_y: null },
  { id: 10, sistema: 'Chasis principal', sector: 'LH Side — exterior izquierdo', codigo: 'ZA01LHO', descripcion: 'Zona de asentamiento PAD de tolva', criticidad_base: 'alta', diagrama_id: null, coord_x: null, coord_y: null },
];

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
    } else if (url.includes('/api/plantillas/4/zonas')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ZONAS) });
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
  await p.waitForSelector('::-p-text(MEDIA)');
  await p.click('::-p-text(MEDIA)');
  await p.waitForSelector('::-p-text(Fisura)');
  await p.click('::-p-text(Fisura)');

  // Paso 3 con ZonaSelector
  await p.waitForSelector('::-p-text(Toca para elegir el sistema)');
  await p.click('::-p-text(Toca para elegir el sistema)');
  await p.waitForSelector('[role="option"] ::-p-text(Chasis principal)');
  await p.click('[role="option"] ::-p-text(Chasis principal)');
  await new Promise((r) => setTimeout(r, 300));
  await p.click('::-p-text(Toca para elegir el sector)');
  await p.waitForSelector('[role="option"] ::-p-text(Top — vista superior)');
  await p.click('[role="option"] ::-p-text(Top — vista superior)');
  await new Promise((r) => setTimeout(r, 300));
  await p.screenshot({ path: '_captura-zonas-chips.png' });

  // Elegir zona ZA -> debe aparecer la sugerencia de criticidad ALTA
  await p.click('::-p-text(ZA01LHT)');
  await p.waitForSelector('::-p-text(Esta zona suele tener criticidad ALTA)');
  await p.screenshot({ path: '_captura-zonas-sugerencia.png' });
  await p.click('::-p-text(Usar ALTA)');
  await new Promise((r) => setTimeout(r, 200));

  await p.type('#tiempoHrs', '8');
  await p.click('::-p-text(Continuar →)');
  await p.waitForSelector('::-p-text(Revisa antes de guardar)');
  await p.screenshot({ path: '_captura-zonas-confirmacion.png' });
  await p.click('::-p-text(Guardar hallazgo)');
  await new Promise((r) => setTimeout(r, 800));

  console.log('POST:', JSON.stringify(cuerpoPost, null, 1));
  console.log('URL final:', p.url());
  console.log('Errores:', errores.length ? errores : 'ninguno');
  await navegador.close();
})();
