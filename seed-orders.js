const fs = require("fs");
const path = require("path");
const db = require("./db");

const ordersFile = path.join(__dirname, "orders.json");

async function seedOrders() {
    try {
        if (!fs.existsSync(ordersFile)) {
            console.log("Không tìm thấy orders.json");
            process.exit();
        }

        const raw = fs.readFileSync(ordersFile, "utf8");
        const orders = raw ? JSON.parse(raw) : [];

        await db.query("DELETE FROM order_items");
        await db.query("DELETE FROM orders");

        for (const order of orders) {
            const [result] = await db.query(
                `
        INSERT INTO orders (user_id, user_email, name, phone, address, total, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
                [
                    null,
                    order.user || null,
                    order.name || "",
                    order.phone || "",
                    order.address || "",
                    order.total || 0,
                    order.date ? new Date(order.date) : new Date(),
                ]
            );

            const orderId = result.insertId;
            const items = order.items || [];

            for (const item of items) {
                await db.query(
                    `
          INSERT INTO order_items (order_id, product_id, product_name, price, qty, image)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
                    [
                        orderId,
                        item.id || null,
                        item.name || "",
                        item.price || 0,
                        item.qty || 1,
                        item.image || "",
                    ]
                );
            }
        }

        console.log("Đã import orders vào MySQL thành công");
        process.exit();
    } catch (err) {
        console.error("Lỗi import orders:", err);
        process.exit(1);
    }
}

seedOrders();