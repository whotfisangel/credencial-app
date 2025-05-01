require('dotenv').config({ path: 'V.env' });  // usa tu archivo personalizado

const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

client.connect()
    .then(() => console.log('✅ Conexión exitosa a PostgreSQL en Render'))
    .catch(err => console.error('❌ Error al conectar a la base de datos:', err));

module.exports = client;
