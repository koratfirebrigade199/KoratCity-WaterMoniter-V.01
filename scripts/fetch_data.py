import requests
import json
import os
from datetime import datetime

def fetch_thaiwater_data():
    # API เขื่อนขนาดใหญ่ของ ThaiWater
    dam_url = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/dam_storage"
    
    # ค่าเริ่มต้นเผื่อ API ขัดข้อง
    dam_data = {
        "name": "อ่างเก็บน้ำลำตะคอง ต.คลองไผ่ อ.สีคิ้ว",
        "sourceUrl": "https://www.thaiwater.net/water/dam/large",
        "capacity": 314.49,
        "volume": 0.0,
        "inflow": 0.0,
        "outflow": 0.0
    }

    try:
        res = requests.get(dam_url, timeout=10)
        if res.status_code == 200:
            data = res.json()
            # ค้นหาเขื่อนลำตะคอง (Dam ID หรือชื่อ)
            for dam in data.get('dam_storage', []):
                # ID เขื่อนลำตะคองในระบบ ThaiWater มักจะเป็นเขื่อนรหัสเฉพาะ หรือเช็คตามชื่อ
                dam_name = dam.get('dam', {}).get('dam_name', {}).get('th', '')
                if 'ลำตะคอง' in dam_name:
                    cap = float(dam.get('dam_capacity', 314.49))
                    vol = float(dam.get('dam_storage', 0.0))
                    inflow = float(dam.get('dam_inflow', 0.0))
                    outflow = float(dam.get('dam_uses', 0.0)) # ปริมาตรน้ำระบาย/ใช้น้ำ
                    
                    dam_data = {
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

    # โครงสร้าง JSON ฉบับเต็มที่จะถูกบันทึก
    output_data = {
        "updatedAt": datetime.now().isoformat(),
        "rainfall": {
            "stationName": "สถานีตรวจวัดนครนครราชสีมา ต.หนองไผ่ล้อม",
            "coordinates": {"lat": 14.9683, "lng": 102.08603},
            "rain24h": 0.0,
            "hourly": []
        },
        "dam": dam_data,
        "waterLevels": {
            "M177": {"name": "บ้านลาดบัวขาว ต.ลาดบัวขาว อ.สีคิ้ว", "level": 241.20, "bank": 243.30},
            "M192": {"name": "บ้านโนนค่า ต.บุ่งขี้เหล็ก อ.สูงเนิน", "level": 202.10, "bank": 203.90},
            "M191": {"name": "บ้านโคกกรวด ต.โคกกรวด อ.เมืองนครราชสีมา", "level": 193.80, "bank": 195.30},
            "M164": {"name": "สะพาน VIP ต.ในเมือง อ.เมืองนครราชสีมา", "level": 175.40, "bank": 177.60}
        }
    }

    # บันทึกลง data/latest_data.json
    os.makedirs('data', exist_ok=True)
    with open('data/latest_data.json', 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    fetch_thaiwater_data()