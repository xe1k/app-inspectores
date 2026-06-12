// Servidor principal de la App de Inspecciones Estructurales.
// Sirve la interfaz web (carpeta public) y la API REST.
const path = require('path');
const https = require('https');
const http = require('http');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const SqliteStore = require('better-sqlite3-session-store')(session);
const db = require('./db');

const { obtenerCert, ipsLocales } = require('./cert');
const { requireLogin, checkRol } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const plantillasRoutes = require('./routes/plantillas');
const inspeccionesRoutes = require('./routes/inspecciones');
const hallazgosRoutes = require('./routes/hallazgos');
const zonasRoutes = require('./routes/zonas');
const perfilRoutes = require('./routes/perfil');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;        // HTTPS (acceso normal)
const HTTP_PORT = Number(PORT) + 1;           // HTTP que solo redirige a HTTPS

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'cambia-esta-clave-secreta-en-produccion',
  resave: false,
  saveUninitialized: false,
  rolling: true,                              // renueva la cookie con cada request
  store: new SqliteStore({ client: db }),
  cookie: { maxAge: 1000 * 60 * 60 * 12 }    // 12 horas de inactividad
}));

// --- API ---
app.use('/api/auth', authRoutes);
app.use('/api/plantillas', requireLogin, plantillasRoutes);
app.use('/api/inspecciones', requireLogin, inspeccionesRoutes);
app.use('/api/hallazgos', requireLogin, hallazgosRoutes);
app.use('/api', requireLogin, zonasRoutes);
app.use('/api/perfil', requireLogin, perfilRoutes);
app.use('/api/dashboard', requireLogin, checkRol('gerencial', 'admin'), dashboardRoutes);

// --- SPA de React (sirve toda la interfaz en /) ---
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// En producción (nube), el proveedor maneja HTTPS — el servidor solo escucha HTTP.
// Localmente usamos HTTPS para que la cámara funcione desde celulares en la red Wi-Fi.
if (process.env.NODE_ENV === 'production') {
  http.createServer(app).listen(PORT, () => {
    console.log(`\n  App Inspecciones corriendo en puerto ${PORT}\n`);
  });
} else {
  (async () => {
    const { key, cert } = await obtenerCert();
    https.createServer({ key, cert }, app).listen(PORT, () => {
      console.log('\n  App Inspecciones corriendo (HTTPS):');
      console.log(`   - En este PC:        https://localhost:${PORT}`);
      for (const ip of ipsLocales()) {
        console.log(`   - Desde el celular:  https://${ip}:${PORT}`);
      }
      console.log('\n  Nota: al ser un certificado local, el navegador mostrará un aviso');
      console.log('  de seguridad la primera vez. Acepta "Continuar / Avanzado" para entrar.\n');
    });

    // HTTP en el puerto siguiente: solo redirige a HTTPS.
    http.createServer((req, res) => {
      const host = (req.headers.host || `localhost:${HTTP_PORT}`).replace(/:\d+$/, `:${PORT}`);
      res.writeHead(301, { Location: `https://${host}${req.url}` });
      res.end();
    }).listen(HTTP_PORT);
  })();
}
