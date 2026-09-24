document.addEventListener('DOMContentLoaded', () => {
    // โหลดข้อมูลล่าสุดมาแสดงผล
    fetchData();
    // ตั้งค่า Update ข้อมูลโดยอัตโนมัติทุก 1 ชั่วโมง (3,600,000 ms)
    setInterval(fetchData, 3600000);
});

async function fetchData() {
    try {
        // ดึงไฟล์ JSON ที่ถูกอัปเดตผ่าน GitHub Actions หรือ Backend
        const response = await fetch('./data/latest_data.json');
        const data = await response.json();
        
        updateRainSection(data.rainfall);
        updateDamSection(data.dam);
        updateWaterLevelChart(data.waterLevels);
        updateCommunityAlerts(data.waterLevels, data.rainfall.rain24h);

        document.getElementById('last-update').innerText = `อัปเดตล่าสุด: ${new Date().toLocaleTimeString('th-TH')} น.`;
    } catch (e) {
        console.error("เกิดข้อผิดพลาดในการโหลดข้อมูล:", e);
    }
}

function updateRainSection(rainData) {
    document.getElementById('rain-24h').innerHTML = `${rainData.rain24h.toFixed(1)} <span class="text-sm font-normal">มม.</span>`;
    
    let statusText = "ไม่มีฝนตก";
    if (rainData.rain24h > 90) statusText = "ฝนตกหนักมาก";
    else if (rainData.rain24h > 35) statusText = "ฝนตกปานกลางถึงหนัก";
    else if (rainData.rain24h > 10) statusText = "ฝนตกเล็กน้อย";
    
    document.getElementById('rain-status').innerText = statusText;

    // Render Rain Chart (24 ชั่วโมง)
    const ctx = document.getElementById('rainChart').getContext('2d');
    new Chart(ctx, {
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

function updateDamSection(damData) {
    document.getElementById('dam-volume').innerHTML = `${damData.volume} <span class="text-xs font-normal">ล้าน ลบ.ม.</span>`;
    document.getElementById('dam-percent').innerText = `${damData.percent}%`;
    document.getElementById('dam-inflow').innerHTML = `${damData.inflow} <span class="text-xs font-normal">ลบ.ม./วิ</span>`;
    document.getElementById('dam-outflow').innerHTML = `${damData.outflow} <span class="text-xs font-normal">ลบ.ม./วิ</span>`;
}

function updateWaterLevelChart(stations) {
    const ctx = document.getElementById('waterLevelChart').getContext('2d');
    new Chart(ctx, {
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

function updateCommunityAlerts(stations, rain24h) {
    const alertGrid = document.getElementById('alert-grid');
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