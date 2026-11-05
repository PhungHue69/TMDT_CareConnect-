import { useState } from "react";
import {
    plans,
    demoCareCoinBalance,
} from "../data/mockPlans";

export default function PlansAndCoins() {
    const [notice, setNotice] = useState("");

    function handleRegister(plan) {
        setNotice(
            `Bạn vừa chọn gói ${plan.name}. Đây là bản demo, ` +
            "chưa tạo đăng ký hoặc phát sinh thanh toán. " +
            "Giá và quyền lợi đang được cập nhật."
        );
    }

    return (
        <section className="plans-page">
            <header className="plans-header">
                <h1>Gói dịch vụ & CareCoin</h1>
                <p>
                    Thông tin các gói đang được hoàn thiện.
                    Nội dung hiện tại phục vụ minh họa giao diện.
                </p>
            </header>

            <div className="plan-grid">
                {plans.map(plan => (
                    <article className="plan-card" key={plan.id}>
                        <h2>{plan.name}</h2>

                        <p className="plan-price">{plan.priceLabel}</p>

                        <p className="plan-description">
                            {plan.description}
                        </p>

                        <ul className="plan-benefits">
                            {plan.benefits.map(benefit => (
                                <li key={benefit}>{benefit}</li>
                            ))}
                        </ul>

                        <button
                            type="button"
                            className="plan-button"
                            onClick={() => handleRegister(plan)}
                        >
                            {plan.buttonLabel}
                            <span className="plan-demo-label"> — Demo</span>
                        </button>
                    </article>
                ))}
            </div>

            <div
                className="plan-notice"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {notice}
            </div>

            <section
                className="carecoin-card"
                aria-labelledby="carecoin-title"
            >
                <div>
                    <span className="carecoin-demo">Dữ liệu mẫu</span>
                    <h2 id="carecoin-title">CareCoin</h2>

                    <p className="carecoin-balance">
                        {demoCareCoinBalance.toLocaleString("vi-VN")}
                        <span> CareCoin</span>
                    </p>
                </div>

                <div className="carecoin-description">
                    <p>
                        Tích xu từ các hoạt động đủ điều kiện theo
                        chính sách CareConnect.
                    </p>
                    <p>
                        Quy tắc sử dụng và quy đổi đang được cập nhật.
                    </p>
                </div>
            </section>
        </section>
    );
}