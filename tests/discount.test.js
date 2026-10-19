const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateDiscount } = require("../services/pricing");

test("Không có voucher", () => {
    assert.equal(calculateDiscount(null, 500000), 0);
});

test("Voucher cố định", () => {
    assert.equal(calculateDiscount({
        discount_type: "fixed",
        discount_value: 50000
    }, 500000), 50000);
});

test("Giảm không vượt quá tổng đơn", () => {
    assert.equal(calculateDiscount({
        discount_type: "fixed",
        discount_value: 600000
    }, 500000), 500000);
});

test("Voucher giảm 10%", () => {
    assert.equal(calculateDiscount({
        discount_type: "percent",
        discount_value: 10
    }, 500000), 50000);
});

test("Giới hạn giảm tối đa", () => {
    assert.equal(calculateDiscount({
        discount_type: "percent",
        discount_value: 20,
        max_discount: 70000
    }, 500000), 70000);
});

test("Làm tròn xuống", () => {
    assert.equal(calculateDiscount({
        discount_type: "percent",
        discount_value: 15
    }, 101), 15);
});

test("Loại voucher không hợp lệ", () => {
    assert.equal(calculateDiscount({
        discount_type: "unknown",
        discount_value: 100
    }, 500000), 0);
});
