-- ============================================================
--  Esquema de la base de datos - App de Inspecciones Estructurales
--  Objetivo central: que cada inspector registre hallazgos en
--  terreno (con fotos y diagramas marcados) y obtenga el informe
--  en PDF de forma automática, sin armar todo a mano en PowerPoint.
-- ============================================================

-- Inspectores que usan la app (inician sesión). Cada uno es dueño
-- de sus propias inspecciones; no hay flujo de revisión entre ellos.
CREATE TABLE IF NOT EXISTS usuarios (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT NOT NULL UNIQUE,
  nombre          TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  rol             TEXT NOT NULL DEFAULT 'inspector' CHECK (rol IN ('inspector','supervisor','admin','gerencial')),
  activo          INTEGER NOT NULL DEFAULT 1,
  -- Identidad para la firma digital de informes (trazabilidad legal)
  nombre_completo TEXT NOT NULL DEFAULT '',  -- nombre legal completo; cae a "nombre" si está vacío
  rut             TEXT,                      -- identificador chileno, formato 12.345.678-9
  cargo           TEXT,                      -- ej. "Inspector estructural"
  firma_imagen    TEXT,                      -- firma manuscrita como PNG en base64 (opcional)
  pin_hash        TEXT,                      -- hash bcrypt del PIN de 4 dígitos para confirmar firmas
  creado_en       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Plantilla por modelo de equipo (980E, 797F, D10T, tolva DT, ...).
-- Contiene todo el contenido FIJO que se repite en cada informe de
-- ese modelo: datos generales por defecto y páginas técnicas
-- (método de inspección, equipos NDT, advertencias, etc.).
-- El catálogo de equipos es variable, así que cualquier inspector
-- puede crear una plantilla nueva cuando aparece un modelo distinto.
CREATE TABLE IF NOT EXISTS plantillas_equipo (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo                TEXT NOT NULL,            -- ej. "980E"
  tipo                  TEXT,                     -- ej. "Chasis", "Tolva"
  datos_generales_json  TEXT,                     -- checklist por defecto (clave: valor)
  paginas_fijas_json    TEXT,                     -- [{ titulo, contenido }] páginas técnicas
  creado_por            INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en             TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Diagramas de referencia de una plantilla (vistas con cuadrantes/zonas)
-- sobre los que el inspector marca dónde se ubica cada hallazgo.
-- El archivo vive en disco, en data/plantillas/<plantilla_id>/.
CREATE TABLE IF NOT EXISTS plantilla_diagramas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plantilla_id  INTEGER NOT NULL REFERENCES plantillas_equipo(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,    -- ej. "Vista exterior izquierda"
  archivo       TEXT NOT NULL,    -- nombre del archivo de imagen en disco
  orden         INTEGER NOT NULL DEFAULT 0
);

-- Una inspección = un informe en construcción/terminado para un equipo,
-- en una fecha y OT determinadas, basada en una plantilla de modelo.
CREATE TABLE IF NOT EXISTS inspecciones (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  inspector_id        INTEGER NOT NULL REFERENCES usuarios(id),
  plantilla_id        INTEGER NOT NULL REFERENCES plantillas_equipo(id),
  equipo              TEXT NOT NULL,    -- ej. "CAEX-203"
  ot                  TEXT,
  fecha               TEXT NOT NULL,
  -- Registro automático: timestamps completos (UTC, ISO 8601) y GPS.
  -- "fecha" se mantiene tal cual para el PDF y los datos antiguos.
  fecha_inicio        TEXT,             -- momento exacto de creación
  fecha_cierre        TEXT,             -- momento en que se marcó completada
  latitud             REAL,             -- GPS al crear
  longitud            REAL,
  precision_gps       REAL,             -- precisión en metros
  ubicacion_nombre    TEXT,             -- nombre legible u "Sin GPS"
  horometro           TEXT,
  estado              TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso','completada')),
  foto_portada        TEXT,             -- nombre del archivo de la foto del equipo (portada del informe)
  pdf_archivo         TEXT,             -- nombre del PDF generado (si ya se generó)
  pdf_generado_en     TEXT,
  -- Firma digital: el inspector firma con su PIN al completar y eso congela el contenido.
  firmada             INTEGER NOT NULL DEFAULT 0,            -- boolean 0/1
  firma_usuario_id    INTEGER REFERENCES usuarios(id),
  firma_timestamp     TEXT,             -- ISO timestamp del momento de firma (siempre del servidor)
  firma_hash          TEXT,             -- SHA-256 del contenido al firmar (verificación de integridad)
  inspeccion_base_id  INTEGER REFERENCES inspecciones(id),  -- si es revisión de una anterior
  creado_en           TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Cada hallazgo es un "registro de inspección": el corazón del informe.
-- El número correlativo es el que aparece en el informe y en las marcas
-- sobre los diagramas (➊➋➌...).
CREATE TABLE IF NOT EXISTS hallazgos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  inspeccion_id      INTEGER NOT NULL REFERENCES inspecciones(id) ON DELETE CASCADE,
  numero             INTEGER NOT NULL,
  sistema            TEXT,
  sector             TEXT,
  codigo             TEXT,
  criticidad         TEXT NOT NULL CHECK (criticidad IN ('alta','media','baja')),
  tipo_dano          TEXT,
  descripcion_dano   TEXT,
  trabajo_realizar   TEXT,
  recomendacion      TEXT,
  tiempo_reparacion  TEXT,
  recursos           TEXT,
  preexistencia      TEXT CHECK (preexistencia IN ('si','no','na')),
  -- Ciclo de vida del hallazgo (seguimiento de la reparación)
  estado             TEXT NOT NULL DEFAULT 'detectado' CHECK (estado IN ('detectado','en_reparacion','resuelto','verificado')),
  fecha_estado_cambio TEXT,        -- ISO timestamp del último cambio de estado
  usuario_estado     TEXT,         -- nombre del usuario que hizo el cambio
  fecha_creacion     TEXT,         -- ISO timestamp (UTC) del momento exacto de guardar
  fecha_actualizacion TEXT,        -- ISO timestamp (UTC) de la última modificación
  -- Revisión guiada: vinculación con hallazgo anterior y resultado de la revisión
  hallazgo_origen_id INTEGER REFERENCES hallazgos(id),
  estado_revision    TEXT CHECK (estado_revision IN ('persiste','resuelto','nuevo')),
  nota_revision      TEXT,
  creado_en          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Fotos propias del hallazgo, tomadas en terreno. Archivo en disco,
-- en data/inspecciones/<inspeccion_id>/<hallazgo_id>/.
CREATE TABLE IF NOT EXISTS hallazgo_fotos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  hallazgo_id INTEGER NOT NULL REFERENCES hallazgos(id) ON DELETE CASCADE,
  archivo     TEXT NOT NULL,
  orden       INTEGER NOT NULL DEFAULT 0
);

-- Marca sobre un diagrama de la plantilla: dónde (en % relativo, para que
-- escale igual en celular/tablet/PC) se ubica este hallazgo. Mantiene el
-- mismo sistema visual que usan hoy en los informes en PowerPoint.
CREATE TABLE IF NOT EXISTS hallazgo_marcas_diagrama (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  hallazgo_id INTEGER NOT NULL REFERENCES hallazgos(id) ON DELETE CASCADE,
  diagrama_id INTEGER NOT NULL REFERENCES plantilla_diagramas(id),
  x_pct       REAL NOT NULL,   -- 0–100
  y_pct       REAL NOT NULL    -- 0–100
);

-- Catálogo de zonas técnicas por plantilla (sistema → sector → código).
-- Reemplaza el texto libre del wizard de hallazgos para evitar datos
-- inconsistentes ("chasis"/"Chasis"/"CHASIS"). Las coordenadas son
-- opcionales: si existen, la app resalta la zona sobre el diagrama.
CREATE TABLE IF NOT EXISTS zonas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  plantilla_id    INTEGER NOT NULL REFERENCES plantillas_equipo(id) ON DELETE CASCADE,
  sistema         TEXT NOT NULL,    -- ej. "Chasis principal"
  sector          TEXT NOT NULL,    -- ej. "LH Side — exterior izquierdo"
  codigo          TEXT NOT NULL,    -- ej. "ZA01LHO"
  descripcion     TEXT,             -- ej. "Zona de asentamiento tolva"
  criticidad_base TEXT CHECK (criticidad_base IN ('alta','media','baja')),
  diagrama_id     INTEGER REFERENCES plantilla_diagramas(id),  -- vista donde aplican las coordenadas
  coord_x         REAL,             -- posición X relativa (0 a 1) en el diagrama
  coord_y         REAL,             -- posición Y relativa (0 a 1) en el diagrama
  UNIQUE (plantilla_id, sistema, sector, codigo)
);

-- Auditoría de firmas: una fila por cada firma e invalidación de firma
-- (reapertura). Permite reconstruir quién firmó qué y cuándo, incluso si
-- la inspección se reabre y se vuelve a firmar varias veces.
CREATE TABLE IF NOT EXISTS auditoria_firmas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inspeccion_id INTEGER NOT NULL REFERENCES inspecciones(id) ON DELETE CASCADE,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
  accion        TEXT NOT NULL CHECK (accion IN ('firmada','invalidada')),
  timestamp     TEXT NOT NULL,    -- ISO timestamp (servidor)
  motivo        TEXT              -- obligatorio al invalidar (reabrir), NULL al firmar
);

-- Auditoría del ciclo de vida de cada hallazgo: quién cambió el estado,
-- cuándo y por qué. Se inserta una fila por cada cambio.
CREATE TABLE IF NOT EXISTS historial_hallazgo (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  hallazgo_id     INTEGER NOT NULL REFERENCES hallazgos(id) ON DELETE CASCADE,
  estado_anterior TEXT,
  estado_nuevo    TEXT NOT NULL,
  usuario         TEXT NOT NULL,
  comentario      TEXT,
  fecha           TEXT NOT NULL    -- ISO timestamp
);
