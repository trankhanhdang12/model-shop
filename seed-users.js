const fs = require("fs");
const path = require("path");
const db = require("./db");

const usersFile = path.join(__dirname, "users.json");

async function seedUsers() {
    try {
        if (!fs.existsSync(usersFile)) {
            console.log("Không tìm thấy users.json");
            process.exit();
        }

        const raw = fs.readFileSync(usersFile, "utf8");
        const users = raw ? JSON.parse(raw) : [];

        await db.query("DELETE FROM users");

        for (const u of users) {
            await db.query(
                `
        INSERT INTO users (email, password, role)
        VALUES (?, ?, ?)
        `,
                [
                    u.email || "",
                    u.password || "",
                    u.role || "user",
                ]
            );
        }

        console.log("Đã import users vào MySQL thành công");
        process.exit();
    } catch (err) {
        console.error("Lỗi import users:", err);
        process.exit(1);
    }
}

seedUsers();