const readline = require('readline');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Admin email: ', async (email) => {
  rl.close();

  const password = await new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write('Admin password (hidden): ');
    stdin.resume();
    stdin.setRawMode(true);
    let value = '';

    const onData = (key) => {
      if (key.toString() === '\u0003') {
        stdin.setRawMode(false);
        process.exit(1);
      }
      if (key.toString() === '\r' || key.toString() === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (key.toString() === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += key.toString();
      }
    };

    stdin.on('data', onData);
  });

  let connection;
  try {
    require('dotenv').config();
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });

    const [rows] = await connection.execute(
      'SELECT password_hash FROM users WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()],
    );

    if (!rows.length) {
      console.log('No user found for that email.');
    } else {
      console.log(
        'Password matches stored hash:',
        await bcrypt.compare(password, rows[0].password_hash),
      );
    }
  } catch {
    console.log('Verification could not run. Check database connectivity and configuration.');
  } finally {
    password.length = 0;
    if (connection) await connection.end();
  }
});
