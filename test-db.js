const db = require("./db");

async function test() {
    try {
        const [rows] = await db.query("SELECT 1 + 1 AS result");
        console.log("Kết nối DB OK:", rows);
    } catch (err) {
        console.error("Lỗi kết nối DB:", err);
    }
}

test();