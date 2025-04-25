const sql = require('mssql');
const { config } = require('./db');  // Importar la configuración

async function testConnection() {
    try {
        // Intenta conectarte a la base de datos
        const pool = await sql.connect(config);
        console.log('Conexión exitosa a la base de datos!');
        pool.close();  // Cierra la conexión
    } catch (err) {
        console.error('Error al conectar a la base de datos:', err);
    }
}

// Ejecutar la prueba
testConnection();
