document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, 3600000); // อัปเดตข้อมูลอัตโนมัติทุก 1 ชั่วโมง (3,600,000 ms)
});

async function fetchData() {
    try {
        // ดึงข้อมูลล่าสุดจาก latest_data.json พร้อมป้องกัน Cache ด้วย Timestamp
        const response = await fetch('data/latest_data.json?t=' + new Date().getTime());
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        renderDashboard(data);
    } catch (e) {
        console.warn("ไม่สามารถดึงไฟล์ data/latest_data.json ได้ กำลังใช้ข้อมูลสำรองในการแสดงผล:", e);
        // ข้อมูลสำรอง กรณี GitHub Pages ยังหาไฟล์ JSON ไม่เจอ
        const fallbackData = {
            rainfall: {
                rain24h: 35.0,
                hourly: Array.from({length: 24}, (_, i) => ({ time: `${i}:00`, val: Math.floor(Math.random() * 5) }))
            },
            dam: { 
                name: "โครงการส่งน้ำและบำรุงรักษาลำตะคอง ต.คลองไผ่",
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
    if (rainElem) rainElem.innerHTML = `${rainData.rain24h.toFixed(1)} <span class="text-sm font-normal">มม.</span>`;
    
    let statusText = "ไม่มีฝนตก";
    if (rainData.rain24h > 90) statusText = "ฝนตกหนักมาก";
    else if (rainData.rain24h > 35) statusText = "ฝนตกปานกลางถึงหนัก";
    else if (rainData.rain24h > 10) statusText = "ฝนตกเล็กน้อย";
    
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
                    backgroundColor: '#3b82f6'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// ฟังก์ชันปรับแก้สำหรับแสดงข้อมูลอ่างเก็บน้ำลำตะคอง จากโครงการส่งน้ำและบำรุงรักษาลำตะคอง (RID)
function updateDamSection(damData) {
    const volElem = document.getElementById('dam-volume');
    if (volElem) volElem.innerHTML = `${damData.volume} <span class="text-xs font-normal">ล้าน ลบ.ม.</span>`;
    
    const pctElem = document.getElementById('dam-percent');
    if (pctElem) pctElem.innerText = `${damData.percent}%`;
    
    const inflowElem = document.getElementById('dam-inflow');
    if (inflowElem) inflowElem.innerHTML = `${damData.inflow} <span class="text-xs font-normal">ลบ.ม./วิ</span>`;
    
    const outflowElem = document.getElementById('dam-outflow');
    if (outflowElem) outflowElem.innerHTML = `${damData.outflow} <span class="text-xs font-normal">ลบ.ม./วิ</span>`;

    // อัปเดตลิงก์ที่มาเป็นโครงการส่งน้ำและบำรุงรักษาลำตะคอง (http://lamtakhong-omp.rid.go.th/Lamtakhong/index.php)
    const sourceLink = document.getElementById('dam-source-link');
    if (sourceLink) {
        sourceLink.href = "http://lamtakhong-omp.rid.go.th/Lamtakhong/index.php";
        sourceLink.innerText = "ที่มา: โครงการส่งน้ำและบำรุงรักษาลำตะคอง (กรมชลประทาน)";
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
