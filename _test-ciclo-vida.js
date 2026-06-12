// Verifica la UI del ciclo de vida: badge + bottom sheet + timeline en el
// detalle del hallazgo, y la vista /seguimiento del supervisor. Mockea /api.
const puppeteer = require('puppeteer');

const SUPERVISOR = { usuario: { id: 2, nombre: 'Cuenta demo', username: 'demo@chaba.test', rol: 'supervisor' } };
const INSPECCION = { id: 1, equipo: 'Caex-203', estado: 'en_curso', plantilla_id: 4 };
const PLANTILLA = { id: 4, diagramas: [] };
const HALLAZGO = {
  id: 9, numero: 1, inspeccion_id: 1, criticidad: 'alta', preexistencia: 'si',
  tipo_dano: 'Fisura', zona_id: null, estado: 'en_reparacion',
  fecha_estado_cambio: '2026-06-09T10:00:00.000Z', sistema: 'Chasis principal',
  sector: 'Top — vista superior', codigo: 'ZA01LHT', descripcion_dano: null,
  trabajo_realizar: null, recomendacion: null, tiempo_reparacion: '8 hrs',
  recursos: null, fotos: [], marcas: [], fotos_anteriores: [],
};
const HISTORIAL = [
  { id: 2, estado_anterior: 'detectado', estado_nuevo: 'en_reparacion', usuario: 'Cuenta demo', comentario: 'Programada con maestranza', fecha: '2026-06-09T10:00:00.000Z' },
  { id: 1, estado_anterior: null, estado_nuevo: 'detectado', usuario: 'Inspector de prueba 1', comentario: null, fecha: '2026-06-08T09:30:00.000Z' },
];
const hace = (d) => new Date(Date.now() - d * 86400000).toISOString();
const ABIERTOS = [
  { id: 9, inspeccion_id: 1, numero: 1, criticidad: 'alta', estado: 'detectado', tipo_dano: 'Fisura', tiempo_reparacion: 12, recursos: 2, sistema: 'Chasis principal', sector: 'Top', codigo: 'ZA01LHT', fecha_estado_cambio: hace(6), creado_en: hace(6), equipo: 'Caex-203', ot: 'OT-4512', inspector: 'Inspector de prueba 1' },
  { id: 10, inspeccion_id: 1, numero: 2, criticidad: 'media', estado: 'en_reparacion', tipo_dano: 'Corrosión', tiempo_reparacion: '8 hrs', recursos: '3 personas', sistema: 'Tolva', sector: 'Visera', codigo: null, fecha_estado_cambio: hace(9), creado_en: hace(12), equipo: 'Caex-40', ot: 'OT-4498', inspector: 'Cuenta demo' },
  { id: 11, inspeccion_id: 2, numero: 1, criticidad: 'baja', estado: 'resuelto', tipo_dano: 'Desgaste', tiempo_reparacion: null, recursos: null, sistema: 'Chasis', sector: 'Bottom', codigo: null, fecha_estado_cambio: hace(1), creado_en: hace(3), equipo: 'Bull-03', ot: null, inspector: 'Inspector de prueba 1' },
];

(async () => {
  const navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  async function preparar(p) {
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const url = req.url();
      const json = (b) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
      if (url.includes('/api/auth/me')) json(SUPERVISOR);
      else if (url.includes('/api/hallazgos/abiertos')) json(ABIERTOS);
      else if (url.includes('/api/hallazgos/9/historial')) json(HISTORIAL);
      else if (url.includes('/api/hallazgos/9/estado')) {
        json({ ...HALLAZGO, estado: 'resuelto', fecha_estado_cambio: new Date().toISOString() });
      } else if (url.includes('/api/hallazgos/9')) json(HALLAZGO);
      else if (url.includes('/api/plantillas/4/zonas')) json([]);
      else if (url.includes('/api/plantillas/4')) json(PLANTILLA);
      else if (url.includes('/api/inspecciones/1')) json(INSPECCION);
      else if (url.includes('/api/')) json([]);
      else req.continue();
    });
    const errores = [];
    p.on('pageerror', (e) => errores.push(String(e)));
    return errores;
  }

  // 1) Detalle del hallazgo: badge + timeline + sheet
  let p = await navegador.newPage();
  await p.setViewport({ width: 412, height: 915 });
  const err1 = await preparar(p);
  await p.goto('http://localhost:5174/inspecciones/1/hallazgos/9', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('::-p-text(En reparación)');
  await p.waitForSelector('::-p-text(Programada con maestranza)');
  await p.screenshot({ path: '_captura-estado-detalle.png' });
  await p.click('::-p-text(En reparación)'); // abre el sheet
  await p.waitForSelector('::-p-text(Cambiar estado del hallazgo)');
  await p.screenshot({ path: '_captura-estado-sheet.png' });
  await p.click('::-p-text(Resuelto)');
  await p.type('textarea', 'Soldadura completada');
  await p.click('::-p-text(Confirmar cambio)');
  await p.waitForSelector('::-p-text(Resuelto)');
  console.log('Detalle OK | errores:', err1.length ? err1 : 'ninguno');
  await p.close();

  // 2) Seguimiento móvil (cards) y escritorio (tabla)
  p = await navegador.newPage();
  await p.setViewport({ width: 412, height: 915 });
  const err2 = await preparar(p);
  await p.goto('http://localhost:5174/seguimiento', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('::-p-text(Seguimiento de hallazgos abiertos)');
  await p.screenshot({ path: '_captura-seguimiento-movil.png' });
  await p.close();

  p = await navegador.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const err3 = await preparar(p);
  await p.goto('http://localhost:5174/seguimiento', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('::-p-text(Días abierto)');
  await p.waitForSelector('::-p-text(20 horas)');
  await p.waitForSelector('::-p-text(5 personas)');
  await p.screenshot({ path: '_captura-seguimiento-desktop.png' });
  console.log('Seguimiento OK | errores:', [...err2, ...err3].length ? [...err2, ...err3] : 'ninguno');
  await p.close();

  await navegador.close();
})();
