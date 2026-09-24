document.addEventListener('DOMContentLoaded', () => {
    // 1. โหลดข้อมูลครั้งแรกทันที
    loadDashboardData();

    // 2. ตั้ง Auto-Update ทุก 1 ชั่วโมง (3,600,000 มิลลิวินาที)
    setInterval(loadDashboardData, 3600000);

    // 3. ป้องกันปัญหา Browser Sleep: เมื่อสลับแท็บกลับมาหน้าเว็บ ให้ตรวจว่าครบ 1 ชม. แล้วหรือยังเพื่อกดดึงทันที
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const lastFetch = localStorage.getItem('last_fetch_time');
            const now = new Date().getTime();
            // ถ้าดึงครั้งล่าสุดเกิน 1 ชม. (3600 วิ) ให้ดึงใหม่ทันที
            if (!lastFetch || (now - parseInt(lastFetch)) > 3600000) {
                loadDashboardData();
            }
        }
    });

    // 4. ตั้งระบบพยากรณ์อากาศรอบ 08.00 น.
    loadWeatherData();
    scheduleEightAMUpdate();
});

async function loadDashboardData() {
    updateStatusText("⏳ กำลังอัปเดตข้อมูลล่าสุด...");
    localStorage.setItem('last_fetch_time', new Date().getTime().toString());

    // 1. ดึง Local JSON มาสำรองไว้ก่อน
    let localData = null;
    try {
        const cacheBuster = new Date().getTime();
        const res = await fetch(`data/latest_data.json?v=${cacheBuster}`);
        if (res.ok) {
            localData = await res.json();
            renderAllUI(localData.dam, localData.rainfall, localData.waterLevels);
        }
    } catch (err) {
        console.warn("ไม่สามารถดึง Local JSON ได้:", err);
    }

    // 2. ดึงข้อมูลสดผ่าน Multi-CORS Proxy สลับอัตโนมัติหากติดปัญหา
    const [liveDam, liveRain, liveWater] = await Promise.all([
        fetchLiveDamData(),
        fetchLiveRainData(),
        fetchLiveWaterLevels()
    ]);

    // 3. นำข้อมูลสดมา Render ทับ (ถ้าดึงสดไม่สำเร็จ จะใช้ Local สำรอง)
    const finalDam = liveDam || (localData ? localData.dam : null);
    const finalRain = liveRain || (localData ? localData.rainfall : null);
    const finalWaterLevels = liveWater || (localData ? localData.waterLevels : null);

    renderAllUI(finalDam, finalRain, finalWaterLevels);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('th-TH');
    
    updateStatusText(`อัปเดตล่าสุด: ${dateStr} เวลา ${timeStr} น. (อัตโนมัติทุก 1 ชม.)`);
}

// ----------------------------------------------------
// ระบบ Fetch ข้อมูลพร้อม Proxy สำรอง (Fallback Multi-Proxy)
// ----------------------------------------------------
async function fetchWithFallback(targetUrl) {
    const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
    ];

    for (const proxy of proxies) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000); // ให้เวลา 4 วินาที

            const res = await fetch(`${proxy}&_t=${new Date().getTime()}`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const text = await res.text();
                return JSON.parse(text);
            }
        } catch (e) {
            // ลอง Proxy ตัวถัดไป
        }
    }
    return null;
}

async function fetchLiveDamData() {
    const data = await fetchWithFallback('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/dam_storage');
    if (data && data.dam_storage) {
        const lamTakhong = data.dam_storage.find(d => (d.dam?.dam_name?.th || '').includes('ลำตะคอง'));
        if (lamTakhong) {
            return {
                capacity: parseFloat(lamTakhong.dam_capacity) || 314.49,
                volume: parseFloat(lamTakhong.dam_storage) || 0,
                inflow: parseFloat(lamTakhong.dam_inflow) || 0,
                outflow: parseFloat(lamTakhong.dam_uses) || 0
            };
        }
    }
    return null;
}

async function fetchLiveRainData() {
    const data = await fetchWithFallback('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h');
    if (data && data.data) {
        const target = data.data.find(s => (s.station?.tele_station_name?.th || '').includes('หนองไผ่ล้อม'));
        if (target) {
            return {
                stationName: target.station?.tele_station_name?.th || "ต.หนองไผ่ล้อม",
                rain24h: parseFloat(target.rain_24h) || 0
            };
        }
    }
    return null;
}

