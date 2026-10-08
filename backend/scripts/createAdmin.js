const bcrypt = require("bcrypt");
const pool = require("../src/config/db");
const users = require("../src/models/userModel");
const validate = require("../src/utils/validation");

async function main() {
  try {
    const name = validate.text(process.env.ADMIN_NAME, "ADMIN_NAME", 100, true);
    const email = validate.email(process.env.ADMIN_EMAIL);
    const password = await bcrypt.hash(validate.password(process.env.ADMIN_PASSWORD), 12);
    const user = await users.create({ name, email, password, role: "admin" });
    console.log(`Admin account created (ID ${user.id}).`);
  } catch (error) {
    console.error(error.code === "ER_DUP_ENTRY" ? "An account with this email already exists." : error.status ? error.message : "Admin creation failed. Check the database and environment settings.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
