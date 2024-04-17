// require("dotenv").config();
// const { Pool } = require("pg");

// const pool = new Pool({
//   host: "localhost",
//   user: "postgres",
//   port: 5432,
//   password: process.env.DB_PASSWORD,
//   database: "cardharbor",
// });

// module.exports = pool;

const { Pool } = require("pg");
require("dotenv").config();
let { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;
const pool = new Pool({
  host: PGHOST,
  database: PGDATABASE,
  username: PGUSER,
  password: PGPASSWORD,
  port: 5432,
  ssl: {
    require: true,
  },
});

module.exports = pool;
