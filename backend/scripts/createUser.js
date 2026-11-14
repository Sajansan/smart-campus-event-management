const bcrypt = require("bcrypt");
const pool = require("../src/config/db");
const users = require("../src/models/userModel");

async function main() {
  const args = process.argv.slice(2);
  const [role, email, password, name, department] = args;

  const validRoles = ["student", "organizer", "coordinator", "admin"];

  if (!role || !email || !password || !name) {
    console.log(`
Usage:
  node scripts/createUser.js <role> <email> <password> <name> [department]

Allowed roles:
  student | organizer | coordinator | admin

Examples:
  node scripts/createUser.js organizer organizer@dbit.lk Pass1234 "Kamal Silva" "Computing"
  node scripts/createUser.js coordinator coord@dbit.lk Pass1234 "Dr. Perera" "Computing"
`);
    process.exit(1);
  }

  if (!validRoles.includes(role.toLowerCase())) {
    console.error(`Invalid role: "${role}". Choose from: ${validRoles.join(", ")}`);
    process.exit(1);
  }

  try {
    const existing = await users.findByEmail(email.toLowerCase().trim());
    if (existing) {
      // If user exists, update their role and department
      await pool.execute(
        "UPDATE users SET role = ?, department = COALESCE(?, department) WHERE id = ?",
        [role.toLowerCase(), department || null, existing.id]
      );
      console.log(`Updated existing user "${email}" to role: ${role}${department ? ` (Dept: ${department})` : ""}`);
    } else {
      const hashedPassword = await bcrypt.hash(password, 12);
      const newUser = await users.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: role.toLowerCase(),
        department: department ? department.trim() : null
      });
      console.log(`Successfully created ${role} account "${email}" (ID: ${newUser.id})`);
    }
  } catch (error) {
    console.error("Error creating/updating user:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

