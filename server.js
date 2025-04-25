const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const session = require('express-session');
const { sql, config } = require('./db');

const app = express();
const port = process.env.PORT || 3000;


app.use(session({
    secret: 'clave-secreta-supersegura',
    resave: false,
    saveUninitialized: false
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
    const { matricula, password } = req.body;
    const pool = await sql.connect(config);
    const result = await pool.request()
        .input('matricula', sql.VarChar, matricula)
        .input('password', sql.VarChar, password)
        .query('SELECT id, nombre FROM alumnos WHERE matricula = @matricula AND password = @password');

    const alumno = result.recordset[0];
    if (alumno) {
        req.session.alumno = { id: alumno.id, nombre: alumno.nombre, matricula };
        res.redirect('/panel');
    } else {
        res.render('login', { error: 'Matrícula o contraseña incorrecta.' });
    }
});

app.get('/register', async (req, res) => {
    const pool = await sql.connect(config);
    const result = await pool.request().query('SELECT id, nombre FROM carreras ORDER BY nombre');
    res.render('register', { carreras: result.recordset, error: null });
});

app.post('/register', async (req, res) => {
    const { nombre, matricula, password, carrera_id } = req.body;
    const pool = await sql.connect(config);

    const existente = await pool.request()
        .input('matricula', sql.VarChar, matricula)
        .query('SELECT id FROM alumnos WHERE matricula = @matricula');

    if (existente.recordset.length > 0) {
        const result = await pool.request().query('SELECT id, nombre FROM carreras ORDER BY nombre');
        return res.render('register', { carreras: result.recordset, error: 'Ya existe un alumno con esa matrícula.' });
    }

    await pool.request()
        .input('nombre', sql.VarChar, nombre)
        .input('matricula', sql.VarChar, matricula)
        .input('password', sql.VarChar, password)
        .input('carrera_id', sql.Int, parseInt(carrera_id))
        .input('fecha_registro', sql.DateTime, new Date())
        .query('INSERT INTO alumnos (nombre, matricula, password, carrera_id, fecha_registro) VALUES (@nombre, @matricula, @password, @carrera_id, @fecha_registro)');

    res.redirect('/login');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/panel', async (req, res) => {
    if (!req.session.alumno) return res.redirect('/login');
    const pool = await sql.connect(config);
    const result = await pool.request().query('SELECT id, nombre FROM carreras ORDER BY nombre');
    res.render('form', { carreras: result.recordset });
});

app.post('/generar', upload.single('foto'), async (req, res) => {
    if (!req.session.alumno) return res.status(403).send("⚠️ Debes iniciar sesión.");

    const { nombre, matricula, carrera } = req.body;
    const fotoPath = req.file?.path;
    if (!fotoPath) return res.status(400).send("⚠️ No se recibió la imagen correctamente.");

    const pool = await sql.connect(config);
    const alumnoResult = await pool.request()
        .input('matricula', sql.VarChar, matricula)
        .query('SELECT id FROM alumnos WHERE matricula = @matricula');

    const alumno = alumnoResult.recordset[0];
    if (!alumno) return res.status(404).send("❌ Matrícula no encontrada.");

    const pagoResult = await pool.request()
        .input('alumno_id', sql.Int, alumno.id)
        .query('SELECT puede_generar, vigencia_hasta FROM pagos WHERE alumno_id = @alumno_id');

    const pago = pagoResult.recordset[0];
    if (!pago || !pago.puede_generar) return res.status(403).send("❌ No se ha registrado tu pago.");

    const vigenciaBD = new Date(pago.vigencia_hasta);
    if (vigenciaBD < new Date()) return res.status(403).send("⚠️ Tu vigencia ha vencido. Debes renovar tu pago.");

    const carreraQuery = await pool.request()
        .input('id', sql.Int, parseInt(carrera))
        .query('SELECT nombre, rvoe FROM carreras WHERE id = @id');



    const nombreCarrera = carreraQuery.recordset[0]?.nombre || 'Carrera desconocida';
    const rvoe = carreraQuery.recordset[0]?.rvoe || 'RVOE no disponible';
    const carreraCompleta = `${nombreCarrera}\nRVOE: ${rvoe}`;

    const vigencia = calcularVigencia();
    const qrImagePath = `uploads/qr-${Date.now()}.png`;
    await QRCode.toFile(qrImagePath, `Credencial válida hasta: ${vigencia}\nNombre: ${nombre}\nMatrícula: ${matricula}`);

    // PRUEBA DE TEXTO QUE CAMBIA EN CADA EJECUCIÓN
    console.log('📄 Generando PDF con nombre:', nombre);

    res.setHeader('Content-disposition', `attachment; filename=credencial-${Date.now()}.pdf`);
    res.setHeader('Content-type', 'application/pdf');
    const doc = new PDFDocument({ size: [1670, 490], margin: 0 });
    doc.pipe(res);
    doc.image('public/plantilla.png', 0, 0, { width: 1670, height: 490 });

    // Datos de la credencial

    doc.image(fotoPath, 45, 180, { width: 200, height: 220 });
    doc.font('Helvetica').fillColor('black').fontSize(28);
    doc.text(`${nombre}`, 260, 300);
    doc.text(`Matrícula: ${matricula}`, 260, 360);
    doc.text(carreraCompleta, 270, 160, {
        width: 540,          // máximo ancho del texto
        lineBreak: true,     // permite saltos de línea
    });

    doc.text(`Vigencia: ${vigencia}`, 880, 450);
    doc.image(qrImagePath, 1310, 90, { width: 240 });
    doc.end();
});


function calcularVigencia() {
    const hoy = new Date();
    hoy.setFullYear(hoy.getFullYear() + 1);
    return `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
}

app.get('/admin/login', (req, res) => res.render('login_admin', { error: null }));

app.post('/admin/login', async (req, res) => {
    const { usuario, password } = req.body;
    const pool = await sql.connect(config);
    const result = await pool.request()
        .input('usuario', sql.VarChar, usuario)
        .input('password', sql.VarChar, password)
        .query('SELECT id FROM admin WHERE usuario = @usuario AND password = @password');

    if (result.recordset.length > 0) {
        req.session.admin = true;
        res.redirect('/admin');
    } else {
        res.render('login_admin', { error: 'Credenciales incorrectas.' });
    }
});

app.get('/admin', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
        SELECT a.id, a.nombre, a.matricula, p.puede_generar, p.vigencia_hasta
        FROM alumnos a
        LEFT JOIN pagos p ON a.id = p.alumno_id
    `);
    res.render('admin', { alumnos: result.recordset });
});

app.post('/admin/activar', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');

    const id = parseInt(req.body.alumno_id);
    const nuevaVigencia = new Date();
    nuevaVigencia.setFullYear(nuevaVigencia.getFullYear() + 1);
    const pool = await sql.connect(config);

    const existe = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM pagos WHERE alumno_id = @id');

    if (existe.recordset.length > 0) {
        await pool.request()
            .input('id', sql.Int, id)
            .input('vigencia', sql.DateTime, nuevaVigencia)
            .query('UPDATE pagos SET puede_generar = 1, vigencia_hasta = @vigencia, fecha_pago = GETDATE() WHERE alumno_id = @id');
    } else {
        await pool.request()
            .input('id', sql.Int, id)
            .input('fecha', sql.DateTime, new Date())
            .input('vigencia', sql.DateTime, nuevaVigencia)
            .query('INSERT INTO pagos (alumno_id, fecha_pago, puede_generar, vigencia_hasta) VALUES (@id, @fecha, 1, @vigencia)');

    }

    res.redirect('/admin');
});

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
