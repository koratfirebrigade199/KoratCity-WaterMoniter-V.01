document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, 3600000); // ตั้งค่า Update ข้อมูลโดยอัตโนมัติทุก 1 ชั่วโมง
});

async function fetchData() {
    try {
        // ดึงข้อมูลล่าสุดจาก data/latest_data.json พร้อมป้องกัน Cache
        const response = await fetch('data/latest_data.json?t=' + new Date().getTime());
        
        if (!response.ok) {
            throw new Error(`HTTP status: ${response.status}`);
        }
        
        const data = await response.json();
        renderDashboard(data);
    } catch (e) {
        console.warn("ดึงข้อมูลจากไฟล์ latest_data.json ไม่สำเร็จ ใช้ชุดข้อมูลสำรองสำหรับแสดงผล:", e);
        // ชุดข้อมูลสำรองกรณี GitHub Pages ยังอัปเดตไฟล์ JSON ไม่เสร็จ
        const fallbackData = {
            rainfall: {
                rain24h: 32.5,
                hourly: [
                    { time: "00:00", val: 0.0 }, { time: "02:00", val: 0.0 }, { time: "04:00", val: 1.5 },
                    { time: "06:00", val: 4.2 }, { time: "08:00", val: 12.0 }, { time: "10:00", val: 8.5 },
                    { time: "12:00", val: 3.1 }, { time: "14:00", val: 2.0 }, { time: "16:00", val: 1.2 }
                ]
            },
            dam: { 
                name: "โครงการส่งน้ำและบำรุงรักษาลำตะคอง ต.คลองไผ่ อ.สีคิ้ว",
                sourceUrl: "http://lamtakhong-omp.rid.go.th/Lamtakhong/index.php",
                capacity: 314.49,
                volume: 248.65, 
                percent: 79.06, 
                inflow: 12.45, 
                outflow: 4.50 
            },
            waterLevels: {
                M177: { level: 241.20, bank: 243.30 },
                M192: { level: 202.10, bank: 203.90 },
                M191: { level: 193.80, bank: 195.30 },
                M164: { level: 175.40, bank: 177.60 }
            }
        };
        renderDashboard(fallbackData);
    }
}

function renderDashboard(data) {
    updateRainSection(data.rainfall);
    updateDamSection(data.dam);
    updateWaterLevelChart(data.waterLevels);
    updateCommunityAlerts(data.waterLevels, data.rainfall.rain24h);
    
    const updateElem = document.getElementById('last-update');
    if (updateElem) {
        updateElem.innerText = `อัปเดตล่าสุด: ${new Date().toLocaleTimeString('th-TH')} น.`;
    }
}

function updateRainSection(rainData) {
    const rainElem = document.getElementById('rain-24h');
    if (rainElem) rainElem.innerHTML = `${rainData.rain24h.toFixed(1)} <span class="text-xs font-normal">มม.</span>`;
    
    let statusText = "ไม่มีฝนตก";
    if (rainData.rain24h > 90) statusText = "🌧️ ฝนตกหนักมาก";
    else if (rainData.rain24h > 35) statusText = "🌦️ ฝนตกปานกลาง";
    else if (rainData.rain24h > 0.1) statusText = "🌤️ ฝนตกเล็กน้อย";
    
    const statusElem = document.getElementById('rain-status');
    if (statusElem) statusElem.innerText = statusText;

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

function updateDamSection(damData) {
    const volElem = document.getElementById('dam-volume');
    if (volElem) volElem.innerHTML = `${damData.volume} <span class="text-xs font-normal text-slate-500">ล้าน ม.³</span>`;
    
    const pctElem = document.getElementById('dam-percent');
    if (pctElem) pctElem.innerText = `${damData.percent}%`;
    
    const inflowElem = document.getElementById('dam-inflow');
    if (inflowElem) inflowElem.innerHTML = `${damData.inflow} <span class="text-xs font-normal text-slate-500">ลบ.ม./วิ</span>`;
    
    const outflowElem = document.getElementById('dam-outflow');
    if (outflowElem) outflowElem.innerHTML = `${damData.outflow} <span class="text-xs font-normal text-slate-500">ลบ.ม./วิ</span>`;

    const sourceLink = document.getElementById('dam-source-link');
    if (sourceLink && damData.sourceUrl) {
        sourceLink.href = damData.sourceUrl;
    }
}

function updateWaterLevelChart(stations) {
    const canvas = document.getElementById('waterLevelChart');
    if (canvas) {
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
                plugins: {
                    legend: { position: 'top' }
                },
                scales: {
                    y: { 
                        grid: { color: '#f1f5f9' },
                        title: { display: true, text: 'ระดับน้ำ (ม.รทก.)', font: { size: 11 } }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

function updateCommunityAlerts(stations, rain24h) {
    const alertGrid = document.getElementById('alert-grid');
    if (!alertGrid) return;
    alertGrid.innerHTML = '';

    COMMUNITIES.forEach(c => {
        const currentWater = stations[c.stationRef] ? stations[c.stationRef].level : 0;
        const evalResult = evaluateCommunityRisk(c, currentWater, rain24h);

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
