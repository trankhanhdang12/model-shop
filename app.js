const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const db = require("./db");
const defaultProducts = require("./data");
const {
    calculateDiscount,
    calculateShippingFee
} = require("./services/pricing");
const app = express();
const usersFile = path.join(__dirname, "users.json");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "src/public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src/views"));

app.use(
    session({
        secret: "tkd-shop-secret",
        resave: false,
        saveUninitialized: false,
    })
);

// ===== USERS =====
let users = [];

if (fs.existsSync(usersFile)) {
    const data = fs.readFileSync(usersFile, "utf8");
    users = data ? JSON.parse(data) : [];
}

function saveUsers() {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), "utf8");
}

// ===== HELPERS =====
async function getCurrentUser(req) {
    if (!req.session.user) return null;

    const [rows] = await db.query(
        "SELECT * FROM users WHERE id = ?", [req.session.user.id]
    );

    return rows[0] || null;
}

async function syncCartToUser(req) {
    if (!req.session.user) return;

    try {
        await db.query(
            "UPDATE users SET cart_json = ? WHERE id = ?", [JSON.stringify(req.session.cart || []), req.session.user.id]
        );
    } catch (err) {
        console.error("SYNC CART ERROR:", err);
    }
}

async function requireAdmin(req, res, next) {
    try {
        const currentUser = await getCurrentUser(req);

        if (!currentUser || currentUser.role !== "admin") {
            return res.status(403).send("Bạn không có quyền truy cập trang admin");
        }

        next();
    } catch (err) {
        console.error("ADMIN AUTH ERROR:", err);
        res.status(500).send("Database error");
    }
}

function normalizeProduct(product) {
    if (!product) return product;

    return {
        ...product,
        oldPrice: product.old_price,
        discountPercent: product.discount_percent || 0
    };
}


async function getValidVoucher(code, subtotal) {
    if (!code) return null;

    const [rows] = await db.query(
        `
        SELECT *
        FROM vouchers
        WHERE code = ?
          AND is_active = 1
          AND (start_date IS NULL OR start_date <= NOW())
          AND (end_date IS NULL OR end_date >= NOW())
        LIMIT 1
        `, [code.trim().toUpperCase()]
    );

    const voucher = rows[0];
    if (!voucher) return null;
    if (subtotal < Number(voucher.min_order_value || 0)) return null;

    return voucher;
}


function generateTransferCode(orderId) {
    return `TKDSHOP-${orderId}`;
}
// ===== GLOBAL MIDDLEWARE =====
app.use(async(req, res, next) => {
    try {
        if (!req.session.cart) req.session.cart = [];

        const currentUser = await getCurrentUser(req);

        res.locals.cart = req.session.cart;
        res.locals.user = req.session.user || null;
        res.locals.role = currentUser ? currentUser.role : null;

        next();
    } catch (err) {
        console.error("=== MIDDLEWARE ERROR ===");
        console.error("MESSAGE:", err.message);
        console.error("STACK:", err.stack);
        res.status(500).send("Database error");
    }
});

