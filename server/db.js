const { Pool } = require("pg");

const databaseUrl =
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL이 설정되지 않았습니다. server/.env를 확인해주세요."
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
});

pool.on("error", (error) => {
  console.error(
    "PostgreSQL 연결 오류:",
    error
  );
});

module.exports = {
  pool,
  query(text, params) {
    return pool.query(text, params);
  },
};
