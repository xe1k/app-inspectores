# Despliegue gratis y permanente en Oracle Cloud (Always Free)

Esta guía deja la app corriendo en una máquina virtual **gratis para siempre** de
Oracle Cloud, con **HTTPS automático** (necesario para que la cámara funcione en los
celulares) y los datos **persistentes** (la BD y las fotos no se pierden).

Arquitectura: una VM Ubuntu con **Docker**. Dentro corren dos contenedores:
- **app** — el servidor + la base de datos SQLite (datos en `./data`).
- **caddy** — pone el candado HTTPS solo (Let's Encrypt) y reenvía a la app.

> ⏱️ Tiempo estimado: 45–60 min la primera vez. Sigue los pasos en orden.

---

## ⚠️ Seguros para que NUNCA te cobren

1. Al crear la cuenta, Oracle pide tarjeta solo para **verificar** (cargo temporal ~1 USD que se devuelve).
2. **NO actualices a "Pay As You Go"**. Mantén la cuenta como **Free Tier**.
3. Usa solo recursos marcados **"Always Free eligible"** (esta guía solo usa esos).
4. Crea una **alerta de presupuesto en 1 USD** (Parte 1, paso final). Si algo se saliera del gratis, te avisa.

Con eso, el costo es **$0** y no puede llegarte una factura sorpresa.

---

## Parte 1 — Crear la cuenta Oracle Cloud

1. Entra a **https://www.oracle.com/cloud/free/** y haz clic en *Start for free*.
2. Completa el registro (correo `g.astargo84@gmail.com`), verifica el correo, agrega la tarjeta (solo verificación).
3. Elige una **región (Home Region)** cercana a Chile, por ejemplo **Chile (Santiago)** o **Brazil East (São Paulo)**.
   ⚠️ La región **no se puede cambiar después**; elige bien.
4. Al terminar, entras a la **Consola de Oracle Cloud**.
5. Configura la alerta de presupuesto: menú ☰ → **Billing & Cost Management → Budgets → Create Budget**,
   monto **1 USD**, alerta al **100%**. Guardar.

---

## Parte 2 — Crear la máquina virtual (gratis)

1. Menú ☰ → **Compute → Instances → Create instance**.
2. **Name**: `app-inspecciones`.
3. **Image and shape** → *Edit*:
   - **Image**: Canonical **Ubuntu 22.04**.
   - **Shape**: *Change shape* → pestaña **Ampere** → **VM.Standard.A1.Flex**
     (dice *Always Free eligible*). Pon **2 OCPUs** y **12 GB** de memoria.
   - 💡 Si dice *out of capacity*, baja a 1 OCPU/6 GB, prueba otra hora, o usa
     **VM.Standard.E2.1.Micro** (x86, 1 GB — funciona pero más justo).
4. **Networking**: deja *Create new virtual cloud network* (crea la red sola).
   Asegúrate de que **Assign a public IPv4 address** esté en **Yes**.
5. **Add SSH keys**: elige **Generate a key pair for me** y **descarga la llave privada**
   (`ssh-key-XXXX.key`). ⚠️ Guárdala bien; es tu acceso a la VM.
6. **Create**. En 1–2 min la instancia queda *Running*. Anota la **Public IP address**.

---

## Parte 3 — Abrir los puertos 80 y 443

Hay que abrir en **dos** lugares: la red de Oracle y el firewall interno de Ubuntu.

### 3a. En la red de Oracle (Security List)
1. En la página de la instancia, baja a **Primary VNIC** → clic en el nombre de la **Subnet**.
2. Clic en la **Default Security List** → **Add Ingress Rules**. Agrega dos reglas:
   - Source CIDR `0.0.0.0/0` · IP Protocol **TCP** · Destination Port **80**
   - Source CIDR `0.0.0.0/0` · IP Protocol **TCP** · Destination Port **443**
3. Guardar.

### 3b. En Ubuntu (lo haces ya conectado por SSH en la Parte 5; déjalo anotado)
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## Parte 4 — Dominio gratis con DuckDNS (para el HTTPS)

El candado HTTPS necesita un **nombre de dominio** (no sirve solo la IP). DuckDNS da uno gratis y permanente.

1. Entra a **https://www.duckdns.org** e inicia sesión (con Google/GitHub).
2. Crea un subdominio, por ejemplo **`chaba-inspecciones`** → quedará
   **`chaba-inspecciones.duckdns.org`**.
3. En el campo **current ip** de ese subdominio, pon la **IP pública de tu VM** (Parte 2) y *update ip*.

---

## Parte 5 — Conectarte a la VM e instalar Docker

Desde tu PC con Windows, abre **PowerShell** en la carpeta donde guardaste la llave:

```powershell
# Ajusta permisos de la llave (solo la primera vez)
icacls .\ssh-key-XXXX.key /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Conéctate (usuario "ubuntu" + la IP de tu VM)
ssh -i .\ssh-key-XXXX.key ubuntu@TU_IP_PUBLICA
```

Ya dentro de la VM (verás `ubuntu@app-inspecciones:~$`):

```bash
# 1) Abrir puertos en el firewall de Ubuntu (Parte 3b)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# 2) Instalar Docker (script oficial) y git
curl -fsSL https://get.docker.com | sudo sh
sudo apt-get install -y git
sudo usermod -aG docker $USER

# 3) Cerrar sesión y volver a entrar para que tome el grupo docker
exit
```
Vuelve a entrar con el mismo `ssh -i ...`.

---

## Parte 6 — Subir el código a la VM

**Opción A (recomendada): GitHub.**
Primero sube el proyecto a un repositorio (incluyendo los archivos nuevos de
plantillas y despliegue). Avísame y te ayudo a dejarlo commiteado y pusheado.
Luego, en la VM:
```bash
git clone https://github.com/TU_USUARIO/app-inspecciones.git
cd app-inspecciones
```

**Opción B: copiar por SCP** desde tu PC (sin GitHub). En PowerShell, en la carpeta del proyecto:
```powershell
# Copia el proyecto a la VM (excluye node_modules/data/dist por tamaño; se regeneran)
scp -i .\ssh-key-XXXX.key -r . ubuntu@TU_IP_PUBLICA:~/app-inspecciones
```
Luego en la VM: `cd ~/app-inspecciones`.

---

## Parte 7 — Configurar y arrancar

Dentro de `~/app-inspecciones` en la VM:

```bash
# 1) Crear el archivo de secretos a partir del ejemplo
cp .env.example .env
nano .env
```
Completa en `.env`:
- `DOMINIO=chaba-inspecciones.duckdns.org`  (tu subdominio de la Parte 4)
- `SESSION_SECRET=` ← pega el resultado de `openssl rand -hex 32` (córrelo en otra línea)
- `ADMIN_USERNAME=admin@chaba.cl`
- `ADMIN_PASSWORD=` ← una clave fuerte que recuerdes
- `ADMIN_NOMBRE=Administrador`

Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

```bash
# 2) Construir y levantar (la primera vez tarda unos minutos)
docker compose up -d --build

# 3) Ver que arrancó bien
docker compose logs -f app
```
Cuando veas `Base de datos lista.` y el servidor corriendo, está listo (sal del log con `Ctrl+C`).

---

## Parte 8 — Verificar

1. En el celular o el navegador, abre **https://chaba-inspecciones.duckdns.org**
   (la primera vez Caddy tarda ~30 s en sacar el certificado).
2. Inicia sesión con `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
3. Verás **Administración** en el menú. Crea ahí los usuarios inspectores.
4. Confirma que están las 5 plantillas con sus diagramas.
5. Crea una inspección de prueba y **genera un PDF** (valida que Chromium funciona).

---

## Operación del día a día

```bash
# Ver registros
docker compose logs -f app

# Reiniciar
docker compose restart

# Actualizar a una versión nueva del código (si usaste GitHub)
git pull
docker compose up -d --build

# Respaldar la base de datos y las fotos (cópialo a tu PC de vez en cuando)
tar czf respaldo-$(date +%F).tgz data/
```

La carpeta `data/` (BD + fotos + diagramas) es lo único que hay que respaldar.
La VM gratis sigue encendida indefinidamente mientras la cuenta esté activa.

> Recordatorio de seguridad: no actualices la cuenta a *Pay As You Go* y deja la
> alerta de presupuesto puesta. Así se mantiene en **$0**.
