document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, 3600000); // อัปเดตอัตโนมัติทุก 1 ชั่วโมง
});

async function fetchData() {
    try {
        // ใช้ Relative Path ที่รองรับ GitHub Pages Sub-folder
        const response = await fetch('data/latest_data.json?t=' + new Date().getTime());
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        renderDashboard(data);
    } catch (e) {
        console.warn("ไม่สามารถดึงไฟล์ data/latest_data.json ได้ กำลังใช้ข้อมูลสำรองสำหรับแสดงผล:", e);
        // ข้อมูล Mockup สำหรับแสดงผลทันทีไม่ให้หน้าเว็บขาว
        const fallbackData = {
            rainfall: {
                rain24h: 35.0,
                hourly: Array.from({length: 24}, (_, i) => ({ time: `${i}:00`, val: Math.floor(Math.random() * 5) }))
            },
            dam: { volume: 248.65, percent: 79.06, inflow: 12.45, outflow: 4.50 },
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
    document.getElementById('last-update').innerText = `อัปเดตล่าสุด: ${new Date().toLocaleTimeString('th-TH')} น.`;
}

function updateRainSection(rainData) {
    const el = document.getElementById('rain-24h');
    if (el) el.innerHTML = `${rainData.rain24h.toFixed(1)} <span class="text-sm font-normal">มม.</span>`;
    
    let statusText = "ไม่มีฝนตก";
    if (rainData.rain24h > 90) statusText = "ฝนตกหนักมาก";
    else if (rainData.rain24h > 35) statusText = "ฝนตกปานกลางถึงหนัก";
    else if (rainData.rain24h > 10) statusText = "ฝนตกเล็กน้อย";
    
    const statusEl = document.getElementById('rain-status');
    if (statusEl) statusEl.innerText = statusText;

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
                    backgroundColor: '#3b82f6'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function updateDamSection(damData) {
    if (document.getElementById('dam-volume')) document.getElementById('dam-volume').innerHTML = `${damData.volume} <span class="text-xs font-normal">ล้าน ลบ.ม.</span>`;
    if (document.getElementById('dam-percent')) document.getElementById('dam-percent').innerText = `${damData.percent}%`;
    if (document.getElementById('dam-inflow')) document.getElementById('dam-inflow').innerHTML = `${damData.inflow} <span class="text-xs font-normal">ลบ.ม./วิ</span>`;
    if (document.getElementById('dam-outflow')) document.getElementById('dam-outflow').innerHTML = `${damData.outflow} <span class="text-xs font-normal">ลบ.ม./วิ</span>`;
}

function updateWaterLevelChart(stations) {
    const canvas = document.getElementById('waterLevelChart');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (window.waterChartObj) window.waterChartObj.destroy();
        window.waterChartObj = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['M177 (ลาดบัวขาว)', 'M192 (โนนค่า)', 'M191 (โคกกรวด)', 'M164 (ในเมือง)'],
                datasets: [
                    {
                        label: 'ระดับน้ำปัจจุบัน (ม.รทก.)',
                        data: [stations.M177.level, stations.M192.level, stations.M191.level, stations.M164.level],
                        borderColor: '#2563eb',
                        backgroundColor: '#3b82f644',
                        fill: true
                    },
                    {
                        label: 'ระดับตลิ่ง (ม.รทก.)',
                        data: [stations.M177.bank, stations.M192.bank, stations.M191.bank, stations.M164.bank],
                        borderColor: '#ef4444',
                        borderDash: [5, 5],
                        fill: false
                    }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
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
        card.className = `p-4 rounded-xl border ${evalResult.colorClass} flex justify-between items-center`;
        card.innerHTML = `
            <div>
                <h4 class="font-bold text-sm">${c.name}</h4>
                <p class="text-xs opacity-80">ระดับตลิ่งอ้างอิง: ${c.bankElevation} ม.รทก.</p>
                <span class="inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded bg-white/60">
                    ${evalResult.icon} ${evalResult.label}
                </span>
            </div>
        `;
        alertGrid.appendChild(card);
    });
}
