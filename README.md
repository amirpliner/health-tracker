# מעקב אימונים, שינה והתאוששות

דשבורד אישי שמציג נתונים מ-Apple Watch: אימונים, שינה, וציון התאוששות מחושב (HRV + דופק מנוחה מול בייסליין אישי).

## איך זה עובד

1. **Health Auto Export** (אפליקציית iPhone) שולחת אוטומטית JSON עם נתוני בריאות ל-Worker.
2. **Cloudflare Worker** (`worker/`) קולט את הנתונים, שומר ב-D1, ומגיש API לדשבורד.
3. **הדשבורד** (הקבצים בשורש) הוא עמוד סטטי שמוצג ב-GitHub Pages וקורא מה-API.

## הגדרה (בוצע/נעשה חד-פעמי)

### 1. Cloudflare
בפועל ה-Worker נפרס ישירות מהעורך המובנה בדשבורד של Cloudflare (Edit code → Deploy), **לא** מ-git integration/GitHub App - חיבור ה-GitHub App נתקל בבעיות פתיחת חלון popup באוטומציה, אז הקוד מודבק/מוקלד ישירות בעורך המובנה בכל פעם שהוא משתנה. `worker/wrangler.toml` נשאר בריפו כתיעוד/גיבוי בלבד (למקרה שירצה מישהו להתקין Node+wrangler בעתיד ולפרוס מהטרמינל).

1. חשבון Cloudflare + D1 database `health-tracker-db` (database_id: `999286a4-d8c0-4aa8-86ab-e946c348d327`) עם הטבלאות מ-`worker/migrations/0001_init.sql` (הורצו ב-Console).
2. Worker בשם `health-tracker-api`, קוד מ-`worker/src/index.js` מודבק/מוקלד ידנית ב-Edit code → Deploy.
3. D1 binding: `DB` → `health-tracker-db` (Bindings tab).
4. משתנים (Settings → Variables and secrets): `INGEST_SECRET` (Secret), `READ_KEY` (Variable), `ALLOWED_ORIGIN=https://amirpliner.github.io` (Variable).

**כדי לעדכן את קוד ה-Worker בעתיד:** לפתוח את ה-Worker בדשבורד → Edit code → למחוק הכל (Cmd+A, Delete) → להדביק/להקליד את התוכן המעודכן של `worker/src/index.js` → Deploy.

### 2. הדשבורד
`js/config.js` כבר מכיל את `API_BASE` (`https://health-tracker-api.yk4f5f7ydh.workers.dev`) ו-`READ_KEY` האמיתיים. GitHub Pages מופעל על הריפו (`amirpliner/health-tracker`, ציבורי) - כתובת: https://amirpliner.github.io/health-tracker/

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
