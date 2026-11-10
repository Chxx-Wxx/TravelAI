/* global __dirname */

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

  const migrationsPath = path.join(
    __dirname,
    "..",
    "migrations"
  );

  const migrations = fs.existsSync(migrationsPath)
    ? fs
        .readdirSync(migrationsPath)
        .filter((fileName) => fileName.endsWith(".sql"))
        .sort()
        .map((fileName) => ({
          fileName,
          sql: fs.readFileSync(
            path.join(migrationsPath, fileName),
            "utf8"
          ),
        }))
    : [];

  try {
    await pool.query(schema);

    for (const migration of migrations) {
      await pool.query(migration.sql);
      console.log(
        `PostgreSQL 마이그레이션 적용: ${migration.fileName}`
      );
    }

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
