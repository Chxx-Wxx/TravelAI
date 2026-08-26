const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.join(
    __dirname,
    "..",
    ".env"
  ),
});

const { pool } = require("../db");

async function initializeDatabase() {
  const schemaPath = path.join(
    __dirname,
    "..",
    "schema.sql"
  );

  const schema = fs.readFileSync(
    schemaPath,
    "utf8"
  );

  try {
    await pool.query(schema);

    console.log(
      "PostgreSQL 스키마 초기화가 완료되었습니다."
    );
  } finally {
    await pool.end();
  }
}

initializeDatabase().catch((error) => {
  console.error(
    "PostgreSQL 스키마 초기화 실패:",
    error
  );

  process.exitCode = 1;
});
