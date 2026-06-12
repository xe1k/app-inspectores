// Vista de edición de un hallazgo con zona que tiene coordenadas:
// debe seleccionar el diagrama de la zona y mostrar el círculo pulsante.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const USUARIO = { usuario: { id: 1, nombre: 'Gonzalo Astargo', username: 'g@x' } };
const INSPECCION = { id: 1, equipo: 'Caex-203', estado: 'en_curso', plantilla_id: 4 };
const PLANTILLA = {
  id: 4,
  diagramas: [
    { id: 1, nombre: 'Top', archivo: 'a.png', orden: 0 },
    { id: 2, nombre: 'Bottom', archivo: 'b.png', orden: 1 },
  ],
};
const ZONAS = [
  { id: 70, sistema: 'Chasis principal', sector: 'Top — vista superior', codigo: 'ZA01LHT', descripcion: 'Zona de asentamiento PAD de tolva', criticidad_base: 'alta', diagrama_id: 1, coord_x: 0.32, coord_y: 0.45 },
  { id: 71, sistema: 'Chasis principal', sector: 'Top — vista superior', codigo: 'ZC01LHT', descripcion: null, criticidad_base: null, diagrama_id: null, coord_x: null, coord_y: null },
];
const HALLAZGO = {
  id: 9, numero: 1, inspeccion_id: 1, criticidad: 'alta', preexistencia: 'si',
  tipo_dano: 'Fisura', zona_id: 70, sistema: 'Chasis principal',
  sector: 'Top — vista superior', codigo: 'ZA01LHT', descripcion_dano: null,
  trabajo_realizar: null, recomendacion: null, tiempo_reparacion: '8 hrs',
  recursos: null, fotos: [], marcas: [], fotos_anteriores: [],
};

const imagen = fs.readFileSync(path.join(__dirname, 'data', 'plantillas', '4', 'diagrama_slide10.png'));

(async () => {
  const navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await navegador.newPage();
  await p.setViewport({ width: 412, height: 915 });

  await p.setRequestInterception(true);
  p.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/auth/me')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(USUARIO) });
    else if (url.includes('/diagramas/') && url.includes('/imagen')) req.respond({ status: 200, contentType: 'image/png', body: imagen });
    else if (url.includes('/api/plantillas/4/zonas')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ZONAS) });
    else if (url.includes('/api/plantillas/4')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(PLANTILLA) });
    else if (url.includes('/api/hallazgos/9')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(HALLAZGO) });
    else if (url.includes('/api/inspecciones/1')) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(INSPECCION) });
    else if (url.includes('/api/')) req.respond({ status: 200, contentType: 'application/json', body: '[]' });
    else req.continue();
  });

  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  await p.goto('http://localhost:5174/inspecciones/1/hallazgos/9', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForSelector('::-p-text(Marca la ubicación en el diagrama)');
  // El diagrama activo debe ser "Top" (el de la zona) y debe existir el indicador animado
  const activo = await p.$eval('button[type="button"].bg-brand.text-white', (el) => el.textContent);
  const indicador = await p.$('.animate-ping');
  // Scroll hasta el diagrama para la captura
  await p.evaluate(() => document.querySelector('.animate-ping').scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 400));
  await p.screenshot({ path: '_captura-zona-diagrama.png' });

  console.log('Diagrama activo:', activo, '| Indicador pulsante:', indicador ? 'presente' : 'AUSENTE');
  console.log('Errores:', errores.length ? errores : 'ninguno');
  await navegador.close();
})();
