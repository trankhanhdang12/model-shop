function calculateDiscount(voucher, subtotal) {
    if (!voucher) return 0;

    let discount = 0;

    if (voucher.discount_type === "fixed") {
        discount = Number(voucher.discount_value || 0);
    } else if (voucher.discount_type === "percent") {
        discount = Math.floor(
            subtotal * Number(voucher.discount_value || 0) / 100
        );

        if (voucher.max_discount) {
            discount = Math.min(
                discount,
                Number(voucher.max_discount)
            );
        }
    }

    if (discount > subtotal) discount = subtotal;
    return discount;
}

function calculateShippingFee(subtotal) {
    return 30000;
}

module.exports = {
    calculateDiscount,
    calculateShippingFee
};