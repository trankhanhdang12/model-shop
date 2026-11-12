const test = require("node:test");
const assert = require("node:assert/strict");
const { checkPaymentResult } = require("../services/payment");

const order = {
    id: 10,
    final_total: 250000,
    payment_status: "unpaid"
};

const payment = {
    orderId: "10",
    amount: 250000,
    success: true,
    signatureVerified: true
};

test("Thanh toán hợp lệ", () => {
    assert.equal(checkPaymentResult(order, payment), true);
});

test("Sai số tiền", () => {
    assert.equal(checkPaymentResult(order, {
        ...payment, amount: 100000
    }), false);
});

test("Chữ ký chưa xác minh", () => {
    assert.equal(checkPaymentResult(order, {
        ...payment, signatureVerified: false
    }), false);
});

test("Đơn đã thanh toán", () => {
    assert.equal(checkPaymentResult({
        ...order, payment_status: "paid"
    }, payment), false);
});
