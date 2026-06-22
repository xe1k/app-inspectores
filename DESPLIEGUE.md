# Despliegue en Fly.io

App: **app-inspecciones-chaba** · Org: `personal` · Región: `gru` (São Paulo).
La base de datos SQLite y los archivos (fotos, diagramas) viven en un volumen
persistente montado en `/app/data` (ver `fly.toml`).

## Primer despliegue (la app aún no existe)

```bash
# 1. Crear la app (usa el nombre del fly.toml)
fly apps create app-inspecciones-chaba --org personal

# 2. Crear el volumen persistente (1 GB) en la región del fly.toml
fly volumes create inspecciones_data --size 1 --region gru -a app-inspecciones-chaba

# 3. Secrets (clave de sesión y administrador inicial)
fly secrets set -a app-inspecciones-chaba \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  ADMIN_USERNAME="admin@chaba.cl" \
  ADMIN_NOMBRE="Administrador"
# La clave del admin, por separado para no dejarla en el historial:
fly secrets set -a app-inspecciones-chaba ADMIN_PASSWORD="<clave-fuerte>"

# 4. Desplegar
fly deploy -a app-inspecciones-chaba
```

El primer arranque (`node src/db/init.js`) crea el esquema, el administrador
desde los secrets y siembra las 5 plantillas con sus diagramas y zonas. No se
crean datos de prueba (`NODE_ENV=production`).

## Cómo entra el administrador

Con `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Desde **Administración** en el menú
puede crear el resto de los usuarios (inspectores, supervisores, gerencial) y
ver el historial de inspecciones, firmas y hallazgos.

> El administrador no puede cambiar su propia clave desde la app. Para rotarla:
> `fly secrets set -a app-inspecciones-chaba ADMIN_PASSWORD="<nueva>"` y volver a
> desplegar (o reiniciar la máquina). Idempotente: si el admin ya existe, no se
> recrea — para forzar el cambio de clave hazlo desde otro admin o recreando el
> usuario.

## Redespliegues

```bash
fly deploy -a app-inspecciones-chaba
```

El volumen conserva la BD entre despliegues. Los seeds son idempotentes: no
duplican plantillas ni borran datos reales.

## Empezar con una base 100 % limpia

Si un volumen anterior quedó con datos de prueba, recréalo antes de desplegar:

```bash
fly volumes list -a app-inspecciones-chaba
fly volumes destroy <id> -a app-inspecciones-chaba
fly volumes create inspecciones_data --size 1 --region gru -a app-inspecciones-chaba
fly deploy -a app-inspecciones-chaba
```

## Verificación

1. `fly open -a app-inspecciones-chaba` → entrar como admin.
2. Confirmar que aparecen las 5 plantillas (980E, Tolva DT, Tolva WESTECH,
   Chasis 797F, Chasis D10T) con sus diagramas.
3. Crear un usuario inspector desde **Administración**.
4. Crear una inspección de prueba y **generar el PDF** (valida Chromium + RAM).
5. Ante errores: `fly logs -a app-inspecciones-chaba`.

## Prueba local del panel de administración

`data/` local no se toca. Para probar el admin en tu PC, levanta con las
variables de entorno (idempotente: promueve/crea el admin sin borrar nada):

```bash
ADMIN_USERNAME=admin@chaba.cl ADMIN_PASSWORD=clave123 npm start
```

Recuerda: la SPA se sirve desde `frontend/dist`, así que corre
`npm run build:frontend` después de cambiar el frontend.
