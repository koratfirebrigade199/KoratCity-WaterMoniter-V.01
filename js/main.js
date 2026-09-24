document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
    setInterval(loadDashboardData, 300000); // อัปเดตทุก 5 นาที
});

async function loadDashboardData() {
    updateStatusText("⏳ กำลังโหลดข้อมูลล่าสุด...");

    // 1. ดึงข้อมูลหลักจาก local JSON ก่อนเสมอ (การันตีว่าเว็บจะไม่ค้าง/ไม่ขาว)
    let localData = null;
    try {
        const cacheBuster = new Date().getTime();
        const res = await fetch(`data/latest_data.json?v=${cacheBuster}`);
        if (res.ok) {
            localData = await res.json();
        }
    } catch (err) {
        console.warn("ไม่สามารถดึงข้อมูลLocal JSON ได้:", err);
    }

    // 2. พยายามยิงดึงข้อมูลสดจาก API (ถ้าดึงไม่ได้จะเงียบๆ แล้วใช้ Local JSON แทน)
    let liveDam = await fetchLiveDamData();
    let liveRain = await fetchLiveRainData();

    // 3. รวมข้อมูล (ถ้า API สดได้ผล ให้ใช้ API สด ถ้าไม่ได้ให้ใช้ Local JSON)
    const finalDam = liveDam || (localData ? localData.dam : null);
    const finalRain = liveRain || (localData ? localData.rainfall : null);
    const finalWaterLevels = localData ? localData.waterLevels : null;

    // 4. Render แสดงผลบน UI
    if (finalDam) updateDamUI(finalDam);
    if (finalRain) updateRainUI(finalRain);
    if (finalWaterLevels) {
        updateWaterLevelUI(finalWaterLevels);
        renderWaterLevelChart(finalWaterLevels);
        
        // วิเคราะห์การเตือนภัยชุมชนอัตโนมัติ
        const rainVal = finalRain ? finalRain.rain24h : 0;
        updateCommunityAlerts(finalWaterLevels, rainVal);
    }

    // 5. แสดงเวลาอัปเดตบนหน้าจอ
    const updateElem = document.getElementById('last-update');
    if (updateElem) {
        const now = new Date();
        updateElem.innerText = `อัปเดตข้อมูล: ${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
    }
}

// ----------------------------------------------------
// API Fetchers (มี Try-Catch ป้องกันระบบล่ม)
// ----------------------------------------------------
async function fetchLiveDamData() {
    try {
        const targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/dam_storage';
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&_=${new Date().getTime()}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // Timeout ใน 4 วินาที

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
    } catch (e) {
        console.log("ใช้ข้อมูลสำรองเขื่อนแทน API");
    }
    return null;
}

async function fetchLiveRainData() {
    try {
        const targetUrl = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h';
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&_=${new Date().getTime()}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

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
    } catch (e) {
        console.log("ใช้ข้อมูลสำรองฝนแทน API");
    }
    return null;
}

// ----------------------------------------------------
// UI Renderers & Calculations
// ----------------------------------------------------
function updateDamUI(dam) {
    const capacity = dam.capacity || 314.49;
    const volume = dam.volume || 0;
    const percent = capacity > 0 ? ((volume / capacity) * 100).toFixed(2) : "0.00";

    if (document.getElementById('dam-capacity')) document.getElementById('dam-capacity').innerText = capacity.toFixed(2);
    if (document.getElementById('dam-volume')) document.getElementById('dam-volume').innerHTML = `${volume.toFixed(2)} <span class="text-xs font-normal text-slate-500">ล้าน ลบ.ม.</span>`;
    if (document.getElementById('dam-percent')) document.getElementById('dam-percent').innerText = `${percent}%`;
    if (document.getElementById('dam-inflow')) document.getElementById('dam-inflow').innerText = Number(dam.inflow || 0).toFixed(2);
    if (document.getElementById('dam-outflow')) document.getElementById('dam-outflow').innerText = Number(dam.outflow || 0).toFixed(2);
}

function updateRainUI(rain) {
    if (document.getElementById('rain-station-name')) document.getElementById('rain-station-name').innerText = rain.stationName || "ต.หนองไผ่ล้อม";
    if (document.getElementById('rain-24h')) document.getElementById('rain-24h').innerHTML = `${Number(rain.rain24h || 0).toFixed(1)} <span class="text-xs font-normal">มม.</span>`;
    
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

// ----------------------------------------------------
// รายชื่อชุมชนเสี่ยงในเขตเทศบาลนครนครราชสีมา (ริมลำน้ำลำตะคอง)
// ----------------------------------------------------
const COMMUNITIES = [
    { 
        name: 'ชุมชนมิตรภาพ ซอย 4 / คุ้มวงษ์', 
        stationRef: 'M164', 
        bankElevation: 177.00,
        desc: 'พื้นที่รับน้ำด่านแรกเมื่อน้ำเข้าเขตเทศบาลนครฯ'
    },
    { 
        name: 'ชุมชนบุมะค่า / ท่าตะโก / สำโรงจันทร์', 
        stationRef: 'M164', 
        bankElevation: 177.20,
        desc: 'จุดลุ่มต่ำลำน้ำโค้ง คอขวดลำตะคอง'
    },
    { 
        name: 'ชุมชน VIP / โพธิ์ทอง / หลวงจิตร', 
        stationRef: 'M164', 
        bankElevation: 177.60,
        desc: 'บริเวณจุดวัดระดับน้ำหลัก สถานี M.164 (สะพาน VIP)'
    },
    { 
        name: 'ชุมชนเกษตรสามัคคี / วัดสุสาน', 
        stationRef: 'M164', 
        bankElevation: 177.30,
        desc: 'พื้นที่ชุมชนหนาแน่นริมลำตะคองสายหลัก'
    },
    { 
        name: 'โรงพยาบาลมหาราชนครราชสีมา', 
        stationRef: 'M164', 
        bankElevation: 177.80,
        desc: 'พื้นที่ยุทธศาสตร์การแพทย์ เฝ้าระวังพนังกั้นน้ำ'
    },
    { 
        name: 'ชุมชนหลังวัดสามัคคี / อบอุ่นพัฒนา', 
        stationRef: 'M164', 
        bankElevation: 177.10,
        desc: 'โซนที่ลุ่มต่ำตอนกลางเมือง'
    },
    { 
        name: 'ชุมชนมหาชัย-อุดมพร', 
        stationRef: 'M164', 
        bankElevation: 176.90,
        desc: 'โซนรับน้ำปลายน้ำก่อนระบายออกนอกเขตเทศบาลฯ'
    }
];

function updateCommunityAlerts(stations, rain24h) {
    const alertGrid = document.getElementById('alert-grid');
    if (!alertGrid) return;
    alertGrid.innerHTML = '';

    COMMUNITIES.forEach(c => {
        const st = stations[c.stationRef];
        const currentWater = st ? st.level : 0;
        const margin = c.bankElevation - currentWater;

        let riskLevel = 'NORMAL';
        let label = `🟢 ปกติ (ต่ำกว่าตลิ่ง ${margin.toFixed(2)} ม.)`;
        let cardClass = 'bg-emerald-50/60 border-emerald-300 text-emerald-900';
        let badgeClass = 'bg-emerald-600 text-white';

        if (margin <= 0) {
            riskLevel = 'CRITICAL';
            label = `🔴 วิกฤต (ล้นตลิ่ง ${Math.abs(margin).toFixed(2)} ม.)`;
            cardClass = 'bg-red-50 border-red-400 text-red-900 shadow-sm animate-pulse';
            badgeClass = 'bg-red-600 text-white';
        } else if (margin <= 0.4 || rain24h >= 90) {
            riskLevel = 'WARNING';
            label = `🟠 เตือนภัย (ห่างตลิ่ง ${margin.toFixed(2)} ม.)`;
            cardClass = 'bg-orange-50 border-orange-400 text-orange-900';
            badgeClass = 'bg-orange-500 text-white';
        } else if (margin <= 1.2 || rain24h >= 35) {
            riskLevel = 'WATCH';
            label = `🟡 เฝ้าระวัง (ห่างตลิ่ง ${margin.toFixed(2)} ม.)`;
            cardClass = 'bg-amber-50 border-amber-400 text-amber-900';
            badgeClass = 'bg-amber-500 text-white';
        }

        const card = document.createElement('div');
        card.className = `p-4 rounded-xl border ${cardClass} transition duration-200 flex flex-col justify-between gap-3 backdrop-blur-xs`;
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start gap-2">
                    <h4 class="font-bold text-sm leading-snug text-slate-900">${c.name}</h4>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass} shrink-0">${riskLevel}</span>
                </div>
                <p class="text-xs opacity-80 mt-1.5">${c.desc}</p>
                <div class="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
                    <span>อ้างอิงสถานี: <strong>${c.stationRef}</strong></span>
                    <span>ระดับตลิ่ง: <strong>${c.bankElevation.toFixed(2)}</strong> ม.รทก.</span>
                </div>
            </div>
            <div class="pt-2 border-t border-black/10 font-bold text-xs flex justify-between items-center">
                <span>สถานะ:</span>
                <span>${label}</span>
            </div>
        `;
        alertGrid.appendChild(card);
    });
}
