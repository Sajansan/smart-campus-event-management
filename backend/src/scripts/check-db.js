const sequelize = require("../config/database");

async function checkDatabase() {
  try {
    await sequelize.authenticate();
    console.log("MySQL connection successful.");
  } catch (error) {
    console.error("MySQL connection failed:", error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

checkDatabase();
