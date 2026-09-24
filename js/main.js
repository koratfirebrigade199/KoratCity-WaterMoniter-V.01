document.addEventListener('DOMContentLoaded', () => {
    // 1. โหลดข้อมูลน้ำครั้งแรกทันที
    loadDashboardData();
    
    // 2. ตั้งเวลา Auto-Update ข้อมูลน้ำทุก 1 ชั่วโมง (3,600,000 ms)
    setInterval(loadDashboardData, 3600000);

    // 3. โหลดและตั้งระบบอัปเดตพยากรณ์อากาศรอบ 08:00 น.
    loadWeatherData();
    scheduleEightAMUpdate();
});

async function loadDashboardData() {
    updateStatusText("⏳ กำลังโหลดข้อมูล...");

    let localData = null;

    // โหลดข้อมูล Local ทันทีเพื่อความรวดเร็ว
    try {
        const cacheBuster = new Date().getTime();
        const res = await fetch(`data/latest_data.json?v=${cacheBuster}`);
        if (res.ok) {
            localData = await res.json();
            renderAllUI(localData.dam, localData.rainfall, localData.waterLevels);
            if (localData.updatedAt) {
                const updatedDate = new Date(localData.updatedAt);
                updateStatusText(`ข้อมูลล่าสุด: ${updatedDate.toLocaleDateString('th-TH')} ${updatedDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`);
            }
        }
    } catch (err) {
        console.warn("ไม่สามารถดึงข้อมูล Local JSON ได้:", err);
    }

    // ยิง API ดึงข้อมูลสด (Timeout 2 วินาที)
    const [liveDam, liveRain] = await Promise.all([
        fetchLiveDamData(),
        fetchLiveRainData()
    ]);

    if (liveDam || liveRain) {
        const finalDam = liveDam || (localData ? localData.dam : null);
        const finalRain = liveRain || (localData ? localData.rainfall : null);
        const finalWaterLevels = localData ? localData.waterLevels : null;

        renderAllUI(finalDam, finalRain, finalWaterLevels);

        const now = new Date();
        updateStatusText(`อัปเดตสด: ${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น. (รีเฟรชทุก 1 ชม.)`);
    }
}

// ----------------------------------------------------
// ระบบพยากรณ์อากาศกรมอุตุนิยมวิทยา (เทศบาลนครนครราชสีมา)
// ----------------------------------------------------
async function loadWeatherData() {
    try {
        // ใช้ Open-Meteo API อ้างอิงพิกัด อ.เมืองนครราชสีมา (14.97, 102.10)
        const lat = 14.9799;
        const lon = 102.0978;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=Asia%2FBangkok`;

        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            const daily = data.daily;
            if (daily) {
                const weatherCode = daily.weathercode[0];
                const maxTemp = daily.temperature_2m_max[0];
                const minTemp = daily.temperature_2m_min[0];
                const rainProb = daily.precipitation_probability_max[0];
                const windSpeed = daily.windspeed_10m_max[0];

                updateWeatherUI(weatherCode, maxTemp, minTemp, rainProb, windSpeed);
                return;
            }
        }
    } catch (e) {
        console.warn("ไม่สามารถดึงพยากรณ์อากาศสดได้ ใช้ค่าสำรองแทน:", e);
    }

    // ค่าสำรองกรณี API มีปัญหา
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

// ตั้งเวลาสั่งงานให้ดึงพยากรณ์อากาศใหม่เมื่อถึงเวลา 08:00 น. ของทุกวัน
function scheduleEightAMUpdate() {
    const now = new Date();
    const eightAM = new Date();
    eightAM.setHours(8, 0, 0, 0);

    if (now > eightAM) {
        eightAM.setDate(eightAM.getDate() + 1); // ถ้าเลย 8 โมงวันนี้ไปแล้ว ให้ตั้งเป็น 8 โมงวันพรุ่งนี้
    }

    const timeUntil8AM = eightAM.getTime() - now.getTime();
    setTimeout(() => {
        loadWeatherData();
        setInterval(loadWeatherData, 24 * 60 * 60 * 1000); // วนรอบลูปทุก 24 ชม.
    }, timeUntil8AM);
}

function renderAllUI(dam, rain, waterLevels) {
    if (dam) updateDamUI(dam);
    if (rain) updateRainUI(rain);
    if (waterLevels) {
        updateWaterLevelUI(waterLevels);
        renderWaterLevelChart(waterLevels);
    }
}

// ----------------------------------------------------
// API Fetchers & UI Renderers อื่นๆ
// ----------------------------------------------------
async function fetchLiveDamData() {
    try {
        const targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/dam_storage';
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&_=${new Date().getTime()}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const json = await res.json();
            const data = JSON.parse(json.contents);
            const dams = data.dam_storage || [];
            const lamTakhong = dams.find(d => (d.dam?.dam_name?.th || '').includes('ลำตะคอง'));
            
            if (lamTakhong) {
                return {
                    capacity: parseFloat(lamTakhong.dam_capacity) || 314.49,
                    volume: parseFloat(lamTakhong.dam_storage) || 0,
                    inflow: parseFloat(lamTakhong.dam_inflow) || 0,
                    outflow: parseFloat(lamTakhong.dam_uses) || 0
                };
            }
        }
    } catch (e) {}
    return null;
}

async function fetchLiveRainData() {
    try {
        const targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h';
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&_=${new Date().getTime()}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const json = await res.json();
            const data = JSON.parse(json.contents);
            const stations = data.data || [];
            const target = stations.find(s => (s.station?.tele_station_name?.th || '').includes('หนองไผ่ล้อม'));
            
            if (target) {
                return {
                    stationName: target.station?.tele_station_name?.th || "ต.หนองไผ่ล้อม",
                    rain24h: parseFloat(target.rain_24h) || 0
                };
            }
        }
    } catch (e) {}
    return null;
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
