const express = require("express");
const crypto = require("crypto");
const db = require("../db");

const app = express();
const secret = process.env.SEPAY_WEBHOOK_SECRET;
const account = process.env.SEPAY_TEST_ACCOUNT;

if (!secret || !account) {
    console.error("Thiếu SEPAY_WEBHOOK_SECRET hoặc SEPAY_TEST_ACCOUNT");
    process.exit(1);
}

app.get("/health", (req, res) => {
    res.json({ ok: true, mode: "sandbox" });
});

app.post(
    "/webhooks/sepay",
    express.raw({ type: "application/json", limit: "32kb" }),
    async (req, res) => {
        try {
            const timestamp = req.get("X-SePay-Timestamp");
            const signature = req.get("X-SePay-Signature") || "";

            if (!/^\d+$/.test(timestamp || "") ||
                Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
                return res.status(401).json({ success: false });
            }

            const expected = "sha256=" + crypto
                .createHmac("sha256", secret)
                .update(timestamp + ".")
                .update(req.body)
                .digest("hex");

            const a = Buffer.from(signature);
            const b = Buffer.from(expected);

            if (a.length !== b.length ||
                !crypto.timingSafeEqual(a, b)) {
                return res.status(401).json({ success: false });
            }

            const data = JSON.parse(req.body.toString("utf8"));

            if (data.transferType !== "in" ||
                String(data.accountNumber) !== account ||
                !/^TKD\d{6,8}$/.test(data.code || "") ||
                !Number.isSafeInteger(data.transferAmount) ||
                data.transferAmount <= 0) {
                return res.status(200).json({ success: true });
            }

            const [result] = await db.query(
                `UPDATE orders
                 SET payment_status = 'paid'
                 WHERE transfer_code = ?
                   AND payment_method = 'online_sandbox'
                   AND payment_status = 'unpaid'
                   AND final_total = ?`,
                [data.code, data.transferAmount]
            );

            console.log("SePay verified webhook:", {
                code: data.code,
                updated: result.affectedRows
            });

            return res.json({ success: true });
        } catch (err) {
            console.error("Webhook error:", err.message);
            return res.status(500).json({ success: false });
        }
    }
);

app.listen(3001, "127.0.0.1", () => {
    console.log("SePay webhook listening on 3001");
});
