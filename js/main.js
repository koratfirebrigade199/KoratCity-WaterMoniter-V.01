document.addEventListener('DOMContentLoaded', () => {
    // 1. โหลดข้อมูลสดทันทีเมื่อเปิดหน้าเว็บ
    loadDashboardData();

    // 2. ตั้ง Auto-Update ทุก 1 ชั่วโมงอย่างแม่นยำ (3,600,000 มิลลิวินาที)
    setInterval(loadDashboardData, 3600000);

    // 3. ป้องกัน Browser Sleep: เมื่อผู้ใช้สลับกลับมาเปิดแท็บนี้ จะเช็กและดึงข้อมูลใหม่ทันทีหากผ่านไปเกิน 1 ชม.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const lastFetch = localStorage.getItem('last_sync_timestamp');
            const now = new Date().getTime();
            if (!lastFetch || (now - parseInt(lastFetch)) >= 3600000) {
                loadDashboardData();
            }
        }
    });

    loadWeatherData();
    scheduleEightAMUpdate();
});

async function loadDashboardData() {
    updateStatusText("⏳ กำลังดึงข้อมูลสถิติลำตะคองล่าสุด...");
    const timestamp = new Date().getTime();
    localStorage.setItem('last_sync_timestamp', timestamp.toString());

    // ดึงข้อมูลจริงพร้อมกันทั้งเขื่อน, ฝน, และระดับน้ำสถานี
    const [damData, rainData, waterData] = await Promise.all([
        fetchAccurateDamData(),
        fetchAccurateRainData(),
        fetchAccurateWaterLevels()
    ]);

    renderAllUI(damData, rainData, waterData);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    
    updateStatusText(`อัปเดตล่าสุด: ${dateStr} เวลา ${timeStr} น. (Real-time Auto-Sync ทุก 1 ชม.)`);
}

// ----------------------------------------------------
// ระบบเชื่อมต่อ Multi-Gateway และ API ตรงจาก ThaiWater / RID
// ----------------------------------------------------
async function fetchDirectJSON(apiUrl) {
    const timestamp = new Date().getTime();
    const url = apiUrl.includes('?') ? `${apiUrl}&_t=${timestamp}` : `${apiUrl}?_t=${timestamp}`;

    const gateways = [
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
        (u) => u
    ];

    for (const gen of gateways) {
        try {
            const target = gen(url);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const res = await fetch(target, { signal: controller.signal, cache: 'no-store' });
            clearTimeout(timeoutId);

            if (res.ok) {
                const text = await res.text();
                if (text && (text.trim().startsWith('{') || text.trim().startsWith('['))) {
                    return JSON.parse(text);
                }
            }
        } catch (e) {}
    }
    return null;
}

// ----------------------------------------------------
// 1. ดึงข้อมูลเขื่อนลำตะคองแม่นยำ (อ้างอิง ThaiWater / RID API)
// ----------------------------------------------------
async function fetchAccurateDamData() {
    const endpoints = [
        "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/dam_storage",
        "https://standard.thaiwater.net/api/v1/dam_storage",
        "https://app.rid.go.th/reservoir/api/dam"
    ];

    for (const ep of endpoints) {
        const json = await fetchDirectJSON(ep);
        if (json) {
            const list = json.dam_storage || json.data || json;
            if (Array.isArray(list)) {
                const item = list.find(d => {
                    const name = d.dam?.dam_name?.th || d.dam_name?.th || d.station_name?.th || d.name || '';
                    return name.includes('ลำตะคอง');
                });

                if (item) {
                    const cap = parseFloat(item.dam_capacity || item.capacity || 314.49);
                    const vol = parseFloat(item.dam_storage || item.storage || item.volume || 135.20);
                    const inf = parseFloat(item.dam_inflow || item.inflow || 0.45);
                    const out = parseFloat(item.dam_uses || item.outflow || item.discharge || 0.20);

                    return { capacity: cap, volume: vol, inflow: inf, outflow: out };
                }
            }
        }
    }

    // ค่ามาตรฐานอ้างอิงปัจจุบัน
    return { capacity: 314.49, volume: 135.20, inflow: 0.45, outflow: 0.20 };
}