// ================= HOME =================
// ================= HOME =================
app.get("/", async(req, res) => {
    try {
        const keyword = (req.query.q || "").trim();
        const category = (req.query.category || "").trim();
        const sort = (req.query.sort || "popular").trim();

        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = 20;

        let whereClause = "WHERE 1=1";
        const queryParams = [];

        if (keyword) {
            whereClause += " AND (p.name LIKE ? OR p.brand LIKE ? OR p.category LIKE ?)";
            queryParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }

        if (category) {
            whereClause += " AND p.category = ?";
            queryParams.push(category);
        }

        let orderByClause = "ORDER BY p.id ASC";

        if (sort === "newest") {
            orderByClause = "ORDER BY p.id DESC";
        } else if (sort === "price_asc") {
            orderByClause = "ORDER BY p.price ASC";
        } else if (sort === "price_desc") {
            orderByClause = "ORDER BY p.price DESC";
        } else if (sort === "best_selling") {
            orderByClause = "ORDER BY review_count DESC, avg_rating DESC, p.id DESC";
        } else {
            orderByClause = "ORDER BY favorite_count DESC, review_count DESC, p.id DESC";
        }

        const [countRows] = await db.query(
            `
                SELECT COUNT(*) AS total
                FROM products p
                    ${whereClause}
            `,
            queryParams
        );

        const totalRows = Number(countRows[0].total || 0);
        const totalPages = Math.max(Math.ceil(totalRows / limit), 1);
        const safePage = Math.min(page, totalPages);
        const offset = (safePage - 1) * limit;

        const [rows] = await db.query(
            `
                SELECT
                    p.*,
                    COALESCE(ROUND(AVG(r.rating), 1), 0) AS avg_rating,
                    COUNT(r.id) AS review_count,
                    COALESCE(fav.favorite_count, 0) AS favorite_count
                FROM products p
                         LEFT JOIN reviews r ON p.id = r.product_id
                         LEFT JOIN (
                    SELECT product_id, COUNT(*) AS favorite_count
                    FROM favorites
                    GROUP BY product_id
                ) fav ON p.id = fav.product_id
                    ${whereClause}
                GROUP BY p.id
                    ${orderByClause}
                    LIMIT ? OFFSET ?
            `, [...queryParams, limit, offset]
        );

        const productIds = rows.map((p) => p.id);
        let favoriteSet = new Set();
        let searchHistories = [];

        const currentUser = await getCurrentUser(req);

        if (currentUser) {
            if (productIds.length > 0) {
                const [favoriteRows] = await db.query(
                    `
                        SELECT product_id
                        FROM favorites
                        WHERE user_id = ? AND product_id IN (?)
                    `, [currentUser.id, productIds]
                );

                favoriteRows.forEach((item) => favoriteSet.add(item.product_id));
            }

            const [historyRows] = await db.query(
                `
                    SELECT keyword
                    FROM search_history
                    WHERE user_id = ?
                    ORDER BY updated_at DESC
                        LIMIT 8
                `, [currentUser.id]
            );

            searchHistories = historyRows.map((item) => item.keyword);
        }

        const [notificationRows] = await db.query(
            `
                SELECT *
                FROM notifications
                WHERE is_active = 1
                ORDER BY is_pinned DESC, created_at DESC, id DESC
                    LIMIT 6
            `
        );

        const products = rows.map((product) => {
            const normalized = normalizeProduct(product);

            return {
                ...normalized,
                avgRating: Number(product.avg_rating || 0),
                reviewCount: Number(product.review_count || 0),
                isFavorite: favoriteSet.has(product.id),
                favoriteCount: Number(product.favorite_count || 0)
            };
        });

        res.render("index", {
            products,
            keyword,
            category,
            sort,
            page: safePage,
            totalPages,
            searchHistories,
            notifications: notificationRows
        });
    } catch (err) {
        console.error("HOME ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= SAVE SEARCH HISTORY =================
app.post("/search/history", async(req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: "Not logged in" });
        }

        const keyword = (req.body.keyword || "").trim();
        if (!keyword) {
            return res.json({ success: false, message: "Empty keyword" });
        }

        const currentUser = await getCurrentUser(req);
        if (!currentUser) {
            return res.json({ success: false, message: "User not found" });
        }

        const [exists] = await db.query(
            `
                SELECT id
                FROM search_history
                WHERE user_id = ? AND keyword = ?
                    LIMIT 1
            `, [currentUser.id, keyword]
        );

        if (exists.length > 0) {
            await db.query(
                `
                    UPDATE search_history
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [exists[0].id]
            );
        } else {
            await db.query(
                `
                    INSERT INTO search_history (user_id, keyword)
                    VALUES (?, ?)
                `, [currentUser.id, keyword]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error("SAVE SEARCH HISTORY ERROR:", err);
        res.status(500).json({ success: false });
    }
});

// ================= DELETE ONE SEARCH HISTORY =================
app.post("/search/history/delete", async(req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false });
        }

        const keyword = (req.body.keyword || "").trim();
        const currentUser = await getCurrentUser(req);

        if (!currentUser || !keyword) {
            return res.json({ success: false });
        }

        await db.query(
            `
                DELETE FROM search_history
                WHERE user_id = ? AND keyword = ?
            `, [currentUser.id, keyword]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("DELETE SEARCH HISTORY ERROR:", err);
        res.status(500).json({ success: false });
    }
});

// ================= CLEAR SEARCH HISTORY =================
app.post("/search/history/clear", async(req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false });
        }

        const currentUser = await getCurrentUser(req);
        if (!currentUser) {
            return res.json({ success: false });
        }

        await db.query(
            `
                DELETE FROM search_history
                WHERE user_id = ?
            `, [currentUser.id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("CLEAR SEARCH HISTORY ERROR:", err);
        res.status(500).json({ success: false });
    }
});

// ================= PRODUCT =================
app.get("/product/:id", async(req, res) => {
    try {
        const id = Number(req.params.id);

        const [rows] = await db.query(
            "SELECT * FROM products WHERE id = ?", [id]
        );

        const product = rows[0];

        if (!product) {
            return res.status(404).send("Không tìm thấy sản phẩm");
        }

        const [reviewRows] = await db.query(
            `
                SELECT r.*, u.email
                FROM reviews r
                         JOIN users u ON r.user_id = u.id
                WHERE r.product_id = ?
                ORDER BY r.updated_at DESC
            `, [id]
        );

        const [reviewStats] = await db.query(
            `
                SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS review_count
                FROM reviews
                WHERE product_id = ?
            `, [id]
        );

        let userReview = null;
        let isFavorite = false;
        const currentUser = await getCurrentUser(req);

        if (currentUser) {
            const [myReviewRows] = await db.query(
                `
                    SELECT *
                    FROM reviews
                    WHERE user_id = ? AND product_id = ?
                        LIMIT 1
                `, [currentUser.id, id]
            );

            userReview = myReviewRows[0] || null;

            const [favoriteRows] = await db.query(
                `
                    SELECT id
                    FROM favorites
                    WHERE user_id = ? AND product_id = ?
                        LIMIT 1
                `, [currentUser.id, id]
            );

            isFavorite = favoriteRows.length > 0;
        }

        res.render("product", {
            product: {
                ...normalizeProduct(product),
                avgRating: Number(reviewStats[0].avg_rating || 0),
                reviewCount: Number(reviewStats[0].review_count || 0),
                isFavorite
            },
            reviews: reviewRows,
            userReview
        });
    } catch (err) {
        console.error("PRODUCT ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= FAVORITES =================
app.post("/favorites/toggle/:id", async(req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const currentUser = await getCurrentUser(req);
        if (!currentUser) {
            return res.redirect("/login");
        }

        const productId = Number(req.params.id);

        const [exists] = await db.query(
            `
                SELECT id
                FROM favorites
                WHERE user_id = ? AND product_id = ?
                    LIMIT 1
            `, [currentUser.id, productId]
        );

        if (exists.length > 0) {
            await db.query(
                `
                    DELETE FROM favorites
                    WHERE user_id = ? AND product_id = ?
                `, [currentUser.id, productId]
            );
        } else {
            await db.query(
                `
                    INSERT INTO favorites (user_id, product_id)
                    VALUES (?, ?)
                `, [currentUser.id, productId]
            );
        }

        res.redirect(req.get("referer") || "/");
    } catch (err) {
        console.error("TOGGLE FAVORITE ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= REVIEWS =================
app.post("/product/:id/review", async(req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const currentUser = await getCurrentUser(req);
        if (!currentUser) {
            return res.redirect("/login");
        }

        const productId = Number(req.params.id);
        const rating = Number(req.body.rating);
        const comment = (req.body.comment || "").trim();

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).send("Điểm đánh giá không hợp lệ");
        }

        const [exists] = await db.query(
            `
                SELECT id
                FROM reviews
                WHERE user_id = ? AND product_id = ?
                    LIMIT 1
            `, [currentUser.id, productId]
        );

        if (exists.length > 0) {
            await db.query(
                `
                    UPDATE reviews
                    SET rating = ?, comment = ?
                    WHERE user_id = ? AND product_id = ?
                `, [rating, comment, currentUser.id, productId]
            );
        } else {
            await db.query(
                `
                    INSERT INTO reviews (user_id, product_id, rating, comment)
                    VALUES (?, ?, ?, ?)
                `, [currentUser.id, productId, rating, comment]
            );
        }

        res.redirect(`/product/${productId}`);
    } catch (err) {
        console.error("REVIEW ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= CART =================
app.post("/cart/add/:id", async(req, res) => {
    try {
        const id = Number(req.params.id);

        const [rows] = await db.query(
            "SELECT * FROM products WHERE id = ?", [id]
        );

        const product = rows[0];

        if (!product) {
            return res.status(404).send("Không tìm thấy sản phẩm");
        }

        const cart = req.session.cart;
        const existed = cart.find((x) => x.id === product.id);

        if (existed) {
            existed.qty = (existed.qty || 1) + 1;
        } else {
            cart.push({
                id: product.id,
                name: product.name,
                price: product.price,
                oldPrice: product.old_price,
                image: product.image,
                category: product.category,
                brand: product.brand,
                qty: 1
            });
        }

        await syncCartToUser(req);
        res.redirect(req.get("referer") || "/");
    } catch (err) {
        console.error("ADD CART ERROR:", err);
        res.status(500).send("Database error");
    }
});

app.post("/cart/increase/:id", async(req, res) => {
    try {
        const id = Number(req.params.id);
        const cart = req.session.cart;
        const item = cart.find((x) => x.id === id);

        if (item) {
            item.qty = (item.qty || 1) + 1;
        }

        await syncCartToUser(req);
        res.redirect(req.get("referer") || "/cart");
    } catch (err) {
        console.error("CART INCREASE ERROR:", err);
        res.status(500).send("Database error");
    }
});

app.post("/cart/decrease/:id", async(req, res) => {
    try {
        const id = Number(req.params.id);
        const cart = req.session.cart;
        const idx = cart.findIndex((x) => x.id === id);

        if (idx !== -1) {
            cart[idx].qty = (cart[idx].qty || 1) - 1;
            if (cart[idx].qty <= 0) cart.splice(idx, 1);
        }

        await syncCartToUser(req);
        res.redirect(req.get("referer") || "/cart");
    } catch (err) {
        console.error("CART DECREASE ERROR:", err);
        res.status(500).send("Database error");
    }
});

app.post("/cart/remove/:id", async(req, res) => {
    try {
        const id = Number(req.params.id);
        req.session.cart = req.session.cart.filter((x) => x.id !== id);

        await syncCartToUser(req);
        res.redirect(req.get("referer") || "/cart");
    } catch (err) {
        console.error("CART REMOVE ERROR:", err);
        res.status(500).send("Database error");
    }
});

app.post("/cart/clear", async(req, res) => {
    try {
        req.session.cart = [];
        await syncCartToUser(req);
        res.redirect("/cart");
    } catch (err) {
        console.error("CART CLEAR ERROR:", err);
        res.status(500).send("Database error");
    }
});

app.get("/cart", (req, res) => {
    res.render("cart", { cart: req.session.cart });
});

// ================= CHECKOUT =================
app.get("/checkout", async(req, res) => {
    try {
        const cart = req.session.cart || [];

        if (cart.length === 0) {
            return res.redirect("/cart");
        }

        const currentUser = await getCurrentUser(req);

        let subtotal = 0;
        cart.forEach((item) => {
            subtotal += (item.price || 0) * (item.qty || 1);
        });

        const shippingFee = calculateShippingFee(subtotal);
        const discountAmount = 0;
        const finalTotal = subtotal + shippingFee - discountAmount;

        res.render("checkout", {
            cart,
            profileUser: currentUser || null,
            subtotal,
            shippingFee,
            discountAmount,
            finalTotal,
            appliedVoucherCode: ""
        });
    } catch (err) {
        console.error("CHECKOUT PAGE ERROR:", err);
        res.status(500).send("Database error");
    }
});

app.post("/checkout", async(req, res) => {
    try {
        const { name, phone, address, payment_method, voucher_code } = req.body;
        const cart = req.session.cart || [];

        if (!name || !phone || !address) {
            return res.status(400).send("Vui lòng nhập đầy đủ thông tin giao hàng");
        }

        if (!payment_method) {
            return res.status(400).send("Vui lòng chọn phương thức thanh toán");
        }

        if (cart.length === 0) {
            return res.redirect("/cart");
        }

        let subtotal = 0;
        cart.forEach((item) => {
            subtotal += (item.price || 0) * (item.qty || 1);
        });

        const shippingFee = calculateShippingFee(subtotal);
        const voucher = await getValidVoucher(voucher_code, subtotal);
        const discountAmount = calculateDiscount(voucher, subtotal);
        const finalTotal = subtotal + shippingFee - discountAmount;

        const currentUser = await getCurrentUser(req);

        let paymentStatus = "unpaid";
        if (payment_method === "bank_qr") {
            paymentStatus = "pending_confirm";
        }

        const [orderResult] = await db.query(
            `
            INSERT INTO orders (
                user_id,
                user_email,
                name,
                phone,
                address,
                total,
                shipping_fee,
                discount_amount,
                final_total,
                voucher_code,
                status,
                payment_method,
                payment_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                currentUser ? currentUser.id : null,
                req.session.user ? req.session.user.email : null,
                name,
                phone,
                address,
                subtotal,
                shippingFee,
                discountAmount,
                finalTotal,
                voucher ? voucher.code : null,
                "pending",
                payment_method,
                paymentStatus
            ]
        );

        const orderId = orderResult.insertId;
        const transferCode = generateTransferCode(orderId);

        await db.query(
            `
            UPDATE orders
            SET transfer_code = ?
            WHERE id = ?
            `, [transferCode, orderId]
        );

        for (const item of cart) {
            await db.query(
                `
                INSERT INTO order_items (
                    order_id,
                    product_id,
                    product_name,
                    price,
                    qty,
                    image
                )
                VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    orderId,
                    item.id || null,
                    item.name || "",
                    item.price || 0,
                    item.qty || 1,
                    item.image || ""
                ]
            );
        }

        req.session.cart = [];
        await syncCartToUser(req);

        const qrUrl = `https://qr.sepay.vn/img?acc=1038983184&bank=VCB&amount=${finalTotal}&des=${encodeURIComponent(transferCode)}`;

        res.render("success", {
            order: {
                id: orderId,
                name,
                phone,
                address,
                subtotal,
                shipping_fee: shippingFee,
                discount_amount: discountAmount,
                total: finalTotal,
                payment_method,
                payment_status: paymentStatus,
                voucher_code: voucher ? voucher.code : null,
                transfer_code: transferCode
            },
            qrUrl
        });
    } catch (err) {
        console.error("=== CHECKOUT ERROR ===");
        console.error("MESSAGE:", err.message);
        console.error("STACK:", err.stack);
        res.status(500).send("Database error");
    }
});
app.post("/checkout/apply-voucher-preview", async(req, res) => {
    try {
        const { voucher_code } = req.body;
        const cart = req.session.cart || [];

        if (cart.length === 0) {
            return res.json({
                success: false,
                message: "Giỏ hàng đang trống"
            });
        }

        let subtotal = 0;
        const productIds = [];

        cart.forEach((item) => {
            subtotal += (item.price || 0) * (item.qty || 1);
            if (item.id) productIds.push(Number(item.id));
        });

        const shippingFee = calculateShippingFee(subtotal);
        const currentUser = await getCurrentUser(req);

        const voucher = await getValidVoucher(
            voucher_code,
            subtotal,
            currentUser ? currentUser.id : null,
            productIds
        );

        if (!voucher) {
            return res.json({
                success: false,
                message: "Mã giảm giá không hợp lệ, hết hạn, không đủ điều kiện hoặc bạn đã dùng mã này rồi"
            });
        }

        const discountAmount = calculateDiscount(voucher, subtotal);
        const finalTotal = subtotal + shippingFee - discountAmount;

        return res.json({
            success: true,
            message: `Áp mã ${voucher.code} thành công`,
            voucherCode: voucher.code,
            subtotal,
            shippingFee,
            discountAmount,
            finalTotal
        });
    } catch (err) {
        console.error("APPLY VOUCHER PREVIEW ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi hệ thống"
        });
    }
});
// ================= ORDERS HISTORY =================
app.get("/orders", async(req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const currentStatus = String(req.query.status || "").trim();

        let whereClause = "WHERE user_email = ?";
        const params = [req.session.user.email];

        if (currentStatus) {
            whereClause += " AND status = ?";
            params.push(currentStatus);
        }

        const [orderRows] = await db.query(
            `
                SELECT *
                FROM orders
                ${whereClause}
                ORDER BY id DESC
            `,
            params
        );

        const orders = [];

        for (const order of orderRows) {
            const [items] = await db.query(
                `
                    SELECT product_id, product_name, price, qty, image
                    FROM order_items
                    WHERE order_id = ?
                    ORDER BY id ASC
                `, [order.id]
            );

            orders.push({
                ...order,
                items: items.map((item) => ({
                    id: item.product_id,
                    name: item.product_name,
                    price: item.price,
                    qty: item.qty,
                    image: item.image
                }))
            });
        }

        const [countRows] = await db.query(
            `
                SELECT
                    COUNT(*) AS total_count,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
                    SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count,
                    SUM(CASE WHEN status = 'shipping' THEN 1 ELSE 0 END) AS shipping_count,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count
                FROM orders
                WHERE user_email = ?
            `, [req.session.user.email]
        );

        const counts = countRows[0] || {
            total_count: 0,
            pending_count: 0,
            confirmed_count: 0,
            shipping_count: 0,
            completed_count: 0,
            cancelled_count: 0
        };

        res.render("orders", {
            orders,
            currentStatus,
            counts
        });
    } catch (err) {
        console.error("ORDERS PAGE ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= CANCEL ORDER =================
app.post("/orders/cancel/:id", async(req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const orderId = Number(req.params.id);

        const [rows] = await db.query(
            `
                SELECT * FROM orders
                WHERE id = ? AND user_email = ?
            `, [orderId, req.session.user.email]
        );

        const order = rows[0];

        if (!order) {
            return res.status(404).send("Không tìm thấy đơn hàng");
        }

        if (order.status !== "pending") {
            return res.status(400).send("Chỉ có thể hủy đơn khi đang chờ xác nhận");
        }

        await db.query(
            `
                UPDATE orders
                SET status = 'cancelled'
                WHERE id = ?
            `, [orderId]
        );

        res.redirect("/orders");
    } catch (err) {
        console.error("CANCEL ORDER ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= LOGIN =================
app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", async(req, res) => {
    try {
        const { email, password } = req.body;

        const [rows] = await db.query(
            "SELECT * FROM users WHERE email = ? AND password = ?", [email, password]
        );

        const user = rows[0];

        if (!user) {
            return res.status(401).send("Sai email hoặc mật khẩu");
        }

        req.session.user = {
            id: user.id,
            email: user.email
        };

        let dbCart = [];
        if (user.cart_json) {
            try {
                dbCart = JSON.parse(user.cart_json);
            } catch (e) {
                dbCart = [];
            }
        }

        req.session.cart = Array.isArray(dbCart) ? dbCart : [];

        res.redirect("/");
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= REGISTER =================
app.get("/register", (req, res) => {
    res.render("register");
});

app.post("/register", async(req, res) => {
    try {
        const { email, password, confirmPassword } = req.body;

        if (!email || !password || !confirmPassword) {
            return res.status(400).send("Vui lòng nhập đầy đủ thông tin");
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).send("Email không hợp lệ");
        }

        if (password.length < 6) {
            return res.status(400).send("Mật khẩu phải ít nhất 6 ký tự");
        }

        if (password.length > 32) {
            return res.status(400).send("Mật khẩu quá dài");
        }

        if (password !== confirmPassword) {
            return res.status(400).send("Mật khẩu nhập lại không khớp");
        }

        const [exists] = await db.query(
            "SELECT * FROM users WHERE email = ?", [email]
        );

        if (exists.length > 0) {
            return res.status(400).send("Email đã tồn tại");
        }

        const [result] = await db.query(
            "INSERT INTO users (email, password, role, cart_json) VALUES (?, ?, ?, ?)", [email, password, "user", "[]"]
        );

        req.session.user = {
            id: result.insertId,
            email
        };

        req.session.cart = [];

        res.redirect("/");
    } catch (err) {
        console.error("REGISTER ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= PROFILE =================
app.get("/profile", async(req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const currentUser = await getCurrentUser(req);

        if (!currentUser) {
            return res.redirect("/login");
        }

        res.render("profile", {
            profileUser: currentUser,
            success: req.query.success || "",
            error: req.query.error || ""
        });
    } catch (err) {
        console.error("PROFILE ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= UPDATE PROFILE =================
app.post("/profile/update", async(req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const { full_name, phone, address } = req.body;

        await db.query(
            `
                UPDATE users
                SET full_name = ?, phone = ?, address = ?
                WHERE id = ?
            `, [
                full_name || null,
                phone || null,
                address || null,
                req.session.user.id
            ]
        );

        res.redirect("/profile?success=C%E1%BA%ADp%20nh%E1%BA%ADt%20th%C3%B4ng%20tin%20th%C3%A0nh%20c%C3%B4ng");
    } catch (err) {
        console.error("UPDATE PROFILE ERROR:", err);
        res.redirect("/profile?error=C%E1%BA%ADp%20nh%E1%BA%ADt%20th%C3%B4ng%20tin%20th%E1%BA%A5t%20b%E1%BA%A1i");
    }
});

// ================= CHANGE PASSWORD =================
app.post("/profile/change-password", async(req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return res.redirect("/profile?error=Vui%20l%C3%B2ng%20nh%E1%BA%ADp%20%C4%91%E1%BA%A7y%20%C4%91%E1%BB%A7%20th%C3%B4ng%20tin%20%C4%91%E1%BB%95i%20m%E1%BA%ADt%20kh%E1%BA%A9u");
        }

        if (newPassword !== confirmNewPassword) {
            return res.redirect("/profile?error=M%E1%BA%ADt%20kh%E1%BA%A9u%20m%E1%BB%9Bi%20nh%E1%BA%ADp%20l%E1%BA%A1i%20kh%C3%B4ng%20kh%E1%BB%9Bp");
        }

        const [rows] = await db.query(
            "SELECT * FROM users WHERE id = ?", [req.session.user.id]
        );

        const user = rows[0];

        if (!user) {
            return res.redirect("/login");
        }

        if (user.password !== currentPassword) {
            return res.redirect("/profile?error=M%E1%BA%ADt%20kh%E1%BA%A9u%20hi%E1%BB%87n%20t%E1%BA%A1i%20kh%C3%B4ng%20%C4%91%C3%BAng");
        }

        await db.query(
            "UPDATE users SET password = ? WHERE id = ?", [newPassword, req.session.user.id]
        );

        res.redirect("/profile?success=%C4%90%E1%BB%95i%20m%E1%BA%ADt%20kh%E1%BA%A9u%20th%C3%A0nh%20c%C3%B4ng");
    } catch (err) {
        console.error("CHANGE PASSWORD ERROR:", err);
        res.redirect("/profile?error=%C4%90%E1%BB%95i%20m%E1%BA%ADt%20kh%E1%BA%A9u%20th%E1%BA%A5t%20b%E1%BA%A1i");
    }
});

// ================= LOGOUT =================
app.post("/logout", async(req, res) => {
    try {
        await syncCartToUser(req);

        req.session.destroy(() => {
            res.redirect("/");
        });
    } catch (err) {
        console.error("LOGOUT ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= ADMIN DASHBOARD =================
app.get("/admin", requireAdmin, async(req, res) => {
    try {
        const [allOrders] = await db.query("SELECT * FROM orders");
        const [users] = await db.query("SELECT * FROM users");

        const [recentOrders] = await db.query(`
            SELECT id, user_email, name, phone, address, total, created_at
            FROM orders
            ORDER BY id DESC
            LIMIT 5
        `);

        let revenue = 0;
        allOrders.forEach((o) => {
            revenue += Number(o.total || 0);
        });

        res.render("admin-dashboard", {
            totalOrders: allOrders.length,
            revenue,
            users,
            orders: recentOrders
        });
    } catch (err) {
        console.error("ADMIN DASHBOARD ERROR:", err);
        res.status(500).send("Database error");
    }
});
app.get("/admin/notifications", requireAdmin, async(req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT *
            FROM notifications
            ORDER BY id DESC
        `);

        res.render("admin-notifications", {
            notifications: rows,
            success: req.query.success || "",
            error: req.query.error || ""
        });
    } catch (err) {
        console.error("ADMIN NOTIFICATIONS ERROR:", err);
        res.status(500).send("Database error");
    }
});
app.post("/admin/notifications/new", requireAdmin, async(req, res) => {
    try {
        const { title, message, image, link, type, is_pinned } = req.body;

        if (!title || !message) {
            return res.status(400).send("Vui lòng nhập tiêu đề và nội dung");
        }

        await db.query(
            `
                INSERT INTO notifications (
                    title,
                    message,
                    image,
                    link,
                    type,
                    is_active,
                    is_pinned
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                title.trim(),
                message.trim(),
                image ? image.trim() : null,
                link ? link.trim() : null,
                type ? type.trim() : "general",
                1,
                is_pinned ? 1 : 0
            ]
        );

        res.redirect("/admin/notifications?success=Thêm%20thông%20báo%20thành%20công");
    } catch (err) {
        console.error("ADMIN NEW NOTIFICATION ERROR:", err);
        res.redirect("/admin/notifications?error=Thêm%20thông%20báo%20thất%20bại");
    }
});
app.post("/admin/notifications/toggle/:id", requireAdmin, async(req, res) => {
    try {
        const id = Number(req.params.id);

        await db.query(
            `
            UPDATE notifications
            SET is_active = IF(is_active = 1, 0, 1)
            WHERE id = ?
            `, [id]
        );

        res.redirect("/admin/notifications?success=Cập%20nhật%20trạng%20thái%20thông%20báo%20thành%20công");
    } catch (err) {
        console.error("ADMIN TOGGLE NOTIFICATION ERROR:", err);
        res.redirect("/admin/notifications?error=Cập%20nhật%20trạng%20thái%20thông%20báo%20thất%20bại");
    }
});
app.post("/admin/notifications/pin/:id", requireAdmin, async(req, res) => {
    try {
        const id = Number(req.params.id);

        await db.query(
            `
            UPDATE notifications
            SET is_pinned = IF(is_pinned = 1, 0, 1)
            WHERE id = ?
            `, [id]
        );

        res.redirect("/admin/notifications?success=Cập%20nhật%20ghim%20thông%20báo%20thành%20công");
    } catch (err) {
        console.error("ADMIN PIN NOTIFICATION ERROR:", err);
        res.redirect("/admin/notifications?error=Cập%20nhật%20ghim%20thông%20báo%20thất%20bại");
    }
});
app.post("/admin/notifications/delete/:id", requireAdmin, async(req, res) => {
    try {
        const id = Number(req.params.id);

        await db.query(
            "DELETE FROM notifications WHERE id = ?", [id]
        );

        res.redirect("/admin/notifications?success=Xóa%20thông%20báo%20thành%20công");
    } catch (err) {
        console.error("ADMIN DELETE NOTIFICATION ERROR:", err);
        res.redirect("/admin/notifications?error=Xóa%20thông%20báo%20thất%20bại");
    }
});
app.get("/notifications", async(req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT *
            FROM notifications
            WHERE is_active = 1
            ORDER BY is_pinned DESC, created_at DESC, id DESC
            `
        );

        res.render("notifications", {
            notifications: rows
        });
    } catch (err) {
        console.error("NOTIFICATIONS PAGE ERROR:", err);
        res.status(500).send("Database error");
    }
});
// ================= HELP PAGE =================
app.get("/help", (req, res) => {
    const helpItems = [{
            title: "Làm sao để mua hàng?",
            content: "Bạn chọn sản phẩm, bấm 'Thêm vào giỏ', sau đó vào giỏ hàng và tiến hành đặt hàng tại trang thanh toán."
        },
        {
            title: "Tôi có thể thanh toán bằng cách nào?",
            content: "Hiện tại website hỗ trợ thanh toán khi nhận hàng và chuyển khoản ngân hàng bằng mã QR."
        },
        {
            title: "Làm sao để xem lại đơn hàng đã đặt?",
            content: "Sau khi đăng nhập, bạn vào mục 'Đơn hàng' để xem lịch sử mua hàng và trạng thái từng đơn."
        },
        {
            title: "Tôi có thể hủy đơn hàng không?",
            content: "Bạn có thể hủy đơn khi đơn hàng vẫn đang ở trạng thái chờ xác nhận."
        },
        {
            title: "Nếu sản phẩm bị lỗi thì sao?",
            content: "Bạn liên hệ bộ phận hỗ trợ của TKD Shop để được kiểm tra và hướng dẫn đổi trả nếu đủ điều kiện."
        },
        {
            title: "Làm sao để liên hệ với cửa hàng?",
            content: "Bạn có thể liên hệ qua Facebook, Instagram hoặc thông tin hỗ trợ hiển thị tại cuối trang trợ giúp."
        }
    ];

    res.render("help", {
        helpItems
    });
});
// ================= FOOTER INFO PAGES =================
function renderInfoPage(res, title, subtitle, sections) {
    return res.render("info-page", {
        title,
        subtitle,
        sections
    });
}

app.get("/about", (req, res) => {
    renderInfoPage(
        res,
        "Giới thiệu về TKD - Shop",
        "TKD - Shop là website bán mô hình anime, figure và sản phẩm sưu tầm dành cho người yêu thích Dragon Ball, One Piece, Naruto và nhiều dòng sản phẩm khác.", [{
                heading: "Về chúng tôi",
                content: "TKD - Shop hướng đến trải nghiệm mua sắm mô hình trực tuyến đơn giản, rõ ràng và dễ sử dụng cho khách hàng."
            },
            {
                heading: "Sản phẩm",
                content: "Chúng tôi tập trung vào các dòng figure, statue, mô hình nhân vật anime và sản phẩm sưu tầm chất lượng."
            },
            {
                heading: "Mục tiêu",
                content: "Mang đến một website bán mô hình hiện đại, trực quan và thuận tiện cho cả người mua lẫn người quản trị."
            }
        ]
    );
});

app.get("/mall", (req, res) => {
    renderInfoPage(
        res,
        "TKD - Shop Mall",
        "Khu vực giới thiệu các sản phẩm nổi bật, chính hãng và được ưu tiên hiển thị tại cửa hàng.", [{
                heading: "Sản phẩm nổi bật",
                content: "TKD - Shop Mall tập hợp các sản phẩm được đánh giá cao, có độ hoàn thiện tốt và được nhiều khách hàng quan tâm."
            },
            {
                heading: "Ưu tiên hiển thị",
                content: "Các sản phẩm thuộc nhóm Mall có thể được gắn nhãn nổi bật, ưu tiên hiển thị tại trang chủ hoặc danh mục."
            }
        ]
    );
});

app.get("/buy-guide", (req, res) => {
    renderInfoPage(
        res,
        "Hướng dẫn mua hàng",
        "Các bước cơ bản để đặt mua sản phẩm tại TKD - Shop.", [{
                heading: "Bước 1",
                content: "Tìm kiếm sản phẩm hoặc chọn theo danh mục mong muốn."
            },
            {
                heading: "Bước 2",
                content: "Bấm vào sản phẩm để xem chi tiết rồi chọn 'Thêm vào giỏ'."
            },
            {
                heading: "Bước 3",
                content: "Vào giỏ hàng, kiểm tra số lượng và bấm thanh toán."
            },
            {
                heading: "Bước 4",
                content: "Nhập thông tin nhận hàng, chọn phương thức thanh toán và xác nhận đơn."
            }
        ]
    );
});

app.get("/careers", (req, res) => {
    renderInfoPage(
        res,
        "Tuyển dụng",
        "Thông tin tuyển dụng và định hướng phát triển đội ngũ của TKD - Shop.", [{
                heading: "Môi trường làm việc",
                content: "Chúng tôi hướng đến môi trường trẻ, chủ động, hỗ trợ lẫn nhau và luôn cải thiện trải nghiệm người dùng."
            },
            {
                heading: "Vị trí phù hợp",
                content: "Các vị trí có thể bao gồm bán hàng, quản trị nội dung, quản lý sản phẩm và hỗ trợ khách hàng."
            },
            {
                heading: "Liên hệ ứng tuyển",
                content: "Bạn có thể gửi thông tin ứng tuyển qua email hỗ trợ của cửa hàng."
            }
        ]
    );
});

app.get("/terms", (req, res) => {
    renderInfoPage(
        res,
        "Điều khoản TKD - Shop",
        "Các nguyên tắc cơ bản khi sử dụng website TKD - Shop.", [{
                heading: "Tài khoản",
                content: "Người dùng chịu trách nhiệm bảo mật tài khoản và thông tin đăng nhập của mình."
            },
            {
                heading: "Đặt hàng",
                content: "Đơn hàng chỉ được xác nhận khi hệ thống ghi nhận đầy đủ thông tin và trạng thái hợp lệ."
            },
            {
                heading: "Nội dung website",
                content: "Hình ảnh, nội dung và dữ liệu trên website phục vụ cho mục đích giới thiệu, mua bán và quản trị hệ thống."
            }
        ]
    );
});

app.get("/policy/purchase", (req, res) => {
    renderInfoPage(
        res,
        "Chính sách mua hàng",
        "Thông tin cơ bản về quy trình mua hàng tại TKD - Shop.", [{
                heading: "Xác nhận đơn hàng",
                content: "Sau khi đặt hàng, hệ thống sẽ lưu đơn và chờ xác nhận từ quản trị viên."
            },
            {
                heading: "Thanh toán",
                content: "Khách hàng có thể chọn thanh toán khi nhận hàng hoặc chuyển khoản qua mã QR nếu được hỗ trợ."
            },
            {
                heading: "Giao hàng",
                content: "Thời gian giao hàng phụ thuộc vào khu vực và trạng thái xử lý đơn."
            }
        ]
    );
});

app.get("/policy/returns", (req, res) => {
    renderInfoPage(
        res,
        "Chính sách đổi trả",
        "Thông tin cơ bản về việc đổi trả sản phẩm tại TKD - Shop.", [{
                heading: "Điều kiện đổi trả",
                content: "Sản phẩm có thể được xem xét đổi trả nếu bị lỗi, giao sai hoặc không đúng mô tả."
            },
            {
                heading: "Thời gian yêu cầu",
                content: "Khách hàng nên liên hệ sớm sau khi nhận hàng để được hỗ trợ nhanh chóng."
            },
            {
                heading: "Liên hệ hỗ trợ",
                content: "Vui lòng gửi thông tin đơn hàng và hình ảnh sản phẩm để bộ phận hỗ trợ kiểm tra."
            }
        ]
    );
});

app.get("/policy/privacy", (req, res) => {
    renderInfoPage(
        res,
        "Chính sách bảo mật",
        "Cam kết cơ bản về việc lưu trữ và sử dụng thông tin người dùng.", [{
                heading: "Thông tin thu thập",
                content: "Website có thể lưu thông tin tài khoản, giỏ hàng, đơn hàng và một số dữ liệu cần thiết để phục vụ mua sắm."
            },
            {
                heading: "Mục đích sử dụng",
                content: "Thông tin được sử dụng để xử lý đơn hàng, hỗ trợ khách hàng và cải thiện trải nghiệm sử dụng website."
            },
            {
                heading: "Bảo mật dữ liệu",
                content: "TKD - Shop cam kết không sử dụng thông tin người dùng sai mục đích."
            }
        ]
    );
});
// ================= ADMIN ORDERS =================
app.get("/admin/orders", requireAdmin, async(req, res) => {
    try {
        const orderId = String(req.query.order_id || "").trim();
        const status = String(req.query.status || "").trim();

        let whereClause = "WHERE 1=1";
        const params = [];

        if (orderId !== "") {
            const parsedId = Number(orderId);
            if (!Number.isNaN(parsedId) && parsedId > 0) {
                whereClause += " AND o.id = ?";
                params.push(parsedId);
            }
        }

        const allowedStatuses = ["pending", "confirmed", "shipping", "completed", "cancelled"];
        if (status !== "" && allowedStatuses.includes(status)) {
            whereClause += " AND o.status = ?";
            params.push(status);
        }

        const [orderRows] = await db.query(
            `
                SELECT
                    o.id,
                    o.user_id,
                    o.user_email,
                    o.name,
                    o.phone,
                    o.address,
                    o.total,
                    o.status,
                    o.payment_method,
                    o.payment_status,
                    o.created_at
                FROM orders o
                ${whereClause}
                ORDER BY o.id DESC
            `,
            params
        );

        const orders = [];

        for (const order of orderRows) {
            const [items] = await db.query(
                `
                    SELECT product_id, product_name, price, qty, image
                    FROM order_items
                    WHERE order_id = ?
                    ORDER BY id ASC
                `, [order.id]
            );

            orders.push({
                ...order,
                items: items.map((item) => ({
                    id: item.product_id,
                    name: item.product_name,
                    price: item.price,
                    qty: item.qty,
                    image: item.image
                }))
            });
        }

        const [statsRows] = await db.query(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'shipping' THEN 1 ELSE 0 END) AS shipping,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(total) AS revenue
            FROM orders
        `);

        const rawStats = statsRows[0] || {};

        res.render("admin-orders", {
            orders,
            stats: rawStats,
            success: req.query.success || "",
            error: req.query.error || "",
            filters: {
                order_id: orderId,
                status
            },
            currentStatus: status,
            counts: {
                total_count: rawStats.total || 0,
                pending_count: rawStats.pending || 0,
                shipping_count: rawStats.shipping || 0,
                done_count: rawStats.completed || 0
            }
        });
    } catch (err) {
        console.error("ADMIN ORDERS ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= ADMIN DELETE ORDER =================
app.post("/admin/orders/delete/:id", requireAdmin, async(req, res) => {
    try {
        const orderId = Number(req.params.id);

        const [rows] = await db.query(
            "SELECT * FROM orders WHERE id = ?", [orderId]
        );

        if (!rows.length) {
            return res.redirect("/admin/orders?error=Không%20tìm%20thấy%20đơn%20hàng");
        }

        await db.query("DELETE FROM order_items WHERE order_id = ?", [orderId]);
        await db.query("DELETE FROM orders WHERE id = ?", [orderId]);

        res.redirect("/admin/orders?success=Xóa%20đơn%20hàng%20thành%20công");
    } catch (err) {
        console.error("ADMIN DELETE ORDER ERROR:", err);
        res.redirect("/admin/orders?error=Xóa%20đơn%20hàng%20thất%20bại");
    }
});

// ================= ADMIN UPDATE ORDER STATUS =================
app.post("/admin/orders/update-status/:id", requireAdmin, async(req, res) => {
    try {
        const orderId = Number(req.params.id);
        const { status } = req.body;

        const allowedStatuses = ["pending", "confirmed", "shipping", "completed", "cancelled"];

        if (!allowedStatuses.includes(status)) {
            return res.redirect("/admin/orders?error=Trạng%20thái%20không%20hợp%20lệ");
        }

        const [rows] = await db.query(
            "SELECT * FROM orders WHERE id = ?", [orderId]
        );

        const order = rows[0];

        if (!order) {
            return res.redirect("/admin/orders?error=Không%20tìm%20thấy%20đơn%20hàng");
        }

        const currentStatus = order.status || "pending";

        const validTransitions = {
            pending: ["confirmed", "cancelled"],
            confirmed: ["shipping", "cancelled"],
            shipping: ["completed"],
            completed: [],
            cancelled: []
        };

        if (!validTransitions[currentStatus].includes(status)) {
            return res.redirect("/admin/orders?error=Không%20thể%20chuyển%20trạng%20thái%20này");
        }

        if (status === "completed") {
            await db.query(
                "UPDATE orders SET status = ?, payment_status = 'paid' WHERE id = ?", [status, orderId]
            );
        } else {
            await db.query(
                "UPDATE orders SET status = ? WHERE id = ?", [status, orderId]
            );
        }

        res.redirect("/admin/orders?success=Cập%20nhật%20trạng%20thái%20thành%20công");
    } catch (err) {
        console.error("ADMIN UPDATE ORDER STATUS ERROR:", err);
        res.redirect("/admin/orders?error=Cập%20nhật%20trạng%20thái%20thất%20bại");
    }
});

// ================= ADMIN CONFIRM PAYMENT =================
app.post("/admin/orders/confirm-payment/:id", requireAdmin, async(req, res) => {
    try {
        const orderId = Number(req.params.id);

        const [rows] = await db.query(
            "SELECT * FROM orders WHERE id = ?", [orderId]
        );

        const order = rows[0];

        if (!order) {
            return res.redirect("/admin/orders?error=Không%20tìm%20thấy%20đơn%20hàng");
        }

        await db.query(
            "UPDATE orders SET payment_status = 'paid' WHERE id = ?", [orderId]
        );

        res.redirect("/admin/orders?success=Xác%20nhận%20thanh%20toán%20thành%20công");
    } catch (err) {
        console.error("ADMIN CONFIRM PAYMENT ERROR:", err);
        res.redirect("/admin/orders?error=Xác%20nhận%20thanh%20toán%20thất%20bại");
    }
});

// ================= ADMIN USERS =================
app.get("/admin/users", requireAdmin, async(req, res) => {
    try {
        const [users] = await db.query(`
            SELECT id, email, password, role, full_name, phone, address
            FROM users
            ORDER BY id DESC
        `);

        res.render("admin-users", {
            users,
            success: req.query.success || "",
            error: req.query.error || ""
        });
    } catch (err) {
        console.error("ADMIN USERS ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= ADMIN DELETE USER =================
app.post("/admin/users/delete/:id", requireAdmin, async(req, res) => {
    try {
        const userId = Number(req.params.id);

        const [rows] = await db.query(
            "SELECT * FROM users WHERE id = ?", [userId]
        );

        const user = rows[0];

        if (!user) {
            return res.redirect("/admin/users?error=Không%20tìm%20thấy%20tài%20khoản");
        }

        if (user.role === "admin") {
            return res.redirect("/admin/users?error=Không%20thể%20xóa%20tài%20khoản%20admin");
        }

        await db.query("DELETE FROM favorites WHERE user_id = ?", [userId]);
        await db.query("DELETE FROM reviews WHERE user_id = ?", [userId]);
        await db.query("DELETE FROM search_history WHERE user_id = ?", [userId]);

        await db.query("UPDATE orders SET user_id = NULL WHERE user_id = ?", [userId]);

        await db.query("DELETE FROM users WHERE id = ?", [userId]);

        res.redirect("/admin/users?success=Xóa%20tài%20khoản%20thành%20công");
    } catch (err) {
        console.error("ADMIN DELETE USER ERROR:", err);
        res.redirect("/admin/users?error=Xóa%20tài%20khoản%20thất%20bại");
    }
});

// ================= ADMIN PRODUCTS =================
app.get("/admin/products", requireAdmin, async(req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM products ORDER BY id ASC");
        res.render("admin-products", {
            products: rows.map(normalizeProduct)
        });
    } catch (err) {
        console.error("ADMIN PRODUCTS ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= ADMIN UPDATE DISCOUNT =================
app.post("/admin/products/discount/:id", requireAdmin, async(req, res) => {
    try {
        const id = Number(req.params.id);
        const discount_percent = Math.max(0, Math.min(100, Number(req.body.discount_percent) || 0));

        await db.query(
            `
                UPDATE products
                SET discount_percent = ?
                WHERE id = ?
            `, [discount_percent, id]
        );

        res.redirect("/admin/products");
    } catch (err) {
        console.error("ADMIN UPDATE DISCOUNT ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= ADD PRODUCT =================
app.get("/admin/products/new", requireAdmin, (req, res) => {
    res.render("admin-product-new");
});

app.post("/admin/products/new", requireAdmin, async(req, res) => {
    try {
        const { name, old_price, price, image, image2, image3, image4, category, brand } = req.body;

        if (!name || !price || !image || !category || !brand) {
            return res.status(400).send("Vui lòng nhập đầy đủ thông tin sản phẩm");
        }

        await db.query(
            `
                INSERT INTO products (name, price, old_price, image, image2, image3, image4, category, brand)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                name,
                Number(price),
                Number(old_price || price),
                image,
                image2 || null,
                image3 || null,
                image4 || null,
                category,
                brand
            ]
        );

        res.redirect("/admin/products");
    } catch (err) {
        console.error("ADMIN NEW PRODUCT ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= EDIT PRODUCT =================
app.get("/admin/products/edit/:id", requireAdmin, async(req, res) => {
    try {
        const id = Number(req.params.id);

        const [rows] = await db.query(
            "SELECT * FROM products WHERE id = ?", [id]
        );

        const product = rows[0];

        if (!product) {
            return res.status(404).send("Không tìm thấy sản phẩm");
        }

        res.render("admin-product-edit", {
            product: normalizeProduct(product)
        });
    } catch (err) {
        console.error("ADMIN EDIT PAGE ERROR:", err);
        res.status(500).send("Database error");
    }
});

app.post("/admin/products/edit/:id", requireAdmin, async(req, res) => {
    try {
        const id = Number(req.params.id);
        const { name, old_price, price, image, image2, image3, image4, category, brand } = req.body;

        const [rows] = await db.query(
            "SELECT * FROM products WHERE id = ?", [id]
        );

        const product = rows[0];

        if (!product) {
            return res.status(404).send("Không tìm thấy sản phẩm");
        }

        await db.query(
            `
                UPDATE products
                SET name = ?, price = ?, old_price = ?, image = ?, image2 = ?, image3 = ?, image4 = ?, category = ?, brand = ?
                WHERE id = ?
            `, [
                name,
                Number(price),
                Number(old_price || price),
                image,
                image2 || null,
                image3 || null,
                image4 || null,
                category,
                brand,
                id
            ]
        );

        res.redirect("/admin/products");
    } catch (err) {
        console.error("ADMIN UPDATE PRODUCT ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= DELETE PRODUCT =================
app.post("/admin/products/delete/:id", requireAdmin, async(req, res) => {
    try {
        const id = Number(req.params.id);

        await db.query(
            "DELETE FROM products WHERE id = ?", [id]
        );

        res.redirect("/admin/products");
    } catch (err) {
        console.error("ADMIN DELETE PRODUCT ERROR:", err);
        res.status(500).send("Database error");
    }
});

// ================= RESET PRODUCTS =================
app.post("/admin/products/reset", requireAdmin, async(req, res) => {
    try {
        await db.query("DELETE FROM products");

        for (const p of defaultProducts) {
            await db.query(
                `
                    INSERT INTO products (name, price, old_price, image, image2, image3, image4, category, brand)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    p.name,
                    p.price || 0,
                    p.oldPrice || p.price || 0,
                    p.image || "",
                    p.image2 || null,
                    p.image3 || null,
                    p.image4 || null,
                    p.category || "",
                    p.brand || ""
                ]
            );
        }

        res.redirect("/admin/products");
    } catch (err) {
        console.error("ADMIN RESET PRODUCTS ERROR:", err);
        res.status(500).send("Database error");
    }
});
app.post("/webhooks/bank-transfer", async(req, res) => {
    try {
        const secret = req.headers["authorization"] || req.headers["x-api-key"] || "";
        if (secret !== "Bearer TKD_WEBHOOK_SECRET" && secret !== "TKD_WEBHOOK_SECRET") {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const payload = req.body;

        const transferType = String(payload.transferType || "").trim();
        const transferContent = String(payload.content || "").trim();
        const transferCode = String(payload.code || "").trim();
        const transferAmount = Number(payload.transferAmount || 0);

        if (transferType !== "in") {
            return res.status(200).json({ success: true, message: "Ignore outgoing transaction" });
        }

        const keyword = transferCode || transferContent;

        if (!keyword || !transferAmount) {
            return res.status(400).json({ success: false, message: "Missing webhook data" });
        }

        const [rows] = await db.query(
            `
            SELECT *
            FROM orders
            WHERE transfer_code = ?
              AND payment_status <> 'paid'
            LIMIT 1
            `, [keyword]
        );

        const order = rows[0];

        if (!order) {
            return res.status(200).json({ success: true, message: "No matching order" });
        }

        if (Number(order.final_total || 0) !== transferAmount) {
            return res.status(200).json({ success: true, message: "Amount mismatch" });
        }

        await db.query(
            `
            UPDATE orders
            SET payment_status = 'paid',
                status = 'confirmed'
            WHERE id = ?
            `, [order.id]
        );

        return res.status(200).json({
            success: true,
            message: "Payment confirmed automatically",
            orderId: order.id
        });
    } catch (err) {
        console.error("WEBHOOK ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});
// ================= START SERVER =================
app.listen(3000, () => {
    console.log("Server running: http://localhost:3000");
});