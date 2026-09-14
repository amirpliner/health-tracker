# מעקב אימונים, שינה והתאוששות

דשבורד אישי שמציג נתונים מ-Apple Watch: אימונים, שינה, וציון התאוששות מחושב (HRV + דופק מנוחה מול בייסליין אישי).

## איך זה עובד

1. **Health Auto Export** (אפליקציית iPhone) שולחת אוטומטית JSON עם נתוני בריאות ל-Worker.
2. **Cloudflare Worker** (`worker/`) קולט את הנתונים, שומר ב-D1, ומגיש API לדשבורד.
3. **הדשבורד** (הקבצים בשורש) הוא עמוד סטטי שמוצג ב-GitHub Pages וקורא מה-API.

## הגדרה (חד-פעמי)

### 1. Cloudflare
1. הרשמה חינמית ב-https://dash.cloudflare.com
2. **D1**: Workers & Pages → D1 → Create database (`health-tracker-db`) → בטאב Console הרץ את התוכן של `worker/migrations/0001_init.sql`.
3. **Worker**: Workers & Pages → Create → Import a repository → חבר את ריפו ה-GitHub הזה, ובחר את `worker/` כתיקיית הפריסה (Root directory).
4. חבר את מסד ה-D1 ל-Worker (Settings → Bindings → Add D1 binding, `binding = DB`), ועדכן את `database_id` ב-`worker/wrangler.toml` לפי הדשבורד.
5. הגדר משתני סוד (Settings → Variables → Add secret): `INGEST_SECRET` (מחרוזת אקראית ארוכה) ו-`READ_KEY` (מחרוזת אקראית נוספת).
6. עדכן את `ALLOWED_ORIGIN` ב-`wrangler.toml` לכתובת ה-GitHub Pages שלך (`https://<username>.github.io`).

### 2. הדשבורד
1. עדכן את `js/config.js`: `API_BASE` = כתובת ה-Worker (`https://health-tracker-api.<subdomain>.workers.dev`), `READ_KEY` = הערך שהגדרת ב-Cloudflare.
2. הפעל GitHub Pages לריפו (Settings → Pages → Deploy from branch → main → /root).

### 3. Health Auto Export
1. התקנה מה-App Store, רכישת Premium/Basic (נדרש לאוטומציית REST API - בדוק מחיר באפליקציה).
2. Automations → REST API → הגדר:
   - URL: `https://<worker-url>/ingest/health-auto-export`
   - Method: POST
   - Header: `Authorization: Bearer <INGEST_SECRET>`
   - Body: JSON (metrics: heart_rate_variability, resting_heart_rate, heart_rate, sleep_analysis; + workouts)
3. הרץ סנכרון ראשון וודא שהוא מגיע (אפשר לבדוק בטבלת `raw_ingest_log` ב-D1 Console).

**חשוב:** מבנה ה-JSON המדויק של Health Auto Export לא מתועד באופן מלא. אחרי הסנכרון הראשון, יש לבדוק את `raw_ingest_log` ולוודא שהשדות ב-`worker/src/index.js` (`pickNumber` וכו') תואמים בפועל, ולכוונן אם צריך.

## ציון ההתאוששות

מחושב מ-HRV ודופק מנוחה מול בייסליין מתגלגל של 30 יום. פחות מ-7 ימי היסטוריה → "בכיול". 7-14 יום → ציון "ראשוני". מעל 14 יום → ציון מלא. פירוט הנוסחה ב-`worker/src/index.js` (`computeScoreForDate`).
