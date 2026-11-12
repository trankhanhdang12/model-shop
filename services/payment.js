function validatePaymentAmount(amount) {
    return Number.isSafeInteger(amount) && amount > 0;
}

function checkPaymentResult(order, payment) {
    if (!order || !payment) return false;

    return (
        payment.signatureVerified === true &&
        payment.success === true &&
        payment.orderId === String(order.id) &&
        validatePaymentAmount(payment.amount) &&
        payment.amount === Number(order.final_total) &&
        order.payment_status === "unpaid"
    );
}

module.exports = {
    validatePaymentAmount,
    checkPaymentResult
};
