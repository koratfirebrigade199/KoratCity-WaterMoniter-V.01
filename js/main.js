document.addEventListener('DOMContentLoaded', () => {
    loadRealtimeData();
    setInterval(loadRealtimeData, 300000); // อัปเดตข้อมูลทุก 5 นาที
});

async function loadRealtimeData() {
    // 1. ดึงข้อมูลปริมาตรน้ำเขื่อนลำตะคองสดๆ จาก API ของ ThaiWater ผ่าน CORS Proxy
    const thaiWaterApi = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/dam_storage';
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(thaiWaterApi)}&_=${new Date().getTime()}`;

    let damData = {
        capacity: 314.49,
        volume: 0,
        inflow: 0,
        outflow: 0
    };

    let isApiSuccess = false;

    try {
        const response = await fetch(proxyUrl);
        if (response.ok) {
            const wrapper = await response.json();
            const result = JSON.parse(wrapper.contents);
            const dams = result.dam_storage || [];
            
            // ค้นหาเขื่อนลำตะคอง
            const lamTakhong = dams.find(d => {
                const name = d.dam?.dam_name?.th || '';
                return name.includes('ลำตะคอง');
            });

            if (lamTakhong) {
                damData.capacity = parseFloat(lamTakhong.dam_capacity) || 314.49;
                damData.volume = parseFloat(lamTakhong.dam_storage) || 0;
                damData.inflow = parseFloat(lamTakhong.dam_inflow) || 0;
                damData.outflow = parseFloat(lamTakhong.dam_uses) || 0; // ปริมาณน้ำระบาย
                isApiSuccess = true;
            }
        }
    } catch (err) {
        console.warn("ไม่สามารถยิงตรงหา API ThaiWater ได้ จะดึงจากไฟล์สำรองแทน:", err);
    }

    // 2. ดึงข้อมูลฝนและระดับน้ำในลำน้ำจาก latest_data.json (ใส่ timestamp เพื่อแก้ปัญหา Browser Cache ค้าง)
    try {
        const localRes = await fetch('data/latest_data.json?cache_bust=' + new Date().getTime());
        if (localRes.ok) {
            const localData = await localRes.json();
            
            // ถ้าดึง API สดไม่ผ่าน ให้ใช้ค่าจาก latest_data.json
            if (!isApiSuccess && localData.dam) {
                damData = localData.dam;
            }

            if (localData.rainfall) updateRainSection(localData.rainfall);
            if (localData.waterLevels) updateWaterLevelChart(localData.waterLevels);
            if (localData.waterLevels && localData.rainfall) {
                updateCommunityAlerts(localData.waterLevels, localData.rainfall.rain24h);
            }
        }
    } catch (err) {
        console.error("ดึงข้อมูล Local JSON ไม่สำเร็จ:", err);
    }

    // 3. แสดงผลข้อมูลเขื่อน + คิด % น้ำกักเก็บอย่างแม่นยำ
    updateDamSection(damData);

    // 4. แสดงเวลาอัปเดตปัจจุบัน
    const updateElem = document.getElementById('last-update');
    if (updateElem) {
        const now = new Date();
        updateElem.innerText = `อัปเดตล่าสุด: ${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})} น.`;
    }
}

// ฟังก์ชันคำนวณ % และแสดงผลข้อมูลน้ำในเขื่อน
function updateDamSection(damData) {
    const capacity = damData.capacity || 314.49;
    const volume = damData.volume || 0;
    
    // คำนวณเปอร์เซ็นต์อัตโนมัติ: (ปริมาตรน้ำจริง / ความจุอ่าง) * 100
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
