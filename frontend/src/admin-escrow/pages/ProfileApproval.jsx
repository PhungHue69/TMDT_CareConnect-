import { useState } from "react";
import { initialProfiles } from "../data/mockProfiles";

const statusLabels = {
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    rejected: "Đã từ chối",
};

const typeLabels = {
    doctor: "Bác sĩ — CCHN",
    pharmacy: "Nhà thuốc — GPP",
};

export default function ProfileApproval() {
    const [profiles, setProfiles] = useState(initialProfiles);
    const [selectedProfileId, setSelectedProfileId] = useState(null);

    const selectedProfile =
        profiles.find(profile => profile.id === selectedProfileId) ?? null;

    function changeStatus(id, status) {
        setProfiles(current =>
            current.map(profile =>
                profile.id === id ? { ...profile, status } : profile
            )
        );
    }

    function closeDetails() {
        setSelectedProfileId(null);
    }

    return (
        <section className="profile-approval">
            <h1>Duyệt hồ sơ CCHN/GPP</h1>

            <p className="demo-note">
                Dữ liệu minh họa. Thay đổi chỉ được lưu trong phiên hiện tại
                và sẽ mất khi tải lại trang.
            </p>

            <div className="profile-table-wrapper">
                <table className="profile-table">
                    <thead>
                        <tr>
                            <th>Mã hồ sơ</th>
                            <th>Tên</th>
                            <th>Loại</th>
                            <th>Số giấy phép</th>
                            <th>Trạng thái</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>

                    <tbody>
                        {profiles.map(profile => (
                            <tr
                                key={profile.id}
                                onClick={() => setSelectedProfileId(profile.id)}
                            >
                                <td>{profile.id}</td>
                                <td>{profile.name}</td>
                                <td>{typeLabels[profile.type]}</td>
                                <td>{profile.licenseNumber}</td>
                                <td>
                                    <span className={`profile-status ${profile.status}`}>
                                        {statusLabels[profile.status]}
                                    </span>
                                </td>
                                <td>
                                    <div className="profile-actions">
                                        <button
                                            type="button"
                                            onClick={event => {
                                                event.stopPropagation();
                                                setSelectedProfileId(profile.id);
                                            }}
                                        >
                                            Chi tiết
                                        </button>

                                        <button
                                            type="button"
                                            className="approve-button"
                                            disabled={profile.status !== "pending"}
                                            onClick={event => {
                                                event.stopPropagation();
                                                changeStatus(profile.id, "approved");
                                            }}
                                        >
                                            Duyệt
                                        </button>

                                        <button
                                            type="button"
                                            className="reject-button"
                                            disabled={profile.status !== "pending"}
                                            onClick={event => {
                                                event.stopPropagation();
                                                changeStatus(profile.id, "rejected");
                                            }}
                                        >
                                            Từ chối
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedProfile && (
                <dialog
                    open
                    className="profile-modal"
                    aria-labelledby="profile-detail-title"
                    onKeyDown={event => {
                        if (event.key === "Escape") closeDetails();
                    }}
                >
                    <div className="profile-modal-header">
                        <h2 id="profile-detail-title">Chi tiết hồ sơ</h2>
                        <button type="button" autoFocus onClick={closeDetails}>
                            Đóng
                        </button>
                    </div>

                    <dl className="profile-details">
                        <dt>Mã hồ sơ</dt>
                        <dd>{selectedProfile.id}</dd>

                        <dt>Tên</dt>
                        <dd>{selectedProfile.name}</dd>

                        <dt>Loại</dt>
                        <dd>{typeLabels[selectedProfile.type]}</dd>

                        <dt>Số giấy phép</dt>
                        <dd>{selectedProfile.licenseNumber}</dd>

                        <dt>Trạng thái</dt>
                        <dd>
                            <span className={`profile-status ${selectedProfile.status}`}>
                                {statusLabels[selectedProfile.status]}
                            </span>
                        </dd>
                    </dl>

                    <img
                        className="license-image"
                        src={selectedProfile.licenseImage}
                        alt={`Giấy phép minh họa của ${selectedProfile.name}`}
                    />
                </dialog>
            )}
        </section>
    );
}
