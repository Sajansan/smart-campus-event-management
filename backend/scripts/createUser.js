const bcrypt = require("bcrypt");
const pool = require("../src/config/db");
const users = require("../src/models/userModel");
const validate = require("../src/utils/validation");

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
  Use Staff access in the app to generate a temporary password for a staff member.
`);
    process.exit(1);
  }

  if (!validRoles.includes(role.toLowerCase())) {
    console.error(`Invalid role: "${role}". Choose from: ${validRoles.join(", ")}`);
    process.exit(1);
  }

  try {
    const normalizedRole = role.toLowerCase();
    if (users.isStaffRole(normalizedRole)) {
      const staffDepartment = validate.text(department, "Department", 100, true);
      const staffEmail = validate.email(email);
      const staffName = validate.text(name, "Name", 100, true);
      const hash = await bcrypt.hash(validate.password(password, 12), 12);
      const existing = await users.findByEmail(staffEmail);
      if (existing && !users.isStaffRole(existing.role)) {
        throw new Error("That email already belongs to a student or administrator");
      }
      if (existing) {
        await users.updateStaff(existing.id, { role: normalizedRole, department: staffDepartment, status: "active", password: hash });
      } else {
        await users.create({ name: staffName, email: staffEmail, password: hash, role: normalizedRole, department: staffDepartment, staffSetup: true });
      }
      console.log("Staff account is ready for first sign-in and password setup.");
      return;
    }
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

