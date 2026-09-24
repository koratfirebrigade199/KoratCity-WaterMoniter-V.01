import requests
import json
import os
from datetime import datetime

def fetch_data():
    # API อ่างเก็บน้ำขนาดใหญ่จาก ThaiWater (สสน.)
    url = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/dam_storage"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    # ค่าเริ่มต้นเผื่อ API ขัดข้อง
    dam_info = {
        "name": "อ่างเก็บน้ำลำตะคอง ต.คลองไผ่ อ.สีคิ้ว",
        "sourceUrl": "https://www.thaiwater.net/water/dam/large",
        "capacity": 314.49,
        "volume": 0.0,
        "inflow": 0.0,
        "outflow": 0.0
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code == 200:
            res_json = response.json()
            dam_list = res_json.get('dam_storage', [])
            
            # ค้นหาเขื่อนลำตะคอง (Dam ID 12 หรือเช็คจากชื่อ)
            for dam in dam_list:
                dam_name = dam.get('dam', {}).get('dam_name', {}).get('th', '')
                if 'ลำตะคอง' in dam_name:
                    cap = float(dam.get('dam_capacity', 314.49))
                    vol = float(dam.get('dam_storage', 0.0))
                    inflow = float(dam.get('dam_inflow', 0.0))
                    outflow = float(dam.get('dam_uses', 0.0)) # ปริมาตรน้ำระบาย/ใช้น้ำประจำวัน

                    dam_info = {
                        "name": "อ่างเก็บน้ำลำตะคอง ต.คลองไผ่ อ.สีคิ้ว",
                        "sourceUrl": "https://www.thaiwater.net/water/dam/large",
                        "capacity": round(cap, 2),
                        "volume": round(vol, 2),
                        "inflow": round(inflow, 2),
                        "outflow": round(outflow, 2)
                    }
                    break
    except Exception as e:
        print(f"Error fetching dam data: {e}")

    # โครงสร้างไฟล์ JSON รวมที่จะถูกเขียนทับ
    full_data = {
        "updatedAt": datetime.now().isoformat(),
        "dam": dam_info,
        "rainfall": {
            "stationName": "สถานี ต.หนองไผ่ล้อม อ.เมืองนครราชสีมา",
            "rain24h": 0.0,
            "hourly": []
        },
        "waterLevels": {
            "M177": {"level": 241.20, "bank": 243.30},
            "M192": {"level": 202.10, "bank": 203.90},
            "M191": {"level": 193.80, "bank": 195.30},
            "M164": {"level": 175.40, "bank": 177.60}
        }
    }

    os.makedirs('data', exist_ok=True)
    with open('data/latest_data.json', 'w', encoding='utf-8') as f:
        json.dump(full_data, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    fetch_data()
