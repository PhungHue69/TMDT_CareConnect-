/* CareConnect - chuông báo realtime (Server-Sent Events) và âm thanh chuông */
(function () {
    const CC = (window.CC = window.CC || {});

    // ------------------------------------------------------------------ Âm thanh
    // Dùng Web Audio để không cần file âm thanh. Trình duyệt chỉ cho phát sau lần chạm/bấm đầu tiên.
    let ctx = null;
    function audio() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
        window.addEventListener(ev, () => audio(), { once: true, passive: true })
    );

    function tone(freq, start, duration) {
        const ac = audio();
        if (!ac) return;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ac.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.35, ac.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
        osc.connect(gain).connect(ac.destination);
        osc.start(ac.currentTime + start);
        osc.stop(ac.currentTime + start + duration + 0.05);
    }

    let ringTimer = null;
    CC.sound = {
        ding() { tone(880, 0, 0.25); tone(1175, 0.18, 0.35); },
        alert() { [0, 0.3, 0.6].forEach((t) => tone(988, t, 0.2)); },
        startRing() {
            if (ringTimer) return;
            const ring = () => { tone(784, 0, 0.3); tone(988, 0.25, 0.3); tone(1175, 0.5, 0.45); };
            ring();
            ringTimer = setInterval(ring, 2200);
            if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
        },
        stopRing() {
            clearInterval(ringTimer);
            ringTimer = null;
        },
    };

    // ------------------------------------------------------------------ Kênh realtime
    const listeners = [];
    let source = null;

    CC.realtime = {
        on(fn) { listeners.push(fn); },
        connect() {
            if (source || !CC.auth.token || !window.EventSource) return;
            source = new EventSource('/api/notifications/stream?token=' + encodeURIComponent(CC.auth.token));
            source.addEventListener('notification', (e) => {
                let n;
                try { n = JSON.parse(e.data); } catch (err) { return; }
                listeners.forEach((fn) => fn(n));
                window.dispatchEvent(new CustomEvent('cc:notification', { detail: n }));
                showSystemNotification(n);
            });
            // EventSource tự kết nối lại khi mất mạng
        },
    };

    // Hiện thông báo của hệ điều hành khi tab đang ẩn (người dùng cần cho phép trước)
    function showSystemNotification(n) {
        if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
        try { new Notification(n.title, { body: n.body || '', tag: 'cc-' + n.id }); } catch (e) { /* bỏ qua */ }
    }

    CC.requestSystemNotifications = async function () {
        if (!('Notification' in window)) {
            CC.toast('Trình duyệt này không hỗ trợ thông báo hệ thống', 'error');
            return false;
        }
        const result = await Notification.requestPermission();
        return result === 'granted';
    };
})();
