const db = require("./db");
const defaultProducts = require("./data");

async function seedProducts() {
    try {
        await db.query("DELETE FROM products");

        for (const p of defaultProducts) {
            await db.query(
                `
        INSERT INTO products (name, price, old_price, image, category, brand)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
                [
                    p.name,
                    p.price || 0,
                    p.oldPrice || p.price || 0,
                    p.image || "",
                    p.category || "",
                    p.brand || "",
                ]
            );
        }

        console.log("Đã import products vào MySQL thành công");
        process.exit();
    } catch (err) {
        console.error("Lỗi import products:", err);
        process.exit(1);
    }
}

seedProducts();