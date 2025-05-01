const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const session = require('express-session');
const client = require('./db');  // ✅ PostgreSQL


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

    try {
        const result = await client.query(
            'SELECT id, nombre FROM alumnos WHERE matricula = $1 AND password = $2',
            [matricula, password]
        );

        const alumno = result.rows[0];
        if (alumno) {
            req.session.alumno = {
                id: alumno.id,
                nombre: alumno.nombre,
                matricula
            };
            res.redirect('/panel');
        } else {
            res.render('login', { error: 'Matrícula o contraseña incorrecta.' });
        }
    } catch (err) {
        console.error('❌ Error al iniciar sesión:', err);
        res.status(500).send('Error interno');
    }
});


app.get('/register', async (req, res) => {
    try {
        const result = await client.query('SELECT id, nombre FROM carreras ORDER BY nombre');
        res.render('register', { carreras: result.rows, error: null });
    } catch (err) {
        console.error('❌ Error al cargar carreras:', err);
        res.status(500).send('Error al cargar carreras');
    }
});


app.post('/register', async (req, res) => {
    const { nombre, matricula, password, carrera_id } = req.body;

    try {
        const existente = await client.query(
            'SELECT id FROM alumnos WHERE matricula = $1',
            [matricula]
        );

        if (existente.rows.length > 0) {
            const result = await client.query('SELECT id, nombre FROM carreras ORDER BY nombre');
            return res.render('register', {
                carreras: result.rows,
                error: 'Ya existe un alumno con esa matrícula.'
            });
        }

        await client.query(
            'INSERT INTO alumnos (nombre, matricula, password, carrera_id, fecha_registro) VALUES ($1, $2, $3, $4, $5)',
            [nombre, matricula, password, parseInt(carrera_id), new Date()]
        );

        res.redirect('/login');
    } catch (err) {
        console.error('❌ Error en registro:', err);
        res.status(500).send('Error al registrar al alumno');
    }
});


app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/panel', async (req, res) => {
    if (!req.session.alumno) return res.redirect('/login');

    try {
        const result = await client.query('SELECT id, nombre FROM carreras ORDER BY nombre');
        res.render('form', { carreras: result.rows });
    } catch (err) {
        console.error('❌ Error al cargar el panel:', err);
        res.status(500).send('Error interno al cargar el panel');
    }
});

app.post('/generar', upload.single('foto'), async (req, res) => {
    if (!req.session.alumno) return res.status(403).send("⚠️ Debes iniciar sesión.");

    const { nombre, matricula, carrera } = req.body;
    const fotoPath = req.file?.path;
    if (!fotoPath) return res.status(400).send("⚠️ No se recibió la imagen correctamente.");

    try {
        const alumnoResult = await client.query(
            'SELECT id FROM alumnos WHERE matricula = $1',
            [matricula]
        );

        const alumno = alumnoResult.rows[0];
        if (!alumno) return res.status(404).send("❌ Matrícula no encontrada.");

        const pagoResult = await client.query(
            'SELECT puede_generar, vigencia_hasta FROM pagos WHERE alumno_id = $1',
            [alumno.id]
        );

        const pago = pagoResult.rows[0];
        if (!pago || !pago.puede_generar) return res.status(403).send("❌ No se ha registrado tu pago.");

        const vigenciaBD = new Date(pago.vigencia_hasta);
        if (vigenciaBD < new Date()) return res.status(403).send("⚠️ Tu vigencia ha vencido. Debes renovar tu pago.");

        const carreraQuery = await client.query(
            'SELECT nombre, rvoe FROM carreras WHERE id = $1',
            [parseInt(carrera)]
        );

        const nombreCarrera = carreraQuery.rows[0]?.nombre || 'Carrera desconocida';
        const rvoe = carreraQuery.rows[0]?.rvoe || 'RVOE no disponible';
        const carreraCompleta = `${nombreCarrera}\nRVOE: ${rvoe}`;

        const vigencia = calcularVigencia();
        const qrImagePath = `uploads/qr-${Date.now()}.png`;
        await QRCode.toFile(qrImagePath, `Credencial válida hasta: ${vigencia}\nNombre: ${nombre}\nMatrícula: ${matricula}`);

        console.log('📄 Generando PDF con nombre:', nombre);

        res.setHeader('Content-disposition', `attachment; filename=credencial-${Date.now()}.pdf`);
        res.setHeader('Content-type', 'application/pdf');
        const doc = new PDFDocument({ size: [1670, 490], margin: 0 });
        doc.pipe(res);
        doc.image('public/plantilla.png', 0, 0, { width: 1670, height: 490 });

        doc.image(fotoPath, 45, 180, { width: 200, height: 220 });
        doc.font('Helvetica').fillColor('black').fontSize(28);
        doc.text(`${nombre}`, 260, 300);
        doc.text(`Matrícula: ${matricula}`, 260, 360);
        doc.text(carreraCompleta, 270, 160, {
            width: 540,
            lineBreak: true,
        });

        doc.text(`Vigencia: ${vigencia}`, 880, 450);
        doc.image(qrImagePath, 1310, 90, { width: 240 });
        doc.end();
    } catch (err) {
        console.error('❌ Error al generar la credencial:', err);
        res.status(500).send('Error interno al generar la credencial');
    }
});


function calcularVigencia() {
    const hoy = new Date();
    hoy.setFullYear(hoy.getFullYear() + 1);
    return `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
}

app.get('/admin/login', (req, res) => res.render('login_admin', { error: null }));

app.post('/admin/login', async (req, res) => {
    const { usuario, password } = req.body;

    try {
        const result = await client.query(
            'SELECT id FROM administradores WHERE usuario = $1 AND contraseña = $2',
            [usuario, password]
        );

        if (result.rows.length > 0) {
            req.session.admin = true;
            res.redirect('/admin');
        } else {
            res.render('login_admin', { error: 'Credenciales incorrectas.' });
        }
    } catch (err) {
        console.error('❌ Error en login de admin:', err);
        res.status(500).send('Error al iniciar sesión');
    }
});



app.get('/admin', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');

    try {
        const result = await client.query(`
            SELECT a.id, a.nombre, a.matricula, p.puede_generar, p.vigencia_hasta
            FROM alumnos a
            LEFT JOIN pagos p ON a.id = p.alumno_id
        `);
        res.render('admin', { alumnos: result.rows });
    } catch (err) {
        console.error('❌ Error al cargar el panel de administrador:', err);
        res.status(500).send('Error al cargar datos de alumnos');
    }
});


app.post('/admin/activar', async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin/login');

    const id = parseInt(req.body.alumno_id);
    const nuevaVigencia = new Date();
    nuevaVigencia.setFullYear(nuevaVigencia.getFullYear() + 1);
    const fechaHoy = new Date();

    try {
        const existe = await client.query(
            'SELECT * FROM pagos WHERE alumno_id = $1',
            [id]
        );

        if (existe.rows.length > 0) {
            await client.query(
                'UPDATE pagos SET puede_generar = true, vigencia_hasta = $1, fecha_pago = $2 WHERE alumno_id = $3',
                [nuevaVigencia, fechaHoy, id]
            );
        } else {
            await client.query(
                'INSERT INTO pagos (alumno_id, fecha_pago, puede_generar, vigencia_hasta) VALUES ($1, $2, true, $3)',
                [id, fechaHoy, nuevaVigencia]
            );
        }

        res.redirect('/admin');
    } catch (err) {
        console.error('❌ Error al activar pago:', err);
        res.status(500).send('Error al activar pago');
    }
});


app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
