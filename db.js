const sql = require('mssql');

const config = {
    server: 'localhost',  // O 'EKT-LLL' si esa es la máquina o servidor donde está SQL
    instanceName: 'SQLEXPRESS',  // Esto se usa solo si la instancia de SQL Server está nombrada así
    database: 'CredencialesCUM',
    user: 'E',  // Usuario que has creado
    password: '123456789',  // Contraseña del usuario
    options: {
        trustServerCertificate: true,  // Esto es útil si tienes problemas con el certificado SSL
        encrypt: false  // Cambiar a `true` si estás usando cifrado en tu conexión
    }
};

module.exports = { sql, config };