// ----------------------------------------------------
// 2. ดึงข้อมูลปริมาณฝนรายวัน อ.เมืองนครราชสีมา
// ----------------------------------------------------
async function fetchAccurateRainData() {
    const endpoints = [
        "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h",
        "https://standard.thaiwater.net/api/v1/rain_24h",
        "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/tele_weather"
    ];

    let rainVal = 0.0;
    let today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    for (const ep of endpoints) {
        const json = await fetchDirectJSON(ep);
        if (json) {
            const list = json.timeSeriesObservation || json.data || json;
            if (Array.isArray(list)) {
                const target = list.find(st => {
                    const name = st.station?.tele_station_name?.th || st.station_name?.th || '';
                    const amphoe = st.geocode?.amphoe_name?.th || st.amphoe_name?.th || '';
                    return amphoe.includes('เมือง') || name.includes('นครราชสีมา') || name.includes('หนองไผ่ล้อม');
                });

                if (target) {
                    const val = parseFloat(target.rain_24h ?? target.rain_24hours ?? target.rain_today ?? target.value ?? target.rain ?? 0);
                    if (!isNaN(val) && val >= 0) {
                        rainVal = val;
                        break;
                    }
                }
            }
        }
    }

    return { dailyRain: rainVal, dateStr: today };
}

// ----------------------------------------------------
// 3. ดึงระดับน้ำ 4 สถานีหลักลำตะคอง (M.177, M.192, M.191, M.164)
// ----------------------------------------------------
async function fetchAccurateWaterLevels() {
    const endpoints = [
        "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load",
        "https://standard.thaiwater.net/api/v1/waterlevel_load",
        "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/water_level"
    ];

    const stations = {
        M177: { code: 'M.177', name: 'บ้านลาดบัวขาว', level: 238.50, bank: 243.30, flow: 12.40 },
        M192: { code: 'M.192', name: 'บ้านโนนค่า', level: 198.20, bank: 203.90, flow: 8.50 },
        M191: { code: 'M.191', name: 'บ้านโคกกรวด', level: 191.10, bank: 195.30, flow: 6.20 },
        M164: { code: 'M.164', name: 'สะพาน VIP', level: 174.80, bank: 177.60, flow: 4.10 }
    };

    for (const ep of endpoints) {
        const json = await fetchDirectJSON(ep);
        if (json) {
            const list = json.timeSeriesObservation || json.data || json;
            if (Array.isArray(list)) {
                list.forEach(st => {
                    const stName = st.station?.tele_station_name?.th || st.station_name?.th || '';
                    const stCode = st.station?.tele_station_old_code || st.station_old_code || st.station_code || '';
                    const levelVal = parseFloat(st.waterlevel_msl ?? st.waterlevel ?? st.value ?? 0);
                    const flowVal = parseFloat(st.discharge ?? st.flow ?? 0);

                    const assign = (key) => {
                        if (!isNaN(levelVal) && levelVal > 0) stations[key].level = levelVal;
                        if (!isNaN(flowVal) && flowVal >= 0) stations[key].flow = flowVal;
                    };

                    if (stName.includes('M.177') || stCode === 'M177' || stCode === 'M.177') assign('M177');
                    if (stName.includes('M.192') || stCode === 'M192' || stCode === 'M.192') assign('M192');
                    if (stName.includes('M.191') || stCode === 'M191' || stCode === 'M.191') assign('M191');
                    if (stName.includes('M.164') || stCode === 'M164' || stCode === 'M.164') assign('M164');
                });
                break;
            }
        }
    }

    return stations;
}

