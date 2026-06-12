// Construye el HTML del informe de una inspección y lo convierte a PDF
// usando Chromium sin cabeza (Puppeteer) — todo corre en el propio servidor,
// sin depender de servicios externos de pago.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { formatHoras, formatPersonas } = require('./utils/formatHallazgo');

const MIME_POR_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const ETIQUETAS_CRITICIDAD = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const ETIQUETAS_ESTADO_CICLO = {
  detectado: 'Detectado',
  en_reparacion: 'En reparación',
  resuelto: 'Resuelto',
  verificado: 'Verificado ✓'
};
const ETIQUETAS_PREEXISTENCIA = { si: 'Sí', no: 'No', na: 'No aplica / sin datos previos' };

function imagenComoDataUri(rutaAbs) {
  if (!rutaAbs || !fs.existsSync(rutaAbs)) return null;
  const mime = MIME_POR_EXT[path.extname(rutaAbs).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(rutaAbs).toString('base64')}`;
}

// ---------- Dimensiones de imagen (sin dependencias externas) ----------
// Leemos ancho/alto directo de las cabeceras del archivo para conocer la
// orientación real de cada foto al momento de armar el informe.

function dimensionesImagen(buf) {
  // PNG: firma de 8 bytes y luego IHDR con ancho/alto big-endian
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: recorrer segmentos hasta el SOF (Start Of Frame)
  if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i + 4 <= buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xFF) { i++; continue; }                              // relleno
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD9)) { i += 2; continue; } // marcadores sin longitud
      if (m === 0xDA) break;                                          // empieza el flujo comprimido
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        if (i + 9 <= buf.length) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        break;
      }
      i += 2 + len;
    }
    return null;
  }
  // WebP: contenedor RIFF con chunk VP8 / VP8L / VP8X
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (fmt === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3FFF) + 1, h: ((b >>> 14) & 0x3FFF) + 1 };
    }
  }
  return null;
}

// Orientación EXIF de un JPEG (las fotos de celular suelen guardarse "giradas"
// y Chromium las endereza al renderizar; aquí detectamos ese caso para que el
// cálculo de orientación coincida con lo que se ve en el informe).
function orientacionExif(buf) {
  try {
    let i = 2;
    while (i + 4 <= buf.length) {
      if (buf[i] !== 0xFF) break;
      const m = buf[i + 1];
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD9)) { i += 2; continue; }
      if (m === 0xDA) break;
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      if (m === 0xE1 && i + 10 + 8 <= buf.length && buf.toString('ascii', i + 4, i + 10) === 'Exif\0\0') {
        const t = i + 10; // cabecera TIFF
        const le = buf.toString('ascii', t, t + 2) === 'II';
        const u16 = (o) => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
        const u32 = (o) => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
        const ifd = t + u32(t + 4);
        if (ifd + 2 > buf.length) return 1;
        const n = u16(ifd);
        for (let k = 0; k < n; k++) {
          const e = ifd + 2 + k * 12;
          if (e + 12 > buf.length) return 1;
          if (u16(e) === 0x0112) return u16(e + 8) || 1;
        }
        return 1;
      }
      i += 2 + len;
    }
  } catch { /* archivo raro: asumimos sin rotación */ }
  return 1;
}

// Devuelve { src: dataURI, ratio: ancho/alto tal como se verá renderizada }
function infoImagen(rutaAbs) {
  if (!rutaAbs || !fs.existsSync(rutaAbs)) return null;
  const buf = fs.readFileSync(rutaAbs);
  const mime = MIME_POR_EXT[path.extname(rutaAbs).toLowerCase()] || 'application/octet-stream';
  let ratio = null;
  const dim = dimensionesImagen(buf);
  if (dim && dim.w > 0 && dim.h > 0) {
    ratio = dim.w / dim.h;
    if (mime === 'image/jpeg') {
      const o = orientacionExif(buf);
      if (o >= 5 && o <= 8) ratio = dim.h / dim.w; // EXIF la gira 90°: invertir
    }
  }
  return { src: `data:${mime};base64,${buf.toString('base64')}`, ratio };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function conSaltosDeLinea(s) {
  return esc(s).replace(/\r?\n/g, '<br>');
}

function formatoFecha(f) {
  if (!f) return '—';
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return esc(f);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// "Jueves 11 de junio de 2026 · 14:32" en hora de Chile (los timestamps van en UTC)
const TZ_CHILE = 'America/Santiago';
function formatoFechaHoraLarga(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parte = (op) => new Intl.DateTimeFormat('es-CL', { timeZone: TZ_CHILE, ...op }).format(d);
  const dia = parte({ weekday: 'long' });
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${parte({ day: 'numeric' })} de ${parte({ month: 'long' })} de ${parte({ year: 'numeric' })} · ${parte({ hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

function duracionEntre(inicioIso, finIso) {
  if (!inicioIso || !finIso) return null;
  const ms = new Date(finIso).getTime() - new Date(inicioIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutos = Math.round(ms / 60000);
  const h = Math.floor(minutos / 60);
  return h > 0 ? `${h}h ${minutos % 60}min` : `${minutos % 60}min`;
}

const ESTILOS = `
  @page { size: A4; margin: 0; }
  @page diagrama-page { size: A4 landscape; margin: 0; }
  /* Las hojas de hallazgos tienen margen vertical propio para que las tarjetas
     que continúan en la página siguiente no queden pegadas al borde. */
  @page hallazgos-page { size: A4; margin: 12mm 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", system-ui, Roboto, Arial, sans-serif;
    color: #0f172a;
    background: #fff;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  section.hoja { padding: 16mm 15mm; }
  section.salto { page-break-before: always; }

  h1, h2, h3 { color: #1e3a5f; }
  h1 { font-size: 20pt; }
  h2.titulo-seccion {
    font-size: 13pt;
    border-bottom: 2px solid #1e3a5f;
    padding-bottom: 4px;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: .03em;
  }
  h3.subtitulo { font-size: 11.5pt; margin: 14px 0 6px; color: #1e3a5f; }
  p.parrafo { margin-bottom: 6px; white-space: normal; }
  .muted { color: #64748b; }

  /* Portada */
  .marca-app { font-size: 11pt; font-weight: 700; color: #1e3a5f; letter-spacing: .08em; text-transform: uppercase; }
  .titulo-informe { font-size: 22pt; margin-top: 14px; line-height: 1.25; }
  .subtitulo-informe { font-size: 13pt; color: #475569; margin-top: 6px; }
  .clara, .clara * { color: #fff !important; }

  .ficha-portada {
    margin-top: 36px;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    overflow: hidden;
  }
  .ficha-portada .fila { display: flex; border-bottom: 1px solid #e2e8f0; }
  .ficha-portada .fila:last-child { border-bottom: none; }
  .ficha-portada .clave {
    width: 38%; background: #f1f5f9; font-weight: 700; color: #334155;
    padding: 8px 14px; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .03em;
  }
  .ficha-portada .valor { width: 62%; padding: 8px 14px; }
  .pie-portada { font-size: 8.5pt; color: #94a3b8; text-align: center; margin-top: 24px; }

  /* Portada sin foto: diseño clásico con ficha de datos */
  .portada {
    display: flex; flex-direction: column; height: 263mm; justify-content: space-between;
  }
  /* Portada con foto: imagen del equipo a página completa con gradiente oscuro superpuesto.
     El texto y la ficha de datos aparecen en la parte inferior sobre el gradiente. */
  .portada-foto {
    position: relative; height: 297mm; padding: 0; overflow: hidden;
    background-size: cover; background-position: center;
    display: flex; align-items: flex-end;
  }
  .velo-portada {
    position: absolute; inset: 0;
    background: linear-gradient(190deg, rgba(15,23,42,.05) 25%, rgba(15,23,42,.96) 100%);
  }
  .contenido-portada {
    position: relative; z-index: 1; width: 100%; padding: 14mm 15mm 16mm;
  }
  .contenido-portada .marca-app { color: #94a3b8; }
  .contenido-portada .titulo-informe { color: #f8fafc; }
  .contenido-portada .subtitulo-informe { color: #94a3b8; }
  .contenido-portada .ficha-portada {
    margin-top: 24px;
    background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.2);
    border-radius: 10px; overflow: hidden;
  }
  .contenido-portada .ficha-portada .fila {
    display: flex; border-bottom: 1px solid rgba(255,255,255,.1);
  }
  .contenido-portada .ficha-portada .fila:last-child { border-bottom: none; }
  .contenido-portada .ficha-portada .clave {
    width: 38%; background: rgba(255,255,255,.07); color: #94a3b8;
    padding: 7px 14px; font-size: 9pt; font-weight: 700; text-transform: uppercase;
  }
  .contenido-portada .ficha-portada .valor {
    width: 62%; color: #f1f5f9; padding: 7px 14px;
  }

  /* Datos generales y páginas fijas */
  .tabla-datos { width: 100%; border-collapse: collapse; }
  .tabla-datos td {
    border: 1px solid #e2e8f0;
    padding: 7px 12px;
    vertical-align: top;
    font-size: 9.8pt;
  }
  .tabla-datos td.clave { width: 34%; background: #f8fafc; font-weight: 700; color: #334155; }

  /* ---------- Registros de inspección (hallazgos): tarjetas ---------- */
  section.hoja-hallazgos {
    page: hallazgos-page;
    padding: 4mm 15mm;
  }
  .tarjeta-hallazgo {
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 12px 16px 14px;
    margin-bottom: 14px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .th-cab { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
  .th-num { font-size: 13pt; font-weight: 800; color: #1e3a5f; white-space: nowrap; }
  .th-ubicacion { flex: 1; color: #64748b; font-size: 10pt; }
  .pill-criticidad {
    padding: 3px 12px; border-radius: 999px; white-space: nowrap;
    font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: .04em;
  }
  .pill-criticidad.alta  { background: #fee2e2; color: #dc2626; }
  .pill-criticidad.media { background: #fef3c7; color: #92400e; }
  .pill-criticidad.baja  { background: #dcfce7; color: #15803d; }

  .pill-estado {
    padding: 3px 12px; border-radius: 999px; white-space: nowrap;
    font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: .04em;
  }
  .pill-estado.detectado     { background: #fee2e2; color: #ef4444; }
  .pill-estado.en_reparacion { background: #fef3c7; color: #b45309; }
  .pill-estado.resuelto      { background: #dbeafe; color: #3b82f6; }
  .pill-estado.verificado    { background: #dcfce7; color: #16a34a; }
  .sello-verificado {
    display: inline-block; margin: 4px 0 6px; padding: 5px 14px;
    border: 2.5px solid #22c55e; border-radius: 6px; color: #15803d;
    font-size: 10pt; font-weight: 800; letter-spacing: .06em;
    transform: rotate(-2deg);
  }
  .estado-fecha { font-size: 8.5pt; color: #6b7280; margin-left: 6px; }

  .th-campos p.campo { margin-bottom: 3px; font-size: 10pt; line-height: 1.45; }
  .th-campos p.campo b { color: #1e3a5f; font-weight: 700; }
  .th-dos-col { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; }
  .th-dos-col p.campo { margin-bottom: 3px; }

  /* Fotos del hallazgo: alto fijo y ancho automático = proporción intacta,
     nunca recortadas ni estiradas. */
  .th-fotos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .th-fotos img {
    height: 75mm; width: auto; max-width: 100%;
    object-fit: contain;
    border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;
    display: block;
  }

  /* Diagramas con marcas — página landscape para máxima visibilidad */
  .hoja-diagrama {
    page: diagrama-page;
    height: 210mm;
    display: flex;
    flex-direction: column;
    break-inside: avoid;
    overflow: hidden;
  }
  /* Franja superior: título, hallazgos y leyenda */
  .diagrama-cabecera {
    flex: 0 0 60mm;
    padding: 8mm 12mm 6mm;
    border-bottom: 2px solid #e2e8f0;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  /* Franja inferior: imagen a máximo tamaño posible */
  .diagrama-imagen-area {
    flex: 1;
    min-height: 0;
    padding: 6mm 12mm 6mm;
    overflow: hidden;
  }
  /* inline-block: el contenedor se ajusta exactamente al tamaño renderizado
     de la imagen, garantizando que left/top % de las marcas sean correctos. */
  .diagrama-render {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
  }
  .diagrama-render img {
    display: block;
    max-width: 100%;
    max-height: 118mm;
    width: auto;
    height: auto;
  }
  .marca-pdf {
    position: absolute;
    width: 20px; height: 20px;
    margin-left: -10px; margin-top: -10px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 800; font-size: 10px;
    border: 2px solid #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,.45);
  }
  .marca-pdf.alta { background: #dc2626; }
  .marca-pdf.media { background: #f59e0b; }
  .marca-pdf.baja { background: #16a34a; }
  .leyenda-criticidad { display: flex; gap: 16px; margin-top: 8px; font-size: 8.8pt; color: #475569; }
  .leyenda-criticidad span.punto {
    display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-right: 5px; vertical-align: middle;
  }

  /* Borrador sin firmar: aviso en portada + franja fija al pie de cada página */
  .banda-borrador-portada {
    background: #f59e0b; color: #78350f; text-align: center; border-radius: 8px;
    font-weight: 800; font-size: 9.5pt; letter-spacing: .08em; text-transform: uppercase;
    padding: 6px 0; margin-bottom: 14px;
  }
  .banda-borrador-pie {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #f59e0b; color: #78350f; text-align: center;
    font-weight: 800; font-size: 8pt; letter-spacing: .1em; text-transform: uppercase;
    padding: 3px 0; z-index: 999;
  }
  body.sin-firmar .hoja,
  body.sin-firmar .hoja-hallazgos {
    padding-bottom: 9mm;
  }

  /* Firma y responsabilidad */
  .firma-manuscrita {
    max-width: 280px; max-height: 120px; border: 1px solid #cbd5e1;
    border-radius: 8px; background: #fff; padding: 6px; display: block;
  }
`;

function bloquePortada({ inspeccion, plantilla, inspector, fotoPortada }) {
  // Inspecciones antiguas (sin fecha_inicio) muestran solo la fecha clásica.
  const inicio = formatoFechaHoraLarga(inspeccion.fecha_inicio);
  const cierre = formatoFechaHoraLarga(inspeccion.fecha_cierre);
  const duracion = duracionEntre(inspeccion.fecha_inicio, inspeccion.fecha_cierre);
  const gps = (inspeccion.latitud != null && inspeccion.longitud != null)
    ? `${Number(inspeccion.latitud).toFixed(4)}, ${Number(inspeccion.longitud).toFixed(4)}${inspeccion.precision_gps != null ? `  (±${Math.round(inspeccion.precision_gps)}m)` : ''}`
    : 'No registrada';

  const filasFecha = inicio
    ? [
        ['Fecha de inicio', inicio],
        ['Fecha de cierre', cierre || '—'],
        ...(duracion ? [['Duración', duracion]] : []),
        ['Ubicación GPS', gps]
      ]
    : [['Fecha de inspección', formatoFecha(inspeccion.fecha)]];

  const filas = [
    ['Equipo', inspeccion.equipo],
    ['Modelo / tipo', `${plantilla.modelo}${plantilla.tipo ? ' — ' + plantilla.tipo : ''}`],
    ['Orden de trabajo (OT)', inspeccion.ot || '—'],
    ...filasFecha,
    ['Horómetro', inspeccion.horometro || '—'],
    ['Inspector responsable', inspector.nombre],
    ['Cantidad de hallazgos registrados', String(inspeccion.hallazgos_total)]
  ];
  const ficha = `
    <div class="ficha-portada">
      ${filas.map(([clave, valor]) => `
        <div class="fila">
          <div class="clave">${esc(clave)}</div>
          <div class="valor">${esc(valor)}</div>
        </div>`).join('')}
    </div>`;

  const banda = inspeccion.firmada
    ? ''
    : '<div class="banda-borrador-portada">Borrador — sin firmar · Pendiente de firma digital</div>';

  // Portada con foto: imagen a página completa con gradiente oscuro y datos superpuestos.
  if (fotoPortada) {
    return `
      <section class="hoja portada-foto" style="background-image: url('${fotoPortada}')">
        <div class="velo-portada"></div>
        <div class="contenido-portada">
          ${banda}
          <div class="marca-app">CHABA · Inspecciones Estructurales</div>
          <h1 class="titulo-informe">Informe de Inspección Estructural<br>${esc(plantilla.modelo)} — ${esc(inspeccion.equipo)}</h1>
          <p class="subtitulo-informe">${esc(plantilla.tipo || '')}</p>
          ${ficha}
        </div>
      </section>`;
  }

  return `
    <section class="hoja portada">
      <div>
        ${banda}
        <div class="marca-app">CHABA · Inspecciones Estructurales</div>
        <h1 class="titulo-informe">Informe de Inspección Estructural</h1>
        <p class="subtitulo-informe">${esc(plantilla.modelo)}${plantilla.tipo ? ' · ' + esc(plantilla.tipo) : ''}</p>
        ${ficha}
      </div>
      <p class="pie-portada">Generado automáticamente por la app de Inspecciones Estructurales — ${esc(new Date().toLocaleDateString('es-CL'))}</p>
    </section>`;
}

function bloqueDatosGenerales(plantilla) {
  const entradas = Object.entries(plantilla.datos_generales || {}).filter(([, v]) => v != null && String(v).trim() !== '');
  if (!entradas.length) return '';
  return `
    <section class="hoja salto">
      <h2 class="titulo-seccion">Datos generales del equipo</h2>
      <table class="tabla-datos">
        ${entradas.map(([clave, valor]) => `
          <tr><td class="clave">${esc(clave)}</td><td>${esc(valor)}</td></tr>
        `).join('')}
      </table>
    </section>`;
}

function bloquesPaginasFijas(plantilla) {
  const paginas = (plantilla.paginas_fijas || []).filter(p => p && (p.titulo || p.contenido));
  return paginas.map(p => `
    <section class="hoja salto">
      <h2 class="titulo-seccion">${esc(p.titulo || 'Información técnica')}</h2>
      <p class="parrafo">${conSaltosDeLinea(p.contenido || '')}</p>
    </section>`).join('');
}

function bloqueDiagramas(diagramas) {
  if (!diagramas.length) return '';
  // Todos los diagramas de referencia de la plantilla al final del informe,
  // uno por página, con las marcas de hallazgos superpuestas donde aplica.
  return diagramas.map(d => {
    const tieneMarcas = d.marcas && d.marcas.length;
    return `
    <section class="hoja-diagrama salto">
      <div class="diagrama-cabecera">
        <h2 class="titulo-seccion" style="margin-bottom:4px">Diagrama de referencia — ${esc(d.nombre)}</h2>
        ${tieneMarcas ? `
        <p class="parrafo muted" style="font-size:9pt;margin-bottom:4px">Hallazgos marcados: ${d.marcas.map(m => `N°${m.numero}`).join(', ')}</p>
        <div class="leyenda-criticidad">
          <span><span class="punto" style="background:#dc2626"></span>Criticidad alta</span>
          <span><span class="punto" style="background:#f59e0b"></span>Criticidad media</span>
          <span><span class="punto" style="background:#16a34a"></span>Criticidad baja</span>
        </div>` : ''}
      </div>
      <div class="diagrama-imagen-area">
        <div class="diagrama-render">
          ${d.imagen ? `<img src="${d.imagen}" alt="${esc(d.nombre)}">` : '<p class="muted" style="padding:20px">Imagen no disponible</p>'}
          ${(d.marcas || []).map(m => `
            <div class="marca-pdf ${esc(m.criticidad)}" style="left:${m.x_pct}%; top:${m.y_pct}%">${esc(m.numero)}</div>
          `).join('')}
        </div>
      </div>
    </section>`;
  }).join('\n');
}

// Tarjeta de un hallazgo: N° + ubicación + criticidad, campos y fotos en miniatura
function tarjetaHallazgo(h) {
  const ubicacion = [h.sistema, h.sector].filter(v => v && v.trim()).join(' — ')
    + (h.codigo && h.codigo.trim() ? ` · Código ${h.codigo}` : '');

  const dosColumnas = [
    h.trabajo_realizar && ['Trabajo a realizar', h.trabajo_realizar],
    h.recomendacion && ['Recomendación', h.recomendacion],
    // Siempre presentes: "No especificado" cuando el valor es 0 o null
    ['Tiempo estimado', formatHoras(h.tiempo_reparacion)],
    ['Personas requeridas', formatPersonas(h.recursos)],
  ].filter(Boolean);

  const fotos = h.fotos || [];

  return `
    <div class="tarjeta-hallazgo">
      <div class="th-cab">
        <span class="th-num">N°${esc(String(h.numero))}</span>
        <span class="th-ubicacion">${esc(ubicacion) || '—'}</span>
        <span class="pill-criticidad ${esc(h.criticidad)}">Criticidad ${ETIQUETAS_CRITICIDAD[h.criticidad] || esc(h.criticidad)}</span>
        <span class="pill-estado ${esc(h.estado || 'detectado')}">${ETIQUETAS_ESTADO_CICLO[h.estado] || 'Detectado'}</span>${h.fecha_estado_cambio ? `<span class="estado-fecha">${esc(String(h.fecha_estado_cambio).slice(0, 10).split('-').reverse().join('-'))}</span>` : ''}
      </div>
      ${h.estado === 'verificado' ? '<div class="sello-verificado">REPARACIÓN VERIFICADA ✓</div>' : ''}
      <div class="th-campos">
        ${h.tipo_dano && h.tipo_dano.trim() ? `<p class="campo"><b>Tipo de daño:</b> ${esc(h.tipo_dano)}</p>` : ''}
        ${h.descripcion_dano && h.descripcion_dano.trim() ? `<p class="campo"><b>Descripción del daño:</b> ${conSaltosDeLinea(h.descripcion_dano)}</p>` : ''}
        ${dosColumnas.length ? `
        <div class="th-dos-col">
          ${dosColumnas.map(([clave, valor]) => `<p class="campo"><b>${esc(clave)}:</b> ${conSaltosDeLinea(valor)}</p>`).join('')}
        </div>` : ''}
        <p class="campo"><b>Preexistencia del daño:</b> ${ETIQUETAS_PREEXISTENCIA[h.preexistencia] || '—'}</p>
      </div>
      ${fotos.length ? `
      <div class="th-fotos">
        ${fotos.map(f => `<img src="${f.src}" alt="Foto hallazgo N°${esc(String(h.numero))}">`).join('')}
      </div>` : ''}
    </div>`;
}

function bloqueHallazgos(hallazgos) {
  if (!hallazgos.length) return '';
  return `
    <section class="hoja-hallazgos salto">
      <h2 class="titulo-seccion">Registros de inspección (hallazgos)</h2>
      ${hallazgos.map(h => tarjetaHallazgo(h)).join('\n')}
    </section>`;
}

// Sección final "Firma y responsabilidad": identidad del firmante, fecha/hora,
// firma manuscrita (si existe) y código de verificación del hash de integridad.
function bloqueFirma(inspeccion) {
  if (!inspeccion.firmada) return '';
  const filas = [
    ['Nombre completo', inspeccion.firma_nombre || '—'],
    ['RUT', inspeccion.firma_rut || '—'],
    ['Cargo', inspeccion.firma_cargo || '—'],
    ['Fecha y hora de firma', formatoFechaHoraLarga(inspeccion.firma_timestamp) || '—'],
    ['Código de verificación', inspeccion.firma_hash ? inspeccion.firma_hash.slice(0, 12) : '—']
  ];
  return `
    <section class="hoja salto">
      <h2 class="titulo-seccion">Firma y responsabilidad</h2>
      <div class="ficha-portada">
        ${filas.map(([clave, valor]) => `
          <div class="fila">
            <div class="clave">${esc(clave)}</div>
            <div class="valor">${esc(valor)}</div>
          </div>`).join('')}
      </div>
      ${inspeccion.firma_imagen ? `
      <h3 class="subtitulo">Firma manuscrita</h3>
      <img class="firma-manuscrita" src="${esc(inspeccion.firma_imagen)}" alt="Firma manuscrita del responsable">
      ` : ''}
      <p class="parrafo muted" style="margin-top:14px; font-size:8.8pt">
        Este informe fue firmado digitalmente por el responsable indicado mediante su PIN personal.
        El código de verificación permite comprobar que el contenido no ha sido modificado desde el
        momento de la firma. Cualquier corrección posterior invalida esta firma y requiere una nueva
        firma para volver a certificar el documento.
      </p>
    </section>`;
}

function construirHtmlInforme({ inspeccion, plantilla, hallazgos, diagramas, inspector, fotoPortada }) {
  const cuerpo = [
    bloquePortada({ inspeccion: { ...inspeccion, hallazgos_total: hallazgos.length }, plantilla, inspector, fotoPortada }),
    bloqueDatosGenerales(plantilla),
    bloquesPaginasFijas(plantilla),
    bloqueHallazgos(hallazgos),
    bloqueDiagramas(diagramas),
    bloqueFirma(inspeccion)
  ].join('\n');

  const bandaPie = inspeccion.firmada ? '' : '<div class="banda-borrador-pie">Borrador — sin firmar</div>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe — ${esc(inspeccion.equipo)}</title>
<style>${ESTILOS}</style>
</head>
<body${inspeccion.firmada ? '' : ' class="sin-firmar"'}>
${cuerpo}
${bandaPie}
</body>
</html>`;
}

async function generarPdfBuffer(html) {
  const opciones = {
    headless: true,
    // Comunicación con Chromium por pipe en vez del WebSocket de depuración:
    // evita cuelgues cuando un proxy/VPN/firewall interfiere con conexiones loopback.
    pipe: true,
    timeout: 60000,
    protocolTimeout: 120000,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) opciones.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const navegador = await puppeteer.launch(opciones);
  try {
    const pagina = await navegador.newPage();
    // El HTML es autocontenido (todas las imágenes van como data URI), no hay
    // recursos de red que esperar: 'load' es suficiente y más confiable que 'networkidle0'.
    await pagina.setContent(html, { waitUntil: 'load', timeout: 60000 });
    const datos = await pagina.pdf({ format: 'A4', printBackground: true, timeout: 120000 });
    return Buffer.from(datos); // page.pdf() devuelve Uint8Array; Express necesita un Buffer para enviarlo como binario
  } finally {
    await navegador.close();
  }
}

module.exports = { construirHtmlInforme, generarPdfBuffer, imagenComoDataUri, infoImagen };
