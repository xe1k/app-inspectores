// Middleware de autorización por sesión.

// Exige sesión iniciada. Para llamadas a la API responde 401 en JSON;
// para navegación normal redirige al login.
function requireLogin(req, res, next) {
  if (req.session && req.session.usuario) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.redirect('/login');
}

// Exige que el rol del usuario en sesión esté en la lista dada.
// Usar DESPUÉS de requireLogin (asume req.session.usuario ya existe).
function checkRol(...rolesPermitidos) {
  return (req, res, next) => {
    const rol = req.session.usuario && req.session.usuario.rol;
    if (!rolesPermitidos.includes(rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

module.exports = { requireLogin, checkRol };
