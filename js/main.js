document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, 60000); // อัปเดตข้อมูลอัตโนมัติทุก 1 นาที
});

async function fetchData() {
    try {
        // ต่อ Cache Buster timestamp เพื่อป้องกันการดึงค่าค้างในเบราว์เซอร์
        const cacheBuster = new Date().getTime();
        const response = await fetch(`data/latest_data.json?v=${cacheBuster}`);
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        const data = await response.json();
        renderDashboard(data);
    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการดึงข้อมูล:", error);
    }
}

function renderDashboard(data) {
    if (!data) return;

    if (data.dam) updateDamSection(data.dam);
    if (data.rainfall) updateRainSection(data.rainfall);
    if (data.waterLevels) {
        updateWaterLevelChart(data.waterLevels);
        renderWaterLevelList(data.waterLevels); // แสดงตารางเปรียบเทียบระดับตลิ่ง
    }
    
    if (data.waterLevels && data.rainfall && typeof COMMUNITIES !== 'undefined' && typeof evaluateCommunityRisk === 'function') {
        updateCommunityAlerts(data.waterLevels, data.rainfall.rain24h);
    }

    const updateElem = document.getElementById('last-update');
    if (updateElem) {
        const updateDate = data.updatedAt ? new Date(data.updatedAt) : new Date();
        updateElem.innerText = `อัปเดตล่าสุด: ${updateDate.toLocaleDateString('th-TH')} ${updateDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
    }
}

// 1. คำนวณ % เขื่อนลำตะคอง
function updateDamSection(damData) {
    const capacity = damData.capacity || 314.49;
    const volume = damData.volume || 0;
    
    // (ปริมาตรน้ำในอ่าง / ความจุอ่าง) * 100
    const calculatedPercent = capacity > 0 ? ((volume / capacity) * 100).toFixed(2) : "0.00";

    const capElem = document.getElementById('dam-capacity');
    if (capElem) capElem.innerText = capacity.toFixed(2);

    const volElem = document.getElementById('dam-volume');
    if (volElem) volElem.innerHTML = `${volume.toFixed(2)} <span class="text-xs font-normal text-slate-500">ล้าน ลบ.ม.</span>`;
    
    const pctElem = document.getElementById('dam-percent');
    if (pctElem) pctElem.innerText = `${calculatedPercent}%`;
    
    const inflowElem = document.getElementById('dam-inflow');
    if (inflowElem) inflowElem.innerHTML = `${Number(damData.inflow || 0).toFixed(2)} <span class="text-xs font-normal text-slate-500">ล้าน ลบ.ม./วัน</span>`;
    
    const outflowElem = document.getElementById('dam-outflow');
    if (outflowElem) outflowElem.innerHTML = `${Number(damData.outflow || 0).toFixed(2)} <span class="text-xs font-normal text-slate-500">ล้าน ลบ.ม./วัน</span>`;
}

// 2. สถานีวัดน้ำฝน ต.หนองไผ่ล้อม
function updateRainSection(rainData) {
    const stationNameElem = document.getElementById('rain-station-name');
    if (stationNameElem && rainData.stationName) {
        stationNameElem.innerText = rainData.stationName;
    }

    const rainElem = document.getElementById('rain-24h');
    if (rainElem) rainElem.innerHTML = `${Number(rainData.rain24h || 0).toFixed(1)} <span class="text-xs font-normal">มม.</span>`;
    
    let statusText = "ไม่มีฝนตก";
    if (rainData.rain24h > 90) statusText = "🌧️ ฝนตกหนักมาก";
    else if (rainData.rain24h > 35) statusText = "🌦️ ฝนตกปานกลาง";
    else if (rainData.rain24h > 0.1) statusText = "🌤️ ฝนตกเล็กน้อย";
    
    const statusElem = document.getElementById('rain-status');
    if (statusElem) statusElem.innerText = statusText;

    if (rainData.hourly && rainData.hourly.length > 0 && typeof Chart !== 'undefined') {
        const canvas = document.getElementById('rainChart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (window.rainChartObj) window.rainChartObj.destroy();
            window.rainChartObj = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: rainData.hourly.map(h => h.time),
                    datasets: [{
                        label: 'ปริมาณฝน (มม.)',
                        data: rainData.hourly.map(h => h.val),
                        backgroundColor: '#3b82f6',
                        borderRadius: 4
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    }
}

// 3. คำนวณระดับน้ำเทียบระดับตลิ่ง (ม.รทก.)
function renderWaterLevelList(stations) {
    const container = document.getElementById('water-level-details');
    if (!container) return;

    let html = '';
    Object.keys(stations).forEach(key => {
        const st = stations[key];
        const diff = (st.bank - st.level).toFixed(2);
        const isOverflow = st.level >= st.bank;
        const statusBadge = isOverflow 
            ? `<span class="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded">ล้นตลิ่ง ${Math.abs(diff)} ม.</span>`
            : `<span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded">ต่ำกว่าตลิ่ง ${diff} ม.</span>`;

        html += `
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <div>
                    <div class="font-bold text-sm text-slate-800">${st.code || key} - ${st.name}</div>
                    <div class="text-xs text-slate-500">ระดับน้ำ: <strong>${st.level.toFixed(2)}</strong> ม.รทก. | ระดับตลิ่ง: <strong>${st.bank.toFixed(2)}</strong> ม.รทก.</div>
                </div>
                <div>${statusBadge}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function updateWaterLevelChart(stations) {
    const canvas = document.getElementById('waterLevelChart');
    if (!canvas || typeof Chart === 'undefined') return;
    
    const ctx = canvas.getContext('2d');
    if (window.waterChartObj) window.waterChartObj.destroy();
    window.waterChartObj = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [
                'M.177 (ลาดบัวขาว)', 
                'M.192 (โนนค่า)', 
                'M.191 (โคกกรวด)', 
                'M.164 (สะพาน VIP)'
            ],
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
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#0284c7'
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
                    borderDash: [6, 4],
                    borderWidth: 2,
                    fill: false,
                    pointStyle: 'rectRot',
                    pointRadius: 5,
                    pointBackgroundColor: '#dc2626'
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: {
                y: { grid: { color: '#f1f5f9' }, title: { display: true, text: 'ระดับน้ำ (ม.รทก.)', font: { size: 11 } } },
                x: { grid: { display: false } }
            }
        }
    });
}
