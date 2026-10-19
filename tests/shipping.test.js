const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateShippingFee } = require("../services/pricing");

test("Đơn 100000 đồng", () => {
    assert.equal(calculateShippingFee(100000), 30000);
});

test("Đơn 500000 đồng", () => {
    assert.equal(calculateShippingFee(500000), 30000);
});

test("Đơn 2000000 đồng", () => {
    assert.equal(calculateShippingFee(2000000), 30000);
});

test("Đơn giá trị 0", () => {
    assert.equal(calculateShippingFee(0), 30000);
});
