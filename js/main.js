document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, 300000); // เช็คการอัปเดตทุก 5 นาที
});

async function fetchData() {
    try {
        // เติม ?t=timestamp เพื่อบังคับไม่ให้ Browser จำ Cache เดิม
        const response = await fetch('data/latest_data.json?t=' + new Date().getTime());
        
        if (!response.ok) {
            throw new Error(`HTTP status: ${response.status}`);
        }
        
        const data = await response.json();
        renderDashboard(data);
    } catch (e) {
        console.error("ดึงข้อมูลไม่สำเร็จ:", e);
    }
}

function renderDashboard(data) {
    if (data.dam) updateDamSection(data.dam);
    if (data.rainfall) updateRainSection(data.rainfall);
    if (data.waterLevels) updateWaterLevelChart(data.waterLevels);
    if (data.waterLevels && data.rainfall) updateCommunityAlerts(data.waterLevels, data.rainfall.rain24h);
    
    // แสดงเวลาที่ระบบไปดึงข้อมูลจริงจาก ThaiWater
    const updateElem = document.getElementById('last-update');
    if (updateElem) {
        const updateDate = data.updatedAt ? new Date(data.updatedAt) : new Date();
        updateElem.innerText = `ข้อมูลอัปเดตเมื่อ: ${updateDate.toLocaleDateString('th-TH')} ${updateDate.toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})} น.`;
    }
}

function updateDamSection(damData) {
    const capacity = damData.capacity || 314.49;
    const volume = damData.volume || 0;
    
    // คำนวณ % กักเก็บจริง = (น้ำในอ่าง / ความจุอ่าง) * 100
    const percent = capacity > 0 ? ((volume / capacity) * 100).toFixed(2) : "0.00";

    const capElem = document.getElementById('dam-capacity');
    if (capElem) capElem.innerText = capacity.toFixed(2);

    const volElem = document.getElementById('dam-volume');
    if (volElem) volElem.innerHTML = `${volume.toFixed(2)} <span class="text-xs font-normal text-slate-500">ล้าน ลบ.ม.</span>`;
    
    const pctElem = document.getElementById('dam-percent');
    if (pctElem) pctElem.innerText = `${percent}%`;
    
    const inflowElem = document.getElementById('dam-inflow');
    if (inflowElem) inflowElem.innerHTML = `${Number(damData.inflow || 0).toFixed(2)} <span class="text-xs font-normal text-slate-500">ล้าน ลบ.ม./วัน</span>`;
    
    const outflowElem = document.getElementById('dam-outflow');
    if (outflowElem) outflowElem.innerHTML = `${Number(damData.outflow || 0).toFixed(2)} <span class="text-xs font-normal text-slate-500">ล้าน ลบ.ม./วัน</span>`;

    const sourceLink = document.getElementById('dam-source-link');
    if (sourceLink && damData.sourceUrl) {
        sourceLink.href = damData.sourceUrl;
    }
}

function updateRainSection(rainData) {
    const rainElem = document.getElementById('rain-24h');
    if (rainElem) rainElem.innerHTML = `${(rainData.rain24h || 0).toFixed(1)} <span class="text-xs font-normal">มม.</span>`;
    
    let statusText = "ไม่มีฝนตก";
    if (rainData.rain24h > 90) statusText = "🌧️ ฝนตกหนักมาก";
    else if (rainData.rain24h > 35) statusText = "🌦️ ฝนตกปานกลาง";
    else if (rainData.rain24h > 0.1) statusText = "🌤️ ฝนตกเล็กน้อย";
    
    const statusElem = document.getElementById('rain-status');
    if (statusElem) statusElem.innerText = statusText;

    if (rainData.hourly && rainData.hourly.length > 0) {
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

function updateWaterLevelChart(stations) {
    const canvas = document.getElementById('waterLevelChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (window.waterChartObj) window.waterChartObj.destroy();
    window.waterChartObj = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [
                'M.177 ลาดบัวขาว (อ.สีคิ้ว)', 
                'M.192 โนนค่า (อ.สูงเนิน)', 
                'M.191 โคกกรวด (อ.เมือง)', 
                'M.164 VIP (ต.ในเมือง)'
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

function updateCommunityAlerts(stations, rain24h) {
    const alertGrid = document.getElementById('alert-grid');
    if (!alertGrid || typeof COMMUNITIES === 'undefined') return;
    alertGrid.innerHTML = '';

    COMMUNITIES.forEach(c => {
        const currentWater = stations[c.stationRef] ? stations[c.stationRef].level : 0;
        const evalResult = evaluateCommunityRisk(c, currentWater, rain24h || 0);

        const card = document.createElement('div');
        card.className = `p-3.5 rounded-xl border ${evalResult.colorClass} flex justify-between items-center shadow-xs transition hover:shadow-md`;
        card.innerHTML = `
            <div class="space-y-1">
                <h4 class="font-bold text-xs sm:text-sm leading-tight">${c.name}</h4>
                <p class="text-[11px] opacity-75">ระดับตลิ่งอ้างอิง: <strong>${c.bankElevation}</strong> ม.รทก.</p>
                <div class="pt-0.5">
                    <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/70 shadow-2xs">
                        ${evalResult.icon} ${evalResult.label}
                    </span>
                </div>
            </div>
        `;
        alertGrid.appendChild(card);
    });
}
