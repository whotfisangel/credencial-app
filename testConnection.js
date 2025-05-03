const express = require('express');
const client = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('Servidor corriendo correctamente ✅');
});

// Ruta que consulta las carreras
app.get('/api/carreras', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM Carreras');
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error al consultar Carreras:', err);
        res.status(500).send('Error en el servidor o base de datos');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
});