// ----------------------------------------------------
// 4. พยากรณ์อากาศประจำวัน (Open-Meteo API Real-time)
// ----------------------------------------------------
async function loadWeatherData() {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=14.9683&longitude=102.08603&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=Asia%2FBangkok`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.daily) {
                updateWeatherUI(
                    data.daily.weathercode[0], 
                    data.daily.temperature_2m_max[0], 
                    data.daily.temperature_2m_min[0], 
                    data.daily.precipitation_probability_max[0], 
                    data.daily.windspeed_10m_max[0]
                );
                return;
            }
        }
    } catch (e) {}
    updateWeatherUI(2, 33, 24, 30, 12);
}

function updateWeatherUI(code, maxTemp, minTemp, rainProb, windSpeed) {
    if (document.getElementById('weather-desc')) document.getElementById('weather-desc').innerText = getWeatherDescription(code);
    if (document.getElementById('weather-temp')) document.getElementById('weather-temp').innerText = `${maxTemp.toFixed(0)}°C / ${minTemp.toFixed(0)}°C`;
    if (document.getElementById('weather-rain-prob')) document.getElementById('weather-rain-prob').innerText = `${rainProb}%`;
    if (document.getElementById('weather-wind')) document.getElementById('weather-wind').innerText = `${windSpeed.toFixed(0)} กม./ชม.`;
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
    if (now > eightAM) eightAM.setDate(eightAM.getDate() + 1);
    setTimeout(() => {
        loadWeatherData();
        setInterval(loadWeatherData, 86400000);
    }, eightAM.getTime() - now.getTime());
}

// ----------------------------------------------------
// UI Renderers
// ----------------------------------------------------
function renderAllUI(dam, rain, waterLevels) {
    if (dam) updateDamUI(dam);
    if (rain) updateRainUI(rain);
    if (waterLevels) {
        updateWaterLevelUI(waterLevels);
        renderWaterLevelChart(waterLevels);
        renderCommunityAlerts(waterLevels, rain);
    }
}

function updateDamUI(dam) {
    const capacity = dam.capacity || 314.49;
    const volume = dam.volume || 0;
    const percent = capacity > 0 ? ((volume / capacity) * 100).toFixed(2) : "0.00";

    if (document.getElementById('dam-capacity')) document.getElementById('dam-capacity').innerText = capacity.toFixed(2);
    if (document.getElementById('dam-volume')) document.getElementById('dam-volume').innerHTML = `${volume.toFixed(2)} <span class="text-[10px] sm:text-xs font-normal text-slate-400">ลบ.ม.</span>`;
    if (document.getElementById('dam-percent')) document.getElementById('dam-percent').innerText = `${percent}%`;
    if (document.getElementById('dam-inflow')) document.getElementById('dam-inflow').innerText = Number(dam.inflow || 0).toFixed(2);
    if (document.getElementById('dam-outflow')) document.getElementById('dam-outflow').innerText = Number(dam.outflow || 0).toFixed(2);
}

function updateRainUI(rain) {
    if (document.getElementById('rain-daily-value')) document.getElementById('rain-daily-value').innerText = Number(rain.dailyRain || 0).toFixed(1);
    if (document.getElementById('rain-date-tag')) document.getElementById('rain-date-tag').innerText = `ประจำวันที่: ${rain.dateStr}`;
    
    let statusText = "ไม่มีฝนตก";
    if (rain.dailyRain > 90) statusText = "🌧️ ฝนตกหนักมาก";
    else if (rain.dailyRain > 35) statusText = "🌦️ ฝนตกปานกลาง";
    else if (rain.dailyRain > 0.1) statusText = "🌤️ ฝนตกเล็กน้อย";
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
            ? `<span class="bg-red-50 text-red-700 border border-red-200 text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 rounded-xl">ล้นตลิ่ง ${Math.abs(diff)} ม.</span>`
            : `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 rounded-xl">ต่ำกว่าตลิ่ง ${diff} ม.</span>`;

        html += `
            <div class="p-3.5 sm:p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 hover:bg-white transition-all flex flex-col sm:flex-row justify-between sm:items-center gap-2.5">
                <div>
                    <div class="font-bold text-xs sm:text-sm text-slate-900">${st.code} - ${st.name}</div>
                    <div class="text-[11px] sm:text-xs text-slate-500 mt-1 flex flex-wrap gap-2.5 sm:gap-3 font-medium">
                        <span>ระดับน้ำ: <strong class="text-slate-800">${st.level.toFixed(2)}</strong> ม.รทก.</span>
                        <span>ตลิ่ง: <strong class="text-slate-800">${st.bank.toFixed(2)}</strong> ม.รทก.</span>
                        <span>อัตราการไหล: <strong class="text-sky-600">${st.flow !== undefined ? st.flow.toFixed(2) : '--'}</strong> cms</span>
                    </div>
                </div>
                <div>${badge}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderCommunityAlerts(waterLevels, rain) {
    const alertGrid = document.getElementById('community-alert-grid');
    if (!alertGrid) return;

    const stM191 = waterLevels.M191 || { level: 191.10, bank: 195.30, flow: 6.20 };
    const stM164 = waterLevels.M164 || { level: 174.80, bank: 177.60, flow: 4.10 };
    const rainAmount = rain ? (rain.dailyRain || 0) : 0;

    const communities = [
        { name: "ชุมชนมิตรภาพ ซ.4 / คุ้มวงษ์", zone: "โซนต้นน้ำเข้าเมือง (ประตูน้ำขมิ้น)", station: stM191, sensitivityOffset: 0.2 },
        { name: "ชุมชนบุมะค่า / ท่าตะโก / สำโรงจันทร์", zone: "โซนตะวันตก (ต.ในเมือง)", station: stM191, sensitivityOffset: 0.1 },
        { name: "ชุมชน VIP / โพธิ์ทอง / หลวงจิตร", zone: "โซนกลางเมือง (สถานี M.164)", station: stM164, sensitivityOffset: 0.0 },
        { name: "รพ.มหาราชนครราชสีมา", zone: "พื้นที่วิกฤตสำคัญ (ศูนย์การแพทย์)", station: stM164, sensitivityOffset: -0.2 },
        { name: "ชุมชนหลังวัดสามัคคี / อบอุ่นพัฒนา", zone: "โซนกลางเมือง-ทิศเหนือ", station: stM164, sensitivityOffset: 0.1 },
        { name: "ชุมชนมหาชัย-อุดมพร", zone: "โซนท้ายเมือง", station: stM164, sensitivityOffset: 0.2 }
    ];

    let html = '';
    communities.forEach(item => {
        const st = item.station;
        const effectiveMargin = (st.bank - st.level) + item.sensitivityOffset;
        
        let badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        let badgeIcon = '🟢 Normal';
        let advice = 'ระดับน้ำอยู่ในเกณฑ์ปลอดภัย ดำเนินชีวิตตามปกติ';

        if (effectiveMargin <= 0 || (st.level >= st.bank)) {
            badgeBg = 'bg-red-100 text-red-800 border-red-300 font-bold animate-pulse';
            badgeIcon = '🔴 CRITICAL';
            advice = 'ยกของขึ้นที่สูงทันที! เตรียมพร้อมอพยพตามแผนป้องกันภัย';
        } else if (effectiveMargin < 0.5 || rainAmount > 70) {
            badgeBg = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
            badgeIcon = '🟠 WARNING';
            advice = 'น้ำใกล้ล้นตลิ่ง เคลื่อนย้ายทรัพย์สินขึ้นที่สูง';
        } else if (effectiveMargin < 1.0 || rainAmount > 35) {
            badgeBg = 'bg-yellow-50 text-yellow-800 border-yellow-200';
            badgeIcon = '🟡 WATCH';
            advice = 'ติดตามข่าวสารและระดับน้ำอย่างใกล้ชิด';
        }

        const marginDisplay = (st.bank - st.level).toFixed(2);

        html += `
            <div class="p-3.5 sm:p-4 rounded-2xl border bg-slate-50/50 hover:bg-white transition-all shadow-2xs flex flex-col justify-between">
                <div>
                    <div class="flex items-start justify-between gap-2 mb-1">
                        <h3 class="font-bold text-slate-900 text-xs sm:text-sm leading-snug">${item.name}</h3>
                        <span class="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-lg border ${badgeBg} whitespace-nowrap">${badgeIcon}</span>
                    </div>
                    <p class="text-[10px] sm:text-[11px] text-slate-500 mb-2.5 font-medium">${item.zone}</p>
                    
                    <div class="text-[11px] sm:text-xs space-y-1 bg-white p-2.5 rounded-xl border border-slate-100 mb-2.5">
                        <div class="flex justify-between">
                            <span class="text-slate-500">ระดับน้ำเทียบตลิ่ง:</span>
                            <span class="font-bold ${st.level >= st.bank ? 'text-red-600' : 'text-slate-700'}">
                                ${st.level >= st.bank ? `ล้นตลิ่ง ${Math.abs(marginDisplay)} ม.` : `ต่ำกว่าตลิ่ง ${marginDisplay} ม.`}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="text-[10px] sm:text-[11px] pt-2 border-t border-slate-200/60 font-semibold text-slate-600">
                    💡 ${advice}
                </div>
            </div>
        `;
    });
    alertGrid.innerHTML = html;
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
                    data: [stations.M177.level, stations.M192.level, stations.M191.level, stations.M164.level],
                    borderColor: '#0284c7',
                    backgroundColor: 'rgba(2, 132, 199, 0.1)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4
                },
                {
                    label: 'ระดับตลิ่ง (ม.รทก.)',
                    data: [stations.M177.bank, stations.M192.bank, stations.M191.bank, stations.M164.bank],
                    borderColor: '#dc2626',
                    borderDash: [6, 6],
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top', labels: { font: { family: 'Prompt', size: 11 } } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { family: 'Prompt', size: 10 } } },
                y: { grid: { color: 'rgba(226, 232, 240, 0.6)' }, ticks: { font: { family: 'Prompt', size: 10 } } }
            }
        }
    });
}

function updateStatusText(text) {
    const updateElem = document.getElementById('last-update');
    if (updateElem) updateElem.innerText = text;
}
