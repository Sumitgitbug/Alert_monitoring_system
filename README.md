# RCB Alert Monitoring System

Python + React app for monitoring devices by IP address.

## Backend

```powershell
pip install -r requirements.txt
python app.py
```

Backend runs on `http://127.0.0.1:5050`.

## Frontend

```powershell
npm install
npm run dev
```

Frontend runs on `http://127.0.0.1:5178`.

## Bulk Upload Columns

Excel `.xlsx` or CSV files can include:

- `device_name` or `name`
- `type`
- `ip_address` or `ip`
- `location`

