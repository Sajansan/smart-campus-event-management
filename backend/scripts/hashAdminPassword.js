const bcrypt = require('bcrypt');
const path = require('node:path');
const validate = require('../src/utils/validation');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

async function main() {
  try {
    const password = validate.password(process.env.ADMIN_PASSWORD);
    console.log(await bcrypt.hash(password, 12));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
main();