async function fetchLiveWaterLevels() {
    const data = await fetchWithFallback('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load');
    if (data && data.data) {
        const stations = data.data;
        const result = {};

        const mappings = [
            { code: 'M177', key: 'M.177', name: 'บ้านลาดบัวขาว', bank: 243.30 },
            { code: 'M192', key: 'M.192', name: 'บ้านโนนค่า', bank: 203.90 },
            { code: 'M191', key: 'M.191', name: 'บ้านโคกกรวด', bank: 195.30 },
            { code: 'M164', key: 'M.164', name: 'สะพาน VIP', bank: 177.60 }
        ];

        mappings.forEach(m => {
            const st = stations.find(s => (s.station?.tele_station_name?.th || '').includes(m.key) || (s.station?.tele_station_old_code || '') === m.code);
            if (st) {
                result[m.code] = {
                    code: m.code,
                    name: m.name,
                    level: parseFloat(st.waterlevel_msl) || 0,
                    bank: m.bank
                };
            }
        });

        if (Object.keys(result).length > 0) return result;
    }
    return null;
}

// ----------------------------------------------------
// พยากรณ์อากาศกรมอุตุนิยมวิทยา (08:00 น.)
// ----------------------------------------------------
async function loadWeatherData() {
    try {
        const lat = 14.9799;
        const lon = 102.0978;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=Asia%2FBangkok`;

        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            const daily = data.daily;
            if (daily) {
                updateWeatherUI(daily.weathercode[0], daily.temperature_2m_max[0], daily.temperature_2m_min[0], daily.precipitation_probability_max[0], daily.windspeed_10m_max[0]);
                return;
            }
        }
    } catch (e) {
        console.warn("ดึงพยากรณ์อากาศล้มเหลว:", e);
    }
    updateWeatherUI(2, 33, 24, 40, 12);
}

function updateWeatherUI(code, maxTemp, minTemp, rainProb, windSpeed) {
    const descElem = document.getElementById('weather-desc');
    const tempElem = document.getElementById('weather-temp');
    const rainElem = document.getElementById('weather-rain-prob');
    const windElem = document.getElementById('weather-wind');
    const timeElem = document.getElementById('weather-update-time');

    if (descElem) descElem.innerText = getWeatherDescription(code);
    if (tempElem) tempElem.innerText = `${maxTemp.toFixed(0)}°C / ${minTemp.toFixed(0)}°C`;
    if (rainElem) rainElem.innerText = `${rainProb}%`;
    if (windElem) windElem.innerText = `${windSpeed.toFixed(0)} กม./ชม.`;

    if (timeElem) {
        const today = new Date();
        timeElem.innerText = `อัปเดต 08:00 น. (${today.toLocaleDateString('th-TH')})`;
    }
}

function getWeatherDescription(code) {
    if (code === 0) return "☀️ ท้องฟ้าแจ่มใส";
    if (code >= 1 && code <= 3) return "🌤️ มีเมฆบางส่วน";
    if (code >= 45 && code <= 48) return "🌫️ มีหมอกในตอนเช้า";
    if (code >= 51 && code <= 65) return "🌧️ ฝนตกเล็กน้อย ถึงปานกลาง";
    if (code >= 80 && code <= 82) return "🌦️ ฝนฟ้าคะนองบางแห่ง";
    if (code >= 95) return "⛈️ พายุฝนฟ้าคะนอง";
    return "⛅ อากาศเปลี่ยนแปลงตามฤดูกาล";
}

function scheduleEightAMUpdate() {
    const now = new Date();
    const eightAM = new Date();
    eightAM.setHours(8, 0, 0, 0);

    if (now > eightAM) {
        eightAM.setDate(eightAM.getDate() + 1);
    }

    const timeUntil8AM = eightAM.getTime() - now.getTime();
    setTimeout(() => {
        loadWeatherData();
        setInterval(loadWeatherData, 24 * 60 * 60 * 1000);
    }, timeUntil8AM);
}

// ----------------------------------------------------
// UI Renderers & Chart
// ----------------------------------------------------
function renderAllUI(dam, rain, waterLevels) {
    if (dam) updateDamUI(dam);
    if (rain) updateRainUI(rain);
    if (waterLevels) {
        updateWaterLevelUI(waterLevels);
        renderWaterLevelChart(waterLevels);
    }
}

function updateDamUI(dam) {
    const capacity = dam.capacity || 314.49;
    const volume = dam.volume || 0;
    const percent = capacity > 0 ? ((volume / capacity) * 100).toFixed(2) : "0.00";

    if (document.getElementById('dam-capacity')) document.getElementById('dam-capacity').innerText = capacity.toFixed(2);
    if (document.getElementById('dam-volume')) document.getElementById('dam-volume').innerHTML = `${volume.toFixed(2)} <span class="text-xs font-normal text-slate-500">มล.ลบ.ม.</span>`;
    if (document.getElementById('dam-percent')) document.getElementById('dam-percent').innerText = `${percent}%`;
    if (document.getElementById('dam-inflow')) document.getElementById('dam-inflow').innerText = Number(dam.inflow || 0).toFixed(2);
    if (document.getElementById('dam-outflow')) document.getElementById('dam-outflow').innerText = Number(dam.outflow || 0).toFixed(2);
}

function updateRainUI(rain) {
    if (document.getElementById('rain-station-name')) document.getElementById('rain-station-name').innerText = rain.stationName || "ต.หนองไผ่ล้อม";
    if (document.getElementById('rain-24h')) document.getElementById('rain-24h').innerHTML = `${Number(rain.rain24h || 0).toFixed(1)} <span class="text-xs font-normal text-slate-500">มม.</span>`;
    
    let statusText = "ไม่มีฝนตก";
    if (rain.rain24h > 90) statusText = "🌧️ ฝนตกหนักมาก";
    else if (rain.rain24h > 35) statusText = "🌦️ ฝนตกปานกลาง";
    else if (rain.rain24h > 0.1) statusText = "🌤️ ฝนตกเล็กน้อย";
    if (document.getElementById('rain-status')) document.getElementById('rain-status').innerText = statusText;
}

function updateWaterLevelUI(stations) {
    const container = document.getElementById('water-level-details');
    if (!container) return;

    let html = '';
    Object.keys(stations).forEach(k => {
        const st = stations[k];
        if (!st) return;

        const diff = (st.bank - st.level).toFixed(2);
        const isOverflow = st.level >= st.bank;
        const badge = isOverflow 
            ? `<span class="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-md">ล้นตลิ่ง ${Math.abs(diff)} ม.</span>`
            : `<span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-md">ต่ำกว่าตลิ่ง ${diff} ม.</span>`;

        html += `
            <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <div>
                    <div class="font-bold text-sm text-slate-800">${st.code || k} - ${st.name}</div>
                    <div class="text-xs text-slate-500 mt-0.5">ระดับน้ำ: <strong>${st.level.toFixed(2)}</strong> ม.รทก. | ระดับตลิ่ง: <strong>${st.bank.toFixed(2)}</strong> ม.รทก.</div>
                </div>
                <div>${badge}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderWaterLevelChart(stations) {
    const canvas = document.getElementById('waterLevelChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    if (window.waterChartObj) window.waterChartObj.destroy();

    window.waterChartObj = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['M.177 ลาดบัวขาว', 'M.192 โนนค่า', 'M.191 โคกกรวด', 'M.164 VIP'],
            datasets: [
                {
                    label: 'ระดับน้ำปัจจุบัน (ม.รทก.)',
                    data: [
                        stations.M177 ? stations.M177.level : 0,
                        stations.M192 ? stations.M192.level : 0,
                        stations.M191 ? stations.M191.level : 0,
                        stations.M164 ? stations.M164.level : 0
                    ],
                    borderColor: '#0284c7',
                    backgroundColor: 'rgba(2, 132, 199, 0.15)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'ระดับตลิ่ง (ม.รทก.)',
                    data: [
                        stations.M177 ? stations.M177.bank : 243.30,
                        stations.M192 ? stations.M192.bank : 203.90,
                        stations.M191 ? stations.M191.bank : 195.30,
                        stations.M164 ? stations.M164.bank : 177.60
                    ],
                    borderColor: '#dc2626',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } }
        }
    });
}

function updateStatusText(text) {
    const updateElem = document.getElementById('last-update');
    if (updateElem) updateElem.innerText = text;
}
