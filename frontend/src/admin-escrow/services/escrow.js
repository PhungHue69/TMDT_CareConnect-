function kiemTraTien(value, tenKhoan) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${tenKhoan} phải là số nguyên không âm`);
    }
}

export function tinhHoaHong(subtotal, commissionRate) {
    kiemTraTien(subtotal, "Tiền hàng");

    if (
        !Number.isFinite(commissionRate) ||
        commissionRate < 5 ||
        commissionRate > 15
    ) {
        throw new Error("Hoa hồng phải từ 5% đến 15%");
    }

    return Math.round(subtotal * commissionRate / 100);
}

export function tinhTienDoiTac(order) {
    kiemTraTien(order.shippingCharged, "Ship khách trả");
    kiemTraTien(order.shippingActual, "Ship thực tế");

    const hoaHong = tinhHoaHong(
        order.subtotal,
        order.commissionRate
    );

    const tongKhachTra = order.subtotal + order.shippingCharged;

    if (!Number.isSafeInteger(tongKhachTra)) {
        throw new Error("Tổng thanh toán vượt giới hạn cho phép");
    }

    const tienDoiTac =
        tongKhachTra - order.shippingActual - hoaHong;

    if (!Number.isSafeInteger(tienDoiTac) || tienDoiTac < 0) {
        throw new Error("Tiền đối tác không hợp lệ");
    }

    return tienDoiTac;
}

export function hoanTatDon(state, orderId) {
    const order = state.orders.find(item => item.id === orderId);

    if (!order) {
        throw new Error("Không tìm thấy đơn hàng");
    }

    if (order.status !== "pending") {
        throw new Error("Chỉ được hoàn tất đơn đang giữ tiền");
    }

    const hoaHong = tinhHoaHong(
        order.subtotal,
        order.commissionRate
    );

    const tienDoiTac = tinhTienDoiTac(order);

    const soDuHienTai = state.wallets[order.partnerId] ?? 0;
    kiemTraTien(soDuHienTai, "Số dư ví");

    const soDuMoi = soDuHienTai + tienDoiTac;

    if (!Number.isSafeInteger(soDuMoi)) {
        throw new Error("Số dư ví vượt giới hạn cho phép");
    }

    return {
        ...state,

        orders: state.orders.map(item =>
            item.id === orderId
                ? {
                    ...item,
                    status: "completed",
                    hoaHong,
                    tienDoiTac,
                }
                : item
        ),

        wallets: {
            ...state.wallets,
            [order.partnerId]: soDuMoi,
        },
    };
}

export function tinhThongKe(orders) {
    return orders.reduce(
        (result, order) => {
            if (order.status === "pending") {
                result.dangGiu += order.subtotal + order.shippingCharged;
            }

            if (
                order.status === "completed" ||
                order.status === "paid_out"
            ) {
                result.hoaHongGhiNhan += order.hoaHong;
            }

            if (order.status === "paid_out") {
                result.daChiDoiTac += order.tienDoiTac;
            }

            return result;
        },
        {
            dangGiu: 0,
            hoaHongGhiNhan: 0,
            daChiDoiTac: 0,
        }
    );
}