import test from "node:test";
import assert from "node:assert/strict";

import { initialOrders } from "../data/mockOrders.js";
import {
    tinhHoaHong,
    tinhTienDoiTac,
    hoanTatDon,
} from "./escrow.js";

function taoState() {
    return {
        orders: initialOrders.map(order => ({ ...order })),
        wallets: {},
    };
}

test("tính đúng tiền cho ba đơn mẫu", () => {
    const expected = [
        { hoaHong: 28000, tienDoiTac: 252000 },
        { hoaHong: 30000, tienDoiTac: 170000 },
        { hoaHong: 5000, tienDoiTac: 95000 },
    ];

    initialOrders.forEach((order, index) => {
        assert.equal(
            tinhHoaHong(order.subtotal, order.commissionRate),
            expected[index].hoaHong
        );

        assert.equal(
            tinhTienDoiTac(order),
            expected[index].tienDoiTac
        );
    });
});

test("hoàn tất đơn lưu kết quả và cộng đúng ví", () => {
    const before = taoState();
    const after = hoanTatDon(before, "DH001");

    assert.equal(after.orders[0].status, "completed");
    assert.equal(after.orders[0].hoaHong, 28000);
    assert.equal(after.orders[0].tienDoiTac, 252000);
    assert.equal(after.wallets.NT001, 252000);

    // Các đơn khác không bị thay đổi.
    assert.equal(after.orders[1].status, "pending");

    // Dữ liệu đầu vào không bị sửa trực tiếp.
    assert.equal(before.orders[0].status, "pending");
    assert.deepEqual(before.wallets, {});
});

test("hoàn tất hai lần không cộng ví hai lần", () => {
    const state = hoanTatDon(taoState(), "DH001");

    assert.throws(
        () => hoanTatDon(state, "DH001"),
        /Chỉ được hoàn tất/
    );

    assert.equal(state.wallets.NT001, 252000);
});

test("chặn đơn không tồn tại", () => {
    assert.throws(
        () => hoanTatDon(taoState(), "KHONG-TON-TAI"),
        /Không tìm thấy/
    );
});

test("chặn đơn đã hoàn tiền hoặc đã chi trả", () => {
    for (const status of ["refunded", "paid_out"]) {
        const state = taoState();
        state.orders[0].status = status;

        assert.throws(
            () => hoanTatDon(state, "DH001"),
            /Chỉ được hoàn tất/
        );

        assert.deepEqual(state.wallets, {});
    }
});

test("ship thực tế khác ship khách trả vẫn tính đúng", () => {
    const order = {
        ...initialOrders[0],
        shippingActual: 50000,
    };

    assert.equal(tinhTienDoiTac(order), 242000);
});

test("chặn dữ liệu tiền và tỷ lệ không hợp lệ", () => {
    assert.throws(() => tinhHoaHong(-1, 10));
    assert.throws(() => tinhHoaHong(280000, 20));
    assert.throws(() =>
        tinhTienDoiTac({
            ...initialOrders[0],
            shippingActual: -1,
        })
    );
});