# 🎓 Sistema de Credenciales Escolares - CUM

Aplicación web para la generación automatizada de credenciales escolares con validación por matrícula, control de pagos, vigencia anual y código QR integrado. Desarrollado para el **Centro Universitario México (CUM)**.

---

## 🚀 Funcionalidades

- 🔐 Inicio de sesión con matrícula y control de sesión
- ✅ Verificación automática de pago antes de permitir generación
- 🖼 Subida de foto personalizada
- 📄 Generación de credencial en PDF con:
  - Nombre, matrícula, carrera y RVOE
  - Fecha de vigencia (1 año)
  - QR dinámico con información de validación
- 🧾 Validación de vigencia contra base de datos (SQL Server)
- 🔒 Solo accesible si el alumno ha pagado

---

## 🛠 Requisitos del sistema

- Node.js >= 18.x
- SQL Server (con tablas: `alumnos`, `pagos`, `carreras`)
- Librerías:
  - `express`
  - `pdfkit`
  - `qrcode`
  - `multer`
  - `body-parser`
  - `mssql`
  - `express-session`

---

## 📦 Instalación local

```bash
git clone https://github.com/tu-usuario/credencial-app.git
cd credencial-app
npm install
node app.js
